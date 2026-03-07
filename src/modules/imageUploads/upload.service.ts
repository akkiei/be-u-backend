import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { images } from '../../database/schema/images.schema';
import { eq, and } from 'drizzle-orm';
import { OracleStorageService } from './oracle-storage.service';
export type ScanType = 'label' | 'ingredients' | 'prescription' | 'lab_report';

@Injectable()
export class UploadService {
  private readonly logger = new Logger(UploadService.name);
  private readonly bucket = process.env.OCI_BUCKET!;

  constructor(
    private readonly db: DatabaseService,
    private readonly oracle: OracleStorageService,
  ) {}

  async uploadImage(
    file: { buffer: Buffer; mimetype: string; size: number },
    userId: string,
    clerkId: string,
    scanType: ScanType,
    folder?: string,
  ): Promise<{ imageUrl: string; imageId: string }> {
    const ext = file.mimetype.split('/')[1] ?? 'jpg';
    const key = `${folder ?? scanType}/${userId}/${Date.now()}.${ext}`;

    this.logger.log(`Uploading to Oracle: ${key}`);

    const url = await this.oracle.uploadObject(key, file.buffer, file.mimetype);

    const [record] = await this.db.db
      .insert(images)
      .values({
        userId,
        oracleBucket: this.bucket,
        oracleKey: key,
        url,
        scanType,
        mimeType: file.mimetype,
        sizeBytes: file.size,
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
