import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ScansController } from './scans.controller';
import { ScansService } from './scans.service';
import { UploadModule } from '../imageUploads/upload.module';

@Module({
  imports: [UploadModule, HttpModule],
  controllers: [ScansController],
  providers: [ScansService],
  exports: [ScansService],
})
export class ScansModule {}
