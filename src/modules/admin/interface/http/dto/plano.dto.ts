import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsEmail, IsIn, IsInt, IsNumber, IsOptional, IsString, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';

export class FeatureDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  key!: string;

  @IsString()
  @MaxLength(500)
  value!: string;
}

export class SalvarPlanoDto {
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  code!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsBoolean()
  isFree!: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(3)
  currency?: string;

  @IsOptional()
  @IsIn(['free', 'monthly', 'yearly'])
  billingPeriod?: 'free' | 'monthly' | 'yearly';

  @IsOptional()
  @IsNumber()
  @Min(0)
  amount?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  durationDays?: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FeatureDto)
  features!: FeatureDto[];
}

export class EntrarAdminDto {
  @IsString()
  email!: string;

  @IsString()
  @MinLength(8)
  senha!: string;
}

export class CriarAdministradorDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  nome!: string;

  @IsEmail()
  @MaxLength(255)
  email!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(200)
  senha!: string;
}

export class EditarAdministradorDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  nome!: string;

  @IsEmail()
  @MaxLength(255)
  email!: string;

  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(200)
  senha?: string;
}
