import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { images } from '../../database/schema/images.schema';
import { eq, and } from 'drizzle-orm';
import { OracleStorageService } from './oracle-storage.service';
import { ImageCompressionService } from './image-compression.service';
export type ScanType = 'label' | 'ingredients' | 'prescription' | 'lab_report';

@Injectable()
export class UploadService {
  private readonly logger = new Logger(UploadService.name);
  private readonly bucket = process.env.OCI_BUCKET!;

  constructor(
    private readonly db: DatabaseService,
    private readonly oracle: OracleStorageService,
    private readonly compression: ImageCompressionService,
  ) {}

  async uploadImage(
    file: { buffer: Buffer; mimetype: string; size: number },
    userId: string,
    scanType: ScanType,
    folder?: string,
  ): Promise<{ imageUrl: string; imageId: string }> {
    this.logger.log(
      `Image received: ${file.mimetype} | Original size: ${(file.size / 1024).toFixed(2)}KB`,
    );

    // Compress image before upload
    const compressed = await this.compression.compressImage(file.buffer);

    this.logger.log(
      `Compression complete: ${(compressed.originalSize / 1024).toFixed(2)}KB → ${(compressed.compressedSize / 1024).toFixed(2)}KB | Saved: ${compressed.compressionRatio.toFixed(1)}%`,
    );

    const key = `${folder ?? scanType}/${userId}/${Date.now()}.jpg`;

    this.logger.log(`Uploading to Oracle: ${key}`);

    const url = await this.oracle.uploadObject(
      key,
      compressed.buffer,
      compressed.mimeType,
    );

    const [record] = await this.db.db
      .insert(images)
      .values({
        userId,
        oracleBucket: this.bucket,
        oracleKey: key,
        url,
        scanType,
        mimeType: compressed.mimeType,
        sizeBytes: compressed.compressedSize,
      })
      .returning();

    this.logger.log(`Image saved: ${record.id}`);
    return { imageUrl: url, imageId: record.id };
  }

  async getImageById(
    imageId: string,
    userId: string,
  ): Promise<{ url: string; image: typeof images.$inferSelect }> {
    const [image] = await this.db.db
      .select()
      .from(images)
      .where(and(eq(images.id, imageId), eq(images.userId, userId)))
      .limit(1);

    if (!image) throw new NotFoundException('Image not found');

    // Return a fresh pre-signed URL valid for 1 hour
    const url = await this.oracle.getPreSignedUrl(image.oracleKey);
    return { url, image: { ...image, url } };
  }

  async getUserImages(userId: string) {
    const records = await this.db.db
      .select()
      .from(images)
      .where(eq(images.userId, userId))
      .orderBy(images.uploadedAt);

    // Refresh pre-signed URLs in parallel
    const withUrls = await Promise.all(
      records.map(async (img) => ({
        ...img,
        url: await this.oracle.getPreSignedUrl(img.oracleKey),
      })),
    );

    return withUrls;
  }

  async deleteImage(imageId: string, userId: string): Promise<void> {
    const [image] = await this.db.db
      .select()
      .from(images)
      .where(and(eq(images.id, imageId), eq(images.userId, userId)))
      .limit(1);

    if (!image) throw new NotFoundException('Image not found');

    await this.oracle.deleteObject(image.oracleKey);

    await this.db.db.delete(images).where(eq(images.id, imageId));

    this.logger.log(`Image deleted: ${imageId}`);
  }
}
