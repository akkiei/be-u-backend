// src/modules/upload/upload.module.ts
import { Module } from '@nestjs/common';
import { UploadController } from './upload.controller';
import { UploadService } from './upload.service';
import { OracleStorageService } from './oracle-storage.service';

@Module({
  controllers: [UploadController],
  providers: [UploadService, OracleStorageService],
  exports: [UploadService, OracleStorageService],
})
export class UploadModule {}
