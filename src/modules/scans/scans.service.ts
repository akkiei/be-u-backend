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
import { userProfiles } from '../../database/schema/user-profiles.schema';
import { allergenFlags } from '../../database/schema/allergen-flags.schema';
import { recommendations } from '../../database/schema/recommendations.schema';
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

  // Prepends a new entry to a JSONB array column in user_summaries, keeping at most `limit` items.
  private async updateUserSummary(
    userId: string,
    columnName:
      | 'recent_food'
      | 'recent_makeup'
      | 'recent_medications'
      | 'recent_prescriptions',
    entry: Record<string, unknown>,
    limit: number,
  ): Promise<void> {
    const entryJson = JSON.stringify(entry);
    const col = sql.identifier(columnName);
    await this.dbService.db.execute(sql`
      INSERT INTO user_summaries (user_id, ${col})
      VALUES (${userId}, jsonb_build_array(${entryJson}::jsonb))
      ON CONFLICT (user_id) DO UPDATE SET
        ${col} = (
          SELECT jsonb_agg(val)
          FROM (
            SELECT val FROM jsonb_array_elements(
              jsonb_build_array(${entryJson}::jsonb) || COALESCE(user_summaries.${col}, '[]'::jsonb)
            ) AS val
            LIMIT ${limit}
          ) sub
        ),
        last_updated = now()
    `);
  }

  private async checkAndFlagAllergens(
    userId: string,
    scanId: string,
    productName: string,
    ingredients: { name: string; is_allergen?: boolean }[],
  ): Promise<string[]> {
    const db = this.dbService.db;

    const [profile] = await db
      .select({ allergies: userProfiles.allergies })
      .from(userProfiles)
      .where(eq(userProfiles.userId, userId))
      .limit(1);

    const userAllergies: string[] = profile?.allergies ?? [];

    // Match: ingredient name contains an allergen string (case-insensitive)
    // OR the LLM already flagged the ingredient as an allergen
    const matched = ingredients.filter((ing) => {
      const ingLower = ing.name.toLowerCase();
      const llmFlagged = ing.is_allergen === true;
      const profileMatch = userAllergies.some((a) =>
        ingLower.includes(a.toLowerCase()),
      );
      return llmFlagged || profileMatch;
    });

    if (matched.length === 0) return [];

    // Insert allergen_flags rows
    await db.insert(allergenFlags).values(
      matched.map((ing) => ({
        userId,
        scanId,
        allergen: ing.name,
        foundIn: productName,
      })),
    );

    // Append to user_summaries.flagged_ingredients (distinct, no duplicates)
    const newNames = matched.map((ing) => ing.name);
    const arrayLiteral = `{${newNames.map((n) => `"${n.replace(/"/g, '\\"')}"`).join(',')}}`;

    await db.execute(sql`
      INSERT INTO user_summaries (user_id, flagged_ingredients)
      VALUES (${userId}, ${arrayLiteral}::text[])
      ON CONFLICT (user_id) DO UPDATE SET
        flagged_ingredients = ARRAY(
          SELECT DISTINCT unnest(
            COALESCE(user_summaries.flagged_ingredients, '{}') || ${arrayLiteral}::text[]
          )
        ),
        last_updated = now()
    `);

    this.logger.log(
      `Flagged ${matched.length} allergen(s) for user=${userId} scan=${scanId}`,
    );

    return newNames;
  }

  private async generateRecommendation(
    userId: string,
    scanId: string,
    scanType: string,
    opts: {
      warnings?: string[];
      usageDirections?: string;
      flaggedAllergens?: string[];
      medicationNames?: string[];
      llmSummary?: string;
    },
  ): Promise<void> {
    const db = this.dbService.db;
    const {
      warnings = [],
      usageDirections,
      flaggedAllergens = [],
      medicationNames = [],
      llmSummary,
    } = opts;

    let recommendation: string;
    let safeToUse: boolean | null = null;
    let reasoning: string | null = null;
    let recWarnings: string[] = [];

    if (scanType === 'label') {
      safeToUse = true;
      recWarnings = warnings;
      recommendation =
        usageDirections ?? 'See product label for usage directions.';
      reasoning = warnings.length
        ? `${warnings.length} warning(s) on label.`
        : null;
    } else if (scanType === 'ingredients') {
      safeToUse = flaggedAllergens.length === 0;
      recommendation = flaggedAllergens.length
        ? `Contains allergens: ${flaggedAllergens.join(', ')}.`
        : 'No known allergens detected in ingredients.';
      reasoning = flaggedAllergens.length
        ? `Matched your profile allergies: ${flaggedAllergens.join(', ')}`
        : null;
    } else if (scanType === 'prescription') {
      recommendation = medicationNames.length
        ? `Prescribed medications: ${medicationNames.join(', ')}.`
        : 'Prescription scanned. Consult your doctor before taking any medication.';
    } else if (scanType === 'lab_report') {
      recommendation =
        llmSummary ??
        'Lab report processed. Consult your doctor for interpretation.';
    } else {
      recommendation = 'Scan processed.';
    }

    await db.insert(recommendations).values({
      userId,
      scanId,
      recommendation,
      warnings: recWarnings,
      safeToUse,
      reasoning,
    });

    this.logger.debug(
      `Recommendation stored for scan=${scanId} type=${scanType}`,
    );
  }

  // Fetches user profile + flagged ingredients and returns a compact context
  // block to prepend to LLM text. Returns empty string if profile has no data.
  async buildUserContextBlock(userId: string): Promise<string> {
    const db = this.dbService.db;

    const [[profile], [summary]] = await Promise.all([
      db
        .select({
          age: userProfiles.age,
          gender: userProfiles.gender,
          skinType: userProfiles.skinType,
          allergies: userProfiles.allergies,
          conditions: userProfiles.conditions,
        })
        .from(userProfiles)
        .where(eq(userProfiles.userId, userId))
        .limit(1),
      db
        .select({ flaggedIngredients: userSummaries.flaggedIngredients })
        .from(userSummaries)
        .where(eq(userSummaries.userId, userId))
        .limit(1),
    ]);

    const lines: string[] = [];

    if (profile?.age || profile?.gender || profile?.skinType) {
      const parts = [
        profile.age ? `Age: ${profile.age}` : null,
        profile.gender ? `Gender: ${profile.gender}` : null,
        profile.skinType ? `Skin type: ${profile.skinType}` : null,
      ].filter(Boolean);
      lines.push(parts.join(' | '));
    }
    if (profile?.allergies?.length) {
      lines.push(`Allergies: ${profile.allergies.join(', ')}`);
    }
    if (profile?.conditions?.length) {
      lines.push(`Conditions: ${profile.conditions.join(', ')}`);
    }
    if (summary?.flaggedIngredients?.length) {
      lines.push(
        `Previously flagged: ${summary.flaggedIngredients.slice(0, 10).join(', ')}`,
      );
    }

    if (lines.length === 0) return '';

    return `[USER CONTEXT]\n${lines.join('\n')}\n[/USER CONTEXT]\n\n`;
  }

  async buildRagContextBlock(
    userId: string,
    text: string,
    excludeScanId?: string,
  ): Promise<string> {
    const embedUrl = process.env.EMBEDDING_SERVER_URL;
    if (!embedUrl) return '';

    const trimmed = text.trim().slice(0, 8000);
    if (!trimmed) return '';

    const { data } = await firstValueFrom(
      this.httpService.post<{ embedding: number[] }>(
        `${embedUrl.trim()}/embed`,
        { text: trimmed },
      ),
    );

    const embedding = data.embedding;

    type SimilarScan = {
      id: string;
      scanType: string;
      llmSummary: string | null;
      scannedAt: Date | null;
    };

    const rows = (await this.dbService.db.execute(sql`
      SELECT id, scan_type, llm_summary, scanned_at
      FROM scan_history
      WHERE user_id = ${userId}
        AND embedding IS NOT NULL
        AND llm_summary IS NOT NULL
        ${excludeScanId ? sql`AND id != ${excludeScanId}` : sql``}
      ORDER BY embedding <=> ${sql`${JSON.stringify(embedding)}::vector`}
      LIMIT 3
    `)) as { rows: SimilarScan[] };

    const scans = rows.rows;
    if (!scans.length) {
      this.logger.debug(`RAG: no similar past scans found for user=${userId}`);
      return '';
    }

    const entries = scans
      .map((s, i) => {
        const date = s.scannedAt
          ? new Date(s.scannedAt).toISOString().slice(0, 10)
          : 'unknown date';
        const summary = (s.llmSummary ?? '').slice(0, 300);
        return `${i + 1}. ${s.scanType} scan (${date}): ${summary}`;
      })
      .join('\n');

    this.logger.log(
      `RAG: injecting ${scans.length} past scan(s) for user=${userId} ids=[${scans.map((s) => s.id.slice(0, 8)).join(', ')}]`,
    );

    return `[RELEVANT PAST SCANS]\n${entries}\n[/RELEVANT PAST SCANS]\n\n`;
  }

  // Calls embedding server, stores result in scan_history.embedding. Fire-and-forget.
  async generateAndStoreEmbedding(scanId: string, text: string): Promise<void> {
    const embedUrl = process.env.EMBEDDING_SERVER_URL;
    if (!embedUrl) return;

    const trimmed = text.trim().slice(0, 8000);
    if (!trimmed) {
      this.logger.warn(
        `Embedding skipped for scan=${scanId}: no text to embed`,
      );
      return;
    }

    const { data } = await firstValueFrom(
      this.httpService.post<{ embedding: number[]; dimensions: number }>(
        `${embedUrl.trim()}/embed`,
        { text: trimmed },
      ),
    );

    const embedding = data.embedding;
    await this.dbService.db
      .update(scanHistory)
      .set({ embedding: sql`${JSON.stringify(embedding)}::vector` })
      .where(eq(scanHistory.id, scanId));

    this.logger.debug(
      `Embedding stored for scan=${scanId} dims=${data.dimensions}`,
    );
  }

  private warmUpLLMServer(): void {
    const llmUrl = process.env.LLM_SERVER_URL;
    if (!llmUrl) return;

    this.httpService.get(`${llmUrl.trim()}/health`).subscribe({
      next: () => this.logger.debug('LLM server warm-up ping succeeded'),
      error: (err) =>
        this.logger.debug(`LLM server warm-up ping failed: ${String(err)}`),
    });
  }

  private extractSummaryFromParsedResult(
    parsedResult: Record<string, any> | null,
  ): string | null {
    if (!parsedResult) {
      return null;
    }

    // Flat structure (lab report, prescription)
    if (typeof parsedResult.summary === 'string') {
      this.logger.debug(
        `[extractSummary] Found flat summary: ${parsedResult.summary.substring(0, 100)}...`,
      );
      return parsedResult.summary;
    }

    // Nested front/back structure (product/label scans) — merge both if available
    const front = parsedResult.front as Record<string, any> | undefined;
    const back = parsedResult.back as Record<string, any> | undefined;

    const isFrontSummary = typeof front?.summary === 'string';
    const isBackSummary = typeof back?.summary === 'string';

    const frontSummary = isFrontSummary ? (front.summary as string) : null;
    const backSummary = isBackSummary ? (back.summary as string) : null;

    if (frontSummary && backSummary) {
      const merged = `${frontSummary} ${backSummary}`;
      return merged;
    }

    const result = frontSummary ?? backSummary;
    this.logger.debug(
      `[extractSummary] Final result: ${result ? result.substring(0, 100) : 'null'}`,
    );
    return result;
  }

  async getScans(userId: string) {
    const db = this.dbService.db;

    // 1. Fetch slim scan list with flattened product + prescription fields
    const scans = await db
      .select({
        id: scanHistory.id,
        userId: scanHistory.userId,
        scanType: scanHistory.scanType,
        confidence: scanHistory.confidence,
        scannedAt: scanHistory.scannedAt,
        frontImageUrl: scanHistory.frontImageUrl,
        backImageUrl: scanHistory.backImageUrl,
        fileUrl: scanHistory.fileUrl,
        fileName: scanHistory.fileName,
        frontImageOracleKey: images.oracleKey,
        productName: products.productName,
        productBrand: products.brand,
        expiryDate: scannedLabels.expiryDate,
        hospitalName: scannedPrescriptions.hospitalName,
        doctorName: scannedPrescriptions.doctorName,
      })
      .from(scanHistory)
      .leftJoin(images, eq(scanHistory.imageId, images.id))
      .leftJoin(products, eq(scanHistory.productId, products.id))
      .leftJoin(scannedLabels, eq(scanHistory.id, scannedLabels.scanId))
      .leftJoin(
        scannedPrescriptions,
        eq(scanHistory.id, scannedPrescriptions.scanId),
      )
      .where(eq(scanHistory.userId, userId))
      .orderBy(desc(scanHistory.scannedAt));

    if (scans.length === 0) {
      return [];
    }

    // 2. Generate pre-signed URLs for front images only (for thumbnails)
    const imageKeys = scans
      .map((s) => s.frontImageOracleKey)
      .filter((key): key is string => !!key);
    const uniqueKeys = [...new Set(imageKeys)];

    const preSignedMap = new Map<string, string>();
    if (uniqueKeys.length) {
      const urls = await Promise.all(
        uniqueKeys.map((key) => this.oracleStorage.getPreSignedUrl(key)),
      );
      uniqueKeys.forEach((key, i) => preSignedMap.set(key, urls[i]));
    }

    // 3. Assemble lightweight list response
    return scans.map((scan) => ({
      id: scan.id,
      userId: scan.userId,
      scanType: scan.scanType,
      confidence: scan.confidence,
      scannedAt: scan.scannedAt,
      imageUrl: scan.frontImageOracleKey
        ? (preSignedMap.get(scan.frontImageOracleKey) ?? scan.frontImageUrl)
        : scan.frontImageUrl,
      frontImageUrl: scan.frontImageOracleKey
        ? (preSignedMap.get(scan.frontImageOracleKey) ?? scan.frontImageUrl)
        : scan.frontImageUrl,
      backImageUrl: scan.backImageUrl,
      fileUrl: scan.fileUrl,
      fileName: scan.fileName,
      productName: scan.productName,
      brand: scan.productBrand,
      expiryDate: scan.expiryDate,
      hospitalName: scan.hospitalName,
      doctorName: scan.doctorName,
    }));
  }

  async getScanDetail(scanId: string, userId: string) {
    const db = this.dbService.db;
    const backImages = aliasedTable(images, 'back_images');

    // 1. Fetch scan with images and product
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
      .where(and(eq(scanHistory.id, scanId), eq(scanHistory.userId, userId)))
      .limit(1);

    if (scans.length === 0) {
      throw new NotFoundException('Scan not found');
    }

    const [{ scan, frontImage, backImage, product }] = scans;
    const scanIds = [scan.id];

    // 2. Fetch related data in parallel
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

    // 3. Generate pre-signed URLs for front + back images
    const allImageKeys = [frontImage?.oracleKey, backImage?.oracleKey].filter(
      (key): key is string => !!key,
    );
    const uniqueKeys = [...new Set(allImageKeys)];

    const preSignedMap = new Map<string, string>();
    if (uniqueKeys.length) {
      const urls = await Promise.all(
        uniqueKeys.map((key) => this.oracleStorage.getPreSignedUrl(key)),
      );
      uniqueKeys.forEach((key, i) => preSignedMap.set(key, urls[i]));
    }

    // 4. Assemble full detail response
    const label = labels[0] || null;
    const scanIngredients = ingredients;
    const prescription = prescriptions[0] || null;
    const scanMedications = prescription
      ? meds.filter((m) => m.prescriptionId === prescription.id)
      : [];

    const frontSignedUrl = frontImage?.oracleKey
      ? (preSignedMap.get(frontImage.oracleKey) ?? null)
      : null;
    const backSignedUrl = backImage?.oracleKey
      ? (preSignedMap.get(backImage.oracleKey) ?? null)
      : null;

    // Extract summary from nested or flat parsedResult structure
    const extractedSummary = this.extractSummaryFromParsedResult(
      scan.parsedResult as Record<string, any> | null,
    );
    // Conditionally include rawOcrText and parsedResult based on LLM availability
    const hasLLMResult = scan.llmSummary != null || extractedSummary != null;

    // Back-fill llmSummary from extracted summary if null
    const llmSummary = scan.llmSummary ?? extractedSummary;

    // Persist merged summary to DB if it wasn't already stored (fire-and-forget)
    if (scan.llmSummary == null && extractedSummary != null) {
      void db
        .update(scanHistory)
        .set({ llmSummary: extractedSummary })
        .where(eq(scanHistory.id, scan.id))
        .catch((err: Error) =>
          this.logger.warn(
            `Failed to persist llmSummary for scan=${scan.id}: ${err.message}`,
          ),
        );
    }

    return {
      id: scan.id,
      userId: scan.userId,
      scanType: scan.scanType,
      ...(hasLLMResult
        ? {
            // LLM has processed: include only parsed result
            parsedResult: scan.parsedResult,
          }
        : {
            // LLM not yet processed: include raw OCR text
            rawOcrText: scan.rawOcrText,
            parsedResult: scan.parsedResult,
          }),
      confidence: scan.confidence,
      llmSummary,
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
  }

  async createProductScan(userId: string, dto: ProductScanDto) {
    const db = this.dbService.db;

    const txResult = await db.transaction(async (tx) => {
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

      const llmSummary = this.extractSummaryFromParsedResult(parsedResult);

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
          llmSummary,
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
          expiryDate: dto.label.expiry_date ?? null,
          batchInfo: dto.label.batch_info ?? null,
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
        `Product scan created: scan=${scan.id} product=${product.productName} category=${dto.category ?? 'unknown'}`,
      );

      return { product, scan };
    });

    // Update user summary based on product type (fire-and-forget)
    const summaryEntry = {
      scanId: txResult.scan.id,
      productName: txResult.product.productName,
      brand: txResult.product.brand ?? null,
      scannedAt:
        txResult.scan.scannedAt?.toISOString() ?? new Date().toISOString(),
    };

    const CATEGORY_TO_SUMMARY: Record<
      string,
      'recent_food' | 'recent_makeup' | 'recent_medications'
    > = {
      food: 'recent_food',
      beauty: 'recent_makeup',
      makeup: 'recent_makeup',
      medication: 'recent_medications',
      medicine: 'recent_medications',
      medicines: 'recent_medications',
    };

    const summaryColumn = CATEGORY_TO_SUMMARY[dto.category ?? ''];

    if (summaryColumn) {
      this.updateUserSummary(userId, summaryColumn, summaryEntry, 10).catch(
        (err: Error) =>
          this.logger.warn(`Failed to update ${summaryColumn}: ${err.message}`),
      );
    } else {
      this.logger.warn(
        `Unknown category '${dto.category}' for scan=${txResult.scan.id} — skipping user summary update`,
      );
    }

    // Generate embedding from product text (fire-and-forget)
    const embedText = [
      txResult.product.productName,
      txResult.product.brand,
      dto.frontOcrText,
      dto.backOcrText,
    ]
      .filter(Boolean)
      .join(' ');
    this.generateAndStoreEmbedding(txResult.scan.id, embedText).catch(
      (err: Error) =>
        this.logger.warn(
          `Embedding failed for product scan=${txResult.scan.id}: ${err.message}`,
        ),
    );

    // Allergen flagging + recommendation (chained so recommendation knows which allergens matched)
    const runPostScanChecks = async () => {
      const flaggedAllergens = dto.ingredients?.length
        ? await this.checkAndFlagAllergens(
            userId,
            txResult.scan.id,
            txResult.product.productName ?? 'Unknown Product',
            dto.ingredients,
          )
        : [];

      await this.generateRecommendation(
        userId,
        txResult.scan.id,
        txResult.scan.scanType,
        {
          warnings: dto.label?.warnings ?? [],
          usageDirections: dto.label?.usage_directions ?? undefined,
          flaggedAllergens,
        },
      );
    };

    runPostScanChecks().catch((err: Error) =>
      this.logger.warn(`Post-scan checks failed: ${err.message}`),
    );

    return txResult;
  }

  async createPrescriptionScan(userId: string, dto: PrescriptionScanDto) {
    const db = this.dbService.db;

    const txResult = await db.transaction(async (tx) => {
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
      const parsedResult = dto.parsedResult ?? {};
      const llmSummary = this.extractSummaryFromParsedResult(
        parsedResult as Record<string, any> | null,
      );
      const summaryPreview = llmSummary ? llmSummary.substring(0, 100) : 'null';
      this.logger.log(
        `[createPrescriptionScan] Extracted llmSummary: ${summaryPreview}`,
      );

      const [scan] = await tx
        .insert(scanHistory)
        .values({
          userId,
          imageId,
          frontImageUrl: dto.imageUrl ?? null,
          productId: null,
          scanType: dto.scanType ?? 'prescription',
          rawOcrText: dto.rawOcrText ?? null,
          parsedResult,
          confidence: dto.confidence ?? null,
          llmSummary,
        })
        .returning();

      // 3. Extract prescription data (handle both flat and nested structures)
      const prescriptionData = dto.prescription;
      const doctorName: string | null =
        prescriptionData.doctor_name ?? prescriptionData.doctor?.name ?? null;
      const doctorSpecialization: string | null =
        prescriptionData.doctor_specialization ??
        prescriptionData.doctor?.specialization ??
        null;
      const doctorContact: string | null =
        prescriptionData.doctor_contact ??
        prescriptionData.doctor?.contact ??
        null;
      const patientName: string | null =
        prescriptionData.patient_name ?? prescriptionData.patient?.name ?? null;
      const prescriptionDate: string | null =
        prescriptionData.prescription_date ?? prescriptionData.date ?? null;

      // 4. Insert scanned_prescriptions
      const [prescription] = await tx
        .insert(scannedPrescriptions)
        .values({
          scanId: scan.id,
          userId,
          hospitalName: prescriptionData.hospital_name ?? null,
          doctorName,
          doctorSpecialization,
          doctorContact,
          patientName,
          diagnosis: prescriptionData.diagnosis ?? null,
          prescriptionDate,
        })
        .returning();

      // 5. Insert medications (one row per med)
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
        `Prescription scan created: scan=${scan.id} prescription=${prescription.id} meds=${dto.medications?.length ?? 0}`,
      );

      return {
        scan,
        prescription,
        doctorName,
        diagnosis: prescriptionData.diagnosis ?? null,
      };
    });

    // Update recent_prescriptions (fire-and-forget)
    this.updateUserSummary(
      userId,
      'recent_prescriptions',
      {
        scanId: txResult.scan.id,
        doctorName: txResult.doctorName ?? null,
        diagnosis: txResult.diagnosis ?? null,
        medicationCount: dto.medications?.length ?? 0,
        scannedAt:
          txResult.scan.scannedAt?.toISOString() ?? new Date().toISOString(),
      },
      5,
    ).catch((err: Error) =>
      this.logger.warn(`Failed to update recent_prescriptions: ${err.message}`),
    );

    // Update recent_medications for each med in the prescription (fire-and-forget)
    if (dto.medications?.length) {
      for (const med of dto.medications) {
        this.updateUserSummary(
          userId,
          'recent_medications',
          {
            name: med.name,
            dosage: med.dosage ?? null,
            frequency: med.frequency ?? null,
            source: 'prescription',
            scanId: txResult.scan.id,
            scannedAt:
              txResult.scan.scannedAt?.toISOString() ??
              new Date().toISOString(),
          },
          10,
        ).catch((err: Error) =>
          this.logger.warn(
            `Failed to update recent_medications: ${err.message}`,
          ),
        );
      }
    }

    // Generate embedding from prescription text (fire-and-forget)
    const prescEmbedText = [
      txResult.doctorName,
      txResult.diagnosis,
      dto.rawOcrText,
    ]
      .filter(Boolean)
      .join(' ');
    this.generateAndStoreEmbedding(txResult.scan.id, prescEmbedText).catch(
      (err: Error) =>
        this.logger.warn(
          `Embedding failed for prescription scan=${txResult.scan.id}: ${err.message}`,
        ),
    );

    // Generate recommendation (fire-and-forget)
    this.generateRecommendation(
      userId,
      txResult.scan.id,
      txResult.scan.scanType,
      {
        medicationNames: dto.medications?.map((m) => m.name) ?? [],
      },
    ).catch((err: Error) =>
      this.logger.warn(`Recommendation failed: ${err.message}`),
    );

    return { scan: txResult.scan, prescription: txResult.prescription };
  }

  async createLabReportScan(userId: string, dto: LabReportScanDto) {
    // Warm up LLM server before processing (fire-and-forget)
    this.warmUpLLMServer();

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
          this.logger.log(
            `PDF parsed: pages=${textResult.total} chars=${rawText.length} scan pending`,
          );
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

    const [contextBlock, ragBlock] = await Promise.all([
      this.buildUserContextBlock(userId),
      this.buildRagContextBlock(userId, rawText, scanId).catch(() => ''),
    ]);
    const TEXT_LIMIT = 50000;
    const prefix = contextBlock + ragBlock;
    const truncatedText = prefix + rawText.slice(0, TEXT_LIMIT - prefix.length);

    this.logger.log(
      `LLM call: scan=${scanId} context=${contextBlock.length}c rag=${ragBlock.length}c text=${truncatedText.length}c`,
    );

    const { data: llmResult } = await firstValueFrom(
      this.httpService.post<Record<string, unknown>>(url, {
        text: truncatedText,
      }),
    );

    await db
      .update(scanHistory)
      .set({
        parsedResult: {
          category: dto.category ?? 'general',
          rawText,
          ...llmResult,
        },
        confidence: (llmResult.confidence as string) ?? null,
        llmSummary: (llmResult.summary as string) ?? null,
      })
      .where(eq(scanHistory.id, scanId));

    const summaryPreview = ((llmResult.summary as string) ?? '').slice(0, 80);
    const confidence =
      typeof llmResult.confidence === 'string' ||
      typeof llmResult.confidence === 'number'
        ? llmResult.confidence
        : 'n/a';
    this.logger.log(
      `LLM complete: scan=${scanId} confidence=${confidence} summary="${summaryPreview}"`,
    );

    // Generate recommendation (fire-and-forget)
    this.generateRecommendation(userId, scanId, 'lab_report', {
      llmSummary: (llmResult.summary as string) ?? undefined,
    }).catch((err: Error) =>
      this.logger.warn(
        `Recommendation failed for lab scan=${scanId}: ${err.message}`,
      ),
    );

    // Generate embedding from LLM summary (fire-and-forget)
    const labEmbedText =
      (llmResult.summary as string) ?? rawText.slice(0, 8000);
    this.generateAndStoreEmbedding(scanId, labEmbedText).catch((err: Error) =>
      this.logger.warn(
        `Embedding failed for lab scan=${scanId}: ${err.message}`,
      ),
    );

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
        `User summary updated: recent_lab_reports for user=${userId}`,
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
