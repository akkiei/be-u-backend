import { IsOptional, IsString, IsArray } from 'class-validator';

export class UpdateLabelDto {
  @IsOptional()
  @IsString()
  usage_directions?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  warnings?: string[];

  @IsOptional()
  @IsString()
  expiry_date?: string;

  @IsOptional()
  @IsString()
  batch_info?: string;
}
