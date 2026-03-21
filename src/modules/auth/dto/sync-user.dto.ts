import { IsEmail, IsOptional, IsString } from 'class-validator';

export class SyncUserDto {
  @IsEmail()
  @IsOptional()
  email!: string;

  @IsString()
  @IsOptional()
  phone?: string | null;
}
