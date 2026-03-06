import { Type } from 'class-transformer';
import {
  IsString,
  IsOptional,
  IsArray,
  IsObject,
  ValidateNested,
} from 'class-validator';

class PrescriptionDto {
  @IsOptional()
  @IsString()
  hospital_name?: string;

  @IsOptional()
  @IsString()
  doctor_name?: string;

  @IsOptional()
  @IsString()
  doctor_specialization?: string;

  @IsOptional()
  @IsString()
  doctor_contact?: string;

  @IsOptional()
  @IsString()
  patient_name?: string;

  @IsOptional()
  @IsString()
  diagnosis?: string;

  @IsOptional()
  @IsString()
  prescription_date?: string;
}

class MedicationDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  dosage?: string;

  @IsOptional()
  @IsString()
  frequency?: string;

  @IsOptional()
  @IsString()
  duration?: string;

  @IsOptional()
  @IsString()
  instructions?: string;
}

export class PrescriptionScanDto {
  @IsString()
  scanType: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  imageUrl?: string;

  @IsOptional()
  @IsString()
  rawOcrText?: string;

  @IsOptional()
  @IsString()
  confidence?: string;

  @ValidateNested()
  @Type(() => PrescriptionDto)
  prescription: PrescriptionDto;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MedicationDto)
  medications?: MedicationDto[];

  @IsOptional()
  @IsObject()
  parsedResult?: Record<string, any>;
}
