import { IsOptional, IsString } from 'class-validator';

export class LabReportScanDto {
  @IsString()
  scanType: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  fileUrl?: string;

  @IsOptional()
  @IsString()
  fileName?: string;
}
