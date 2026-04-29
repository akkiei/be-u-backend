import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ScansController } from './scans.controller';
import { ScansService } from './scans.service';
import { ScanRetryService } from './scan-retry.service';
import { UploadModule } from '../imageUploads/upload.module';

@Module({
  imports: [UploadModule, HttpModule],
  controllers: [ScansController],
  providers: [ScansService, ScanRetryService],
  exports: [ScansService],
})
export class ScansModule {}
