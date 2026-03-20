// src/modules/upload/upload.controller.ts
import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  UseGuards,
  BadRequestException,
  Req,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { UploadService, ScanType } from './upload.service';
import { ClerkAuthGuard } from '../../core/guards/clerk-auth.guard';
import { CurrentUser } from '../../core/decorators/current-user.decorator';
import type { User } from '../../database/schema/users.schema';

const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/heic',
  'application/pdf',
];

@Controller('upload')
@UseGuards(ClerkAuthGuard)
export class UploadController {
  constructor(private readonly uploadService: UploadService) {}

  @Post()
  async upload(@Req() req: FastifyRequest, @CurrentUser() user: User) {
    if (!req.isMultipart()) {
      throw new BadRequestException('Request must be multipart/form-data');
    }

    let fileBuffer: Buffer | null = null;
    let mimeType = 'image/jpeg';
    let filename = `upload_${Date.now()}.jpg`;
    let sizeBytes = 0;
    let scanType: ScanType = 'label';
    let folder: string | undefined;

    const parts = req.parts();
    for await (const part of parts) {
      if (part.type === 'file' && part.fieldname === 'image') {
        if (!ALLOWED_MIME_TYPES.includes(part.mimetype)) {
          throw new BadRequestException(
            `Unsupported file type: ${part.mimetype}`,
          );
        }
        mimeType = part.mimetype;
        filename = part.filename ?? filename;
        const chunks: Buffer[] = [];
        for await (const chunk of part.file) {
          chunks.push(chunk);
        }
        fileBuffer = Buffer.concat(chunks);
        sizeBytes = fileBuffer.length;
      } else if (part.type === 'field') {
        if (part.fieldname === 'scanType') scanType = part.value as ScanType;
        if (part.fieldname === 'folder') folder = part.value as string;
      }
    }

    if (!fileBuffer) throw new BadRequestException('No image file provided');

    return this.uploadService.uploadImage(
      { buffer: fileBuffer, mimetype: mimeType, size: sizeBytes },
      user.id,
      scanType,
      folder,
    );
  }

  @Get('image/:id')
  async getImage(@Param('id') imageId: string, @CurrentUser() user: User) {
    return this.uploadService.getImageById(imageId, user.id);
  }

  @Get('my-images')
  async getMyImages(@CurrentUser() user: User) {
    return this.uploadService.getUserImages(user.id);
  }

  @Delete('image/:id')
  async deleteImage(@Param('id') imageId: string, @CurrentUser() user: User) {
    await this.uploadService.deleteImage(imageId, user.id);
    return { deleted: true };
  }
}
