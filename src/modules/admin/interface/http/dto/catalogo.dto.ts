import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

const IDIOMAS = ['pt-BR', 'pt-PT', 'en', 'es'] as const;
const HORA = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

export class TraducaoLugarDto {
  @IsIn(IDIOMAS)
  locale!: 'pt-BR' | 'pt-PT' | 'en' | 'es';

  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string | null;
}

export class EnderecoDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  line1?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  neighborhood?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  postalCode?: string | null;

  @IsOptional()
  @IsUUID()
  cityId?: string | null;
}

export class HorarioDto {
  @IsInt()
  @Min(0)
  @Max(6)
  weekday!: number;

  @IsOptional()
  @IsString()
  @Matches(HORA)
  openingTime?: string | null;

  @IsOptional()
  @IsString()
  @Matches(HORA)
  closingTime?: string | null;

  @IsBoolean()
  isClosed!: boolean;
}

export class PrecoDto {
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z]{3}$/)
  currency?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(32767)
  priceLevel?: number | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  minimumPrice?: number | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  maximumPrice?: number | null;
}

export class VisitaDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  recommendedDurationMinutes?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  bestTimeToVisit?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  accessibilityInformation?: string | null;
}

export class ReferenciaDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  provider!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(255)
  externalId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  externalUrl?: string | null;

  @IsOptional()
  @IsObject()
  providerMetadata?: Record<string, unknown> | null;
}

export class SalvarLugarDto {
  @IsString()
  @MinLength(1)
  @MaxLength(180)
  slug!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  description?: string | null;

  @IsOptional()
  @IsUUID()
  cityId?: string | null;

  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number | null;

  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  websiteUrl?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone?: string | null;

  @IsIn(['active', 'archived'])
  status!: 'active' | 'archived';

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TraducaoLugarDto)
  translations!: TraducaoLugarDto[];

  @IsArray()
  @IsUUID('4', { each: true })
  categoryIds!: string[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EnderecoDto)
  addresses!: EnderecoDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => HorarioDto)
  openingHours!: HorarioDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PrecoDto)
  prices!: PrecoDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => VisitaDto)
  visitInformation!: VisitaDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReferenciaDto)
  externalReferences!: ReferenciaDto[];
}

export class TraducaoCategoriaDto {
  @IsIn(IDIOMAS)
  locale!: 'pt-BR' | 'pt-PT' | 'en' | 'es';

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;
}

export class SalvarCategoriaDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  slug!: string;

  @IsOptional()
  @IsUUID()
  parentId?: string | null;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TraducaoCategoriaDto)
  translations!: TraducaoCategoriaDto[];
}

export class UnificarLugarDto {
  @IsUUID()
  origemId!: string;
}
