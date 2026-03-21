import { Type } from 'class-transformer';
import {
  IsString,
  IsOptional,
  IsArray,
  IsObject,
  ValidateNested,
} from 'class-validator';

class DoctorDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  contact?: string;

  @IsOptional()
  @IsString()
  specialization?: string;
}

class PatientDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  age?: string;

  @IsOptional()
  @IsString()
  gender?: string;
}

class PrescriptionDto {
  @IsOptional()
  @IsString()
  hospital_name?: string;

  @IsOptional()
  @IsString()
  diagnosis?: string;

  @IsOptional()
  @IsString()
  date?: string;

  @IsOptional()
  @IsString()
  confidence?: string;

  // Support flat fields (legacy)
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
  prescription_date?: string;

  // Support nested objects (from LLM)
  @IsOptional()
  @ValidateNested()
  @Type(() => DoctorDto)
  doctor?: DoctorDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => PatientDto)
  patient?: PatientDto;
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
