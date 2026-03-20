import { Injectable, Logger } from '@nestjs/common';
import sharp from 'sharp';
import { Buffer } from 'node:buffer';

export interface CompressionResult {
  buffer: Buffer;
  mimeType: string;
  originalSize: number;
  compressedSize: number;
  compressionRatio: number;
}

@Injectable()
export class ImageCompressionService {
  private readonly logger = new Logger(ImageCompressionService.name);

  async compressImage(
    buffer: Buffer,
    quality = 80,
    maxWidth = 2048,
  ): Promise<CompressionResult> {
    const originalSize = buffer.length;

    try {
      let pipeline = sharp(buffer);

      // Resize if larger than maxWidth (maintain aspect ratio)
      const metadata = await pipeline.metadata();
      if (metadata.width && metadata.width > maxWidth) {
        pipeline = pipeline.resize(maxWidth, maxWidth, {
          fit: 'inside',
          withoutEnlargement: true,
        });
      }

      // Convert HEIC/HEIF to JPEG, compress all images to JPEG
      const compressed = await pipeline
        .jpeg({ quality, progressive: true })
        .toBuffer();

      const compressedSize = compressed.length;
      const compressionRatio =
        ((originalSize - compressedSize) / originalSize) * 100;

      this.logger.log(
        `Compressed image: ${originalSize}B → ${compressedSize}B (${compressionRatio.toFixed(1)}% reduction)`,
      );

      return {
        buffer: compressed,
        mimeType: 'image/jpeg',
        originalSize,
        compressedSize,
        compressionRatio,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Image compression failed: ${errorMessage}`);
      throw new Error(`Image compression failed: ${errorMessage}`);
    }
  }
}
