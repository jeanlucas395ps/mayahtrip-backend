import { IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

export class AtivarFonteDto {
  @IsBoolean()
  isActive!: boolean;
}

export class PoliticaFonteDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10000)
  rateLimitPerMinute?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  termsUrl?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string | null;
}

export class ColetaDto {
  @IsUUID('4')
  sourceId!: string;

  @IsString()
  @MaxLength(255)
  externalId!: string;

  @IsString()
  @MaxLength(255)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  originalUrl?: string;

  @IsOptional()
  @IsIn(['image', 'video'])
  mediaType?: 'image' | 'video';

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  mediaUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  metadataKey?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  metadataValue?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  licenseName?: string;
}

export class StatusItemDto {
  @IsIn(['discovered', 'processing', 'ai_validated', 'pending_review', 'failed', 'removal_requested'])
  status!: 'discovered' | 'processing' | 'ai_validated' | 'pending_review' | 'failed' | 'removal_requested';

  @IsOptional()
  @Min(0)
  @Max(1)
  relevanceScore?: number;

  @IsOptional()
  @Min(0)
  @Max(1)
  qualityScore?: number;

  @IsOptional()
  @Min(0)
  @Max(1)
  duplicateScore?: number;
}

export class MidiaDto {
  @IsIn(['image', 'video'])
  mediaType!: 'image' | 'video';

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  originalUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  storageKey?: string;
}

export class LugarItemDto {
  @IsUUID('4')
  placeId!: string;
}

export class LicencaDto {
  @IsString()
  @MaxLength(150)
  licenseName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  licenseUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  attribution?: string;
}

export class RemocaoItemDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  requesterEmail?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reason?: string;
}

export class AjusteDto {
  @IsString()
  @MaxLength(150)
  key!: string;

  @IsInt()
  value!: number;
}

export class BandeiraDto {
  @IsString()
  @MaxLength(150)
  flagKey!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}

export class EventoProcessadoDto {
  @IsString()
  @MaxLength(80)
  consumer!: string;
}

export class LimparFilaDto {
  @IsIn(['pending', 'processing'])
  scope!: 'pending' | 'processing';
}
