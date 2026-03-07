import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { DatabaseService } from '../../database/database.service';
import { OracleStorageService } from '../imageUploads/oracle-storage.service';
import { products } from '../../database/schema/products.schema';
import { scanHistory } from '../../database/schema/scan-history.schema';
import { scannedLabels } from '../../database/schema/labels.schema';
import { scannedIngredients } from '../../database/schema/ingredients.schema';
import { scannedPrescriptions } from '../../database/schema/prescriptions.schema';
import { medications } from '../../database/schema/medications.schema';
import { images } from '../../database/schema/images.schema';
import { userSummaries } from '../../database/schema/user-summaries.schema';
import { eq, and, inArray, desc, aliasedTable, sql } from 'drizzle-orm';
import { PDFParse } from 'pdf-parse';
import { firstValueFrom } from 'rxjs';
import { ProductScanDto } from './dto/product-scan.dto';
import { PrescriptionScanDto } from './dto/prescription-scan.dto';
import { LabReportScanDto } from './dto/lab-report-scan.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { UpdateLabelDto } from './dto/update-label.dto';
import { UpdateIngredientDto } from './dto/update-ingredient.dto';
import { UpdatePrescriptionDto } from './dto/update-prescription.dto';
import { UpdateMedicationDto } from './dto/update-medication.dto';

@Injectable()
export class ScansService {
  private readonly logger = new Logger(ScansService.name);

  constructor(
    private readonly dbService: DatabaseService,
    private readonly oracleStorage: OracleStorageService,
    private readonly httpService: HttpService,
  ) {}

  async getScans(userId: string) {
    const db = this.dbService.db;
    const backImages = aliasedTable(images, 'back_images');

    // 1. Fetch Scans + Front/Back Images + Products
    const scans = await db
      .select({
        scan: scanHistory,
        frontImage: images,
        backImage: backImages,
        product: products,
      })
      .from(scanHistory)
      .leftJoin(images, eq(scanHistory.imageId, images.id))
      .leftJoin(backImages, eq(scanHistory.backImageId, backImages.id))
      .leftJoin(products, eq(scanHistory.productId, products.id))
      .where(eq(scanHistory.userId, userId))
      .orderBy(desc(scanHistory.scannedAt));

    if (scans.length === 0) {
      return [];
    }

    const scanIds = scans.map((s) => s.scan.id);

    // 2. Fetch related data
    const [labels, ingredients, prescriptions] = await Promise.all([
      db
        .select()
        .from(scannedLabels)
        .where(inArray(scannedLabels.scanId, scanIds)),
      db
        .select()
        .from(scannedIngredients)
        .where(inArray(scannedIngredients.scanId, scanIds)),
      db
        .select()
        .from(scannedPrescriptions)
        .where(inArray(scannedPrescriptions.scanId, scanIds)),
    ]);

    const prescriptionIds = prescriptions.map((p) => p.id);
    let meds: (typeof medications.$inferSelect)[] = [];
    if (prescriptionIds.length > 0) {
      meds = (await db
        .select()
        .from(medications)
        .where(
          inArray(medications.prescriptionId, prescriptionIds),
        )) as (typeof medications.$inferSelect)[];
    }

    // 3. Generate pre-signed URLs for all images (front + back) in parallel
    const allImageKeys = scans.flatMap((s) =>
      [s.frontImage?.oracleKey, s.backImage?.oracleKey].filter(
        (key): key is string => !!key,
      ),
    );
    const uniqueKeys = [...new Set(allImageKeys)];

    const preSignedMap = new Map<string, string>();
    if (uniqueKeys.length) {
      const urls = await Promise.all(
        uniqueKeys.map((key) => this.oracleStorage.getPreSignedUrl(key)),
      );
      uniqueKeys.forEach((key, i) => preSignedMap.set(key, urls[i]));
    }

    // 4. Assemble result
    return scans.map(({ scan, frontImage, backImage, product }) => {
      const label = labels.find((l) => l.scanId === scan.id) || null;
      const scanIngredients = ingredients.filter((i) => i.scanId === scan.id);
      const prescription =
        prescriptions.find((p) => p.scanId === scan.id) || null;
      const scanMedications = prescription
        ? meds.filter((m) => m.prescriptionId === prescription.id)
        : [];

      const frontSignedUrl = frontImage?.oracleKey
        ? (preSignedMap.get(frontImage.oracleKey) ?? null)
        : null;
      const backSignedUrl = backImage?.oracleKey
        ? (preSignedMap.get(backImage.oracleKey) ?? null)
        : null;

      const result = {
        id: scan.id,
        userId: scan.userId,
        scanType: scan.scanType,
        rawOcrText: scan.rawOcrText,
        parsedResult: scan.parsedResult,
        confidence: scan.confidence,
        scannedAt: scan.scannedAt,
        imageUrl: frontSignedUrl ?? (scan.frontImageUrl as string),
        frontImageUrl: frontSignedUrl ?? (scan.frontImageUrl as string),
        backImageUrl: backSignedUrl ?? (scan.backImageUrl as string),
        fileUrl: (scan.fileUrl as string) ?? null,
        fileName: (scan.fileName as string) ?? null,
        product: product || null,
        label,
        ingredients: scanIngredients.length ? scanIngredients : null,
        prescription,
        medications: scanMedications.length ? scanMedications : null,
      };
      console.log('SCAN RESULT', result);

      return result;
    });
  }

