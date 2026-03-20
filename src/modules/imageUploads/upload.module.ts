// src/modules/upload/upload.module.ts
import { Module } from '@nestjs/common';
import { UploadController } from './upload.controller';
import { UploadService } from './upload.service';
import { OracleStorageService } from './oracle-storage.service';
import { ImageCompressionService } from './image-compression.service';

@Module({
  controllers: [UploadController],
  providers: [UploadService, OracleStorageService, ImageCompressionService],
  exports: [UploadService, OracleStorageService],
})
export class UploadModule {}
