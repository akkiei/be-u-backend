import {
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class UpdateProfileDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsInt()
  @Min(1)
  @Max(120)
  @IsOptional()
  age?: number;

  @IsIn(['male', 'female', 'other'])
  @IsOptional()
  gender?: string;

  @IsIn(['oily', 'dry', 'combination', 'sensitive', 'normal'])
  @IsOptional()
  skinType?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  allergies?: string[];

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  conditions?: string[];
}