  async createProductScan(userId: string, dto: ProductScanDto) {
    const db = this.dbService.db;

    return db.transaction(async (tx) => {
      // 1. Insert product
      const [product] = await tx
        .insert(products)
        .values({
          userId,
          productName: dto.product.product_name,
          brand: dto.product.brand ?? null,
          productType: dto.product.product_type ?? dto.category ?? null,
        })
        .returning();

      // 2. Resolve image IDs from front/back URLs (if provided)
      let imageId: string | null = null;
      let backImageId: string | null = null;

      const urlsToResolve: { url: string; target: 'front' | 'back' }[] = [];
      if (dto.frontImageUrl)
        urlsToResolve.push({ url: dto.frontImageUrl, target: 'front' });
      if (dto.backImageUrl)
        urlsToResolve.push({ url: dto.backImageUrl, target: 'back' });

      if (urlsToResolve.length) {
        const resolved = await tx
          .select({ id: images.id, url: images.url })
          .from(images)
          .where(
            and(
              eq(images.userId, userId),
              inArray(
                images.url,
                urlsToResolve.map((r) => r.url),
              ),
            ),
          );
        for (const r of urlsToResolve) {
          const match = resolved.find((row) => row.url === r.url);
          if (r.target === 'front') imageId = match?.id ?? null;
          else backImageId = match?.id ?? null;
        }
      }

      // 3. Insert scan_history
      const rawOcrText = [dto.frontOcrText, dto.backOcrText]
        .filter(Boolean)
        .join('\n---\n');

      const parsedResult = {
        ...(dto.parsedFront && { front: dto.parsedFront }),
        ...(dto.parsedBack && { back: dto.parsedBack }),
      };

      const [scan] = await tx
        .insert(scanHistory)
        .values({
          userId,
          imageId,
          backImageId,
          frontImageUrl: dto.frontImageUrl ?? null,
          backImageUrl: dto.backImageUrl ?? null,
          productId: product.id,
          scanType: dto.scanType ?? 'label',
          rawOcrText: rawOcrText || null,
          parsedResult,
          confidence: dto.confidence ?? null,
        })
        .returning();

      // 4. Insert scanned_labels (if label data provided)
      if (dto.label) {
        await tx.insert(scannedLabels).values({
          scanId: scan.id,
          productId: product.id,
          userId,
          usageDirections: dto.label.usage_directions ?? null,
          warnings: dto.label.warnings ?? [],
        });
      }

      // 5. Insert scanned_ingredients (one row per ingredient)
      if (dto.ingredients?.length) {
        await tx.insert(scannedIngredients).values(
          dto.ingredients.map((ing) => ({
            scanId: scan.id,
            productId: product.id,
            userId,
            name: ing.name,
            purpose: ing.purpose ?? null,
            isAllergen: ing.is_allergen ?? false,
          })),
        );
      }

      this.logger.log(
        `Product scan created: product=${product.id} scan=${scan.id}`,
      );

      return { product, scan };
    });
  }

