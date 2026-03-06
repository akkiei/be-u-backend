import { Type } from 'class-transformer';
import {
  IsString,
  IsOptional,
  IsArray,
  IsBoolean,
  IsObject,
  ValidateNested,
} from 'class-validator';

class ProductDto {
  @IsString()
  product_name: string;

  @IsOptional()
  @IsString()
  brand?: string;

  @IsOptional()
  @IsString()
  product_type?: string;
}

class LabelDto {
  @IsOptional()
  @IsString()
  usage_directions?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  warnings?: string[];
}

class IngredientDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  purpose?: string;

  @IsOptional()
  @IsBoolean()
  is_allergen?: boolean;
}

export class ProductScanDto {
  @IsString()
  scanType: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  frontImageUrl?: string;

  @IsOptional()
  @IsString()
  backImageUrl?: string;

  @IsOptional()
  @IsString()
  frontOcrText?: string;

  @IsOptional()
  @IsString()
  backOcrText?: string;

  @IsOptional()
  @IsString()
  confidence?: string;

  @ValidateNested()
  @Type(() => ProductDto)
  product: ProductDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => LabelDto)
  label?: LabelDto;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => IngredientDto)
  ingredients?: IngredientDto[];

  @IsOptional()
  @IsObject()
  parsedFront?: Record<string, any>;

  @IsOptional()
  @IsObject()
  parsedBack?: Record<string, any>;
}