  async createPrescriptionScan(userId: string, dto: PrescriptionScanDto) {
    const db = this.dbService.db;

    return db.transaction(async (tx) => {
      // 1. Resolve image ID from imageUrl (if provided)
      let imageId: string | null = null;
      if (dto.imageUrl) {
        const [img] = await tx
          .select({ id: images.id })
          .from(images)
          .where(and(eq(images.userId, userId), eq(images.url, dto.imageUrl)))
          .limit(1);
        imageId = img?.id ?? null;
      }

      // 2. Insert scan_history
      const [scan] = await tx
        .insert(scanHistory)
        .values({
          userId,
          imageId,
          frontImageUrl: dto.imageUrl ?? null,
          productId: null,
          scanType: dto.scanType ?? 'prescription',
          rawOcrText: dto.rawOcrText ?? null,
          parsedResult: dto.parsedResult ?? {},
          confidence: dto.confidence ?? null,
        })
        .returning();

      // 3. Insert scanned_prescriptions
      const [prescription] = await tx
        .insert(scannedPrescriptions)
        .values({
          scanId: scan.id,
          userId,
          hospitalName: dto.prescription.hospital_name ?? null,
          doctorName: dto.prescription.doctor_name ?? null,
          doctorSpecialization: dto.prescription.doctor_specialization ?? null,
          doctorContact: dto.prescription.doctor_contact ?? null,
          patientName: dto.prescription.patient_name ?? null,
          diagnosis: dto.prescription.diagnosis ?? null,
          prescriptionDate: dto.prescription.prescription_date ?? null,
        })
        .returning();

      // 4. Insert medications (one row per med)
      if (dto.medications?.length) {
        await tx.insert(medications).values(
          dto.medications.map((med) => ({
            userId,
            prescriptionId: prescription.id,
            name: med.name,
            dosage: med.dosage ?? null,
            frequency: med.frequency ?? null,
            duration: med.duration ?? null,
            instructions: med.instructions ?? null,
            source: 'prescription' as const,
          })),
        );
      }

      this.logger.log(
        `Prescription scan created: scan=${scan.id} prescription=${prescription.id}`,
      );

      return { scan, prescription };
    });
  }

  async createLabReportScan(userId: string, dto: LabReportScanDto) {
    const db = this.dbService.db;

    // 1. Parse PDF text if fileUrl is provided
    let rawText: string | null = null;
    let parsedResult: Record<string, any> = {};

    if (dto.fileUrl) {
      try {
        const [imageRecord] = await db
          .select({ oracleKey: images.oracleKey })
          .from(images)
          .where(and(eq(images.userId, userId), eq(images.url, dto.fileUrl)))
          .limit(1);

        if (imageRecord) {
          const pdfBuffer = await this.oracleStorage.getObject(
            imageRecord.oracleKey,
          );
          const parser = new PDFParse({ data: new Uint8Array(pdfBuffer) });
          const textResult = await parser.getText();
          rawText = textResult.text;
          parsedResult = {
            category: dto.category ?? 'general',
            pageCount: textResult.total,
            rawText,
          };
          // this.logger.log(
          //   `PDF parsed: ${textResult.total} pages, ${rawText.length} chars`,
          // );
          await parser.destroy();
        }
      } catch (err) {
        this.logger.warn(`PDF parsing failed for ${dto.fileUrl}: ${err}`);
      }
    }

    // 2. Insert scan_history
    const [scan] = await db
      .insert(scanHistory)
      .values({
        userId,
        scanType: dto.scanType ?? 'lab_report',
        fileUrl: dto.fileUrl ?? null,
        fileName: dto.fileName ?? null,
        rawOcrText: rawText,
        parsedResult,
      })
      .returning();

    this.logger.log(`Lab report scan created: scan=${scan.id}`);

    // 3. Fire LLM analysis in background (non-blocking)
    if (rawText) {
      this.processLabReportWithLLM(scan.id, userId, rawText, dto).catch(
        (err) => {
          const error = err as Error & {
            cause?: Error;
            response?: { data: unknown; status: number };
          };
          this.logger.error(
            `Background LLM processing failed for scan=${scan.id}: ${error.message}`,
            error.response
              ? `Status: ${error.response.status}, Body: ${JSON.stringify(error.response.data)}`
              : error.cause
                ? `Cause: ${error.cause.message}`
                : error.stack,
          );
        },
      );
    }

    return { scan };
  }

  private async processLabReportWithLLM(
    scanId: string,
    userId: string,
    rawText: string,
    dto: LabReportScanDto,
  ) {
    const llmUrl = process.env.LLM_SERVER_URL;
    if (!llmUrl) {
      this.logger.warn(
        'LLM_SERVER_URL not configured, skipping lab report analysis',
      );
      return;
    }

    const db = this.dbService.db;
    const url = `${llmUrl.trim()}/lab-report`;
    this.logger.log(`Calling LLM server at: ${url}`);

    // Call LLM server (max 10000 chars)
    const truncatedText = rawText.slice(0, 10000);
    const { data: llmResult } = await firstValueFrom(
      this.httpService.post<Record<string, unknown>>(url, {
        text: truncatedText,
      }),
    );
    this.logger.log(
      `LLM analysis complete for scan=${scanId} :${JSON.stringify(llmResult.summary)}`,
    );

    // Update scan_history.parsedResult with LLM insights
    await db
      .update(scanHistory)
      .set({
        parsedResult: {
          category: dto.category ?? 'general',
          rawText,
          ...llmResult,
        },
        confidence: (llmResult.confidence as string) ?? null,
      })
      .where(eq(scanHistory.id, scanId));

    this.logger.log(`scan_history updated with LLM result for scan=${scanId}`);

    // Update user_summaries with LLM summary
    const summary = (llmResult.summary as string) ?? rawText.slice(0, 500);
    const labReportEntry = {
      scanId,
      fileName: dto.fileName ?? null,
      category: dto.category ?? 'general',
      textPreview: summary,
      scannedAt: new Date().toISOString(),
    };
    const entryJson = JSON.stringify(labReportEntry);

    try {
      await db
        .insert(userSummaries)
        .values({
          userId,
          recentLabReports: sql`jsonb_build_array(${entryJson}::jsonb)`,
        })
        .onConflictDoUpdate({
          target: userSummaries.userId,
          set: {
            recentLabReports: sql`(
              SELECT jsonb_agg(val)
              FROM (
                SELECT val
                FROM jsonb_array_elements(
                  jsonb_build_array(${entryJson}::jsonb) || COALESCE(user_summaries.recent_lab_reports, '[]'::jsonb)
                ) AS val
                LIMIT 5
              ) sub
            )`,
            lastUpdated: sql`now()`,
          },
        });

      this.logger.log(
        `User summary updated with LLM insights for user=${userId}`,
      );
    } catch (err) {
      this.logger.error(
        `Failed to update user_summaries for user=${userId}: ${(err as Error).message}`,
        (err as Error).stack,
      );
    }
  }

  async updateProduct(
    userId: string,
    productId: string,
    dto: UpdateProductDto,
  ) {
    const db = this.dbService.db;

    const updates: Record<string, any> = {};
    if (dto.product_name !== undefined) updates.productName = dto.product_name;
    if (dto.brand !== undefined) updates.brand = dto.brand;
    if (dto.product_type !== undefined) updates.productType = dto.product_type;
    if (dto.manufacturer !== undefined) updates.manufacturer = dto.manufacturer;

    const [updated] = await db
      .update(products)
      .set(updates)
      .where(and(eq(products.id, productId), eq(products.userId, userId)))
      .returning();

    if (!updated) throw new NotFoundException('Product not found');
    return updated;
  }

  async updateLabel(userId: string, labelId: string, dto: UpdateLabelDto) {
    const db = this.dbService.db;

    const updates: Record<string, any> = {};
    if (dto.usage_directions !== undefined)
      updates.usageDirections = dto.usage_directions;
    if (dto.warnings !== undefined) updates.warnings = dto.warnings;
    if (dto.expiry_date !== undefined) updates.expiryDate = dto.expiry_date;
    if (dto.batch_info !== undefined) updates.batchInfo = dto.batch_info;

    const [updated] = await db
      .update(scannedLabels)
      .set(updates)
      .where(
        and(eq(scannedLabels.id, labelId), eq(scannedLabels.userId, userId)),
      )
      .returning();

    if (!updated) throw new NotFoundException('Label not found');
    return updated;
  }

  async updateIngredient(
    userId: string,
    ingredientId: string,
    dto: UpdateIngredientDto,
  ) {
    const db = this.dbService.db;

    const updates: Record<string, any> = {};
    if (dto.name !== undefined) updates.name = dto.name;
    if (dto.purpose !== undefined) updates.purpose = dto.purpose;
    if (dto.is_allergen !== undefined) updates.isAllergen = dto.is_allergen;

    const [updated] = await db
      .update(scannedIngredients)
      .set(updates)
      .where(
        and(
          eq(scannedIngredients.id, ingredientId),
          eq(scannedIngredients.userId, userId),
        ),
      )
      .returning();

    if (!updated) throw new NotFoundException('Ingredient not found');
    return updated;
  }

  async updatePrescription(
    userId: string,
    prescriptionId: string,
    dto: UpdatePrescriptionDto,
  ) {
    const db = this.dbService.db;

    const updates: Record<string, any> = {};
    if (dto.hospital_name !== undefined)
      updates.hospitalName = dto.hospital_name;
    if (dto.doctor_name !== undefined) updates.doctorName = dto.doctor_name;
    if (dto.doctor_specialization !== undefined)
      updates.doctorSpecialization = dto.doctor_specialization;
    if (dto.doctor_contact !== undefined)
      updates.doctorContact = dto.doctor_contact;
    if (dto.patient_name !== undefined) updates.patientName = dto.patient_name;
    if (dto.diagnosis !== undefined) updates.diagnosis = dto.diagnosis;
    if (dto.prescription_date !== undefined)
      updates.prescriptionDate = dto.prescription_date;
    if (dto.refills !== undefined) updates.refills = dto.refills;

    const [updated] = await db
      .update(scannedPrescriptions)
      .set(updates)
      .where(
        and(
          eq(scannedPrescriptions.id, prescriptionId),
          eq(scannedPrescriptions.userId, userId),
        ),
      )
      .returning();

    if (!updated) throw new NotFoundException('Prescription not found');
    return updated;
  }

  async updateMedication(
    userId: string,
    medicationId: string,
    dto: UpdateMedicationDto,
  ) {
    const db = this.dbService.db;

    const updates: Record<string, any> = {};
    if (dto.name !== undefined) updates.name = dto.name;
    if (dto.dosage !== undefined) updates.dosage = dto.dosage;
    if (dto.frequency !== undefined) updates.frequency = dto.frequency;
    if (dto.duration !== undefined) updates.duration = dto.duration;
    if (dto.instructions !== undefined) updates.instructions = dto.instructions;

    const [updated] = await db
      .update(medications)
      .set(updates)
      .where(
        and(eq(medications.id, medicationId), eq(medications.userId, userId)),
      )
      .returning();

    if (!updated) throw new NotFoundException('Medication not found');
    return updated;
  }
}
