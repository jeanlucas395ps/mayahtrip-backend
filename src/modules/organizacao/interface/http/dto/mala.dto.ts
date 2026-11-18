import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsInt, IsOptional, IsString, IsUUID, MaxLength, Min, MinLength } from 'class-validator';

export class NovoItemMalaDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  name!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity?: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class ItemMalaDto extends NovoItemMalaDto {
  @IsBoolean()
  isPacked!: boolean;
}

export class VistantesDto {
  @IsArray()
  @ArrayMaxSize(30)
  @IsUUID('4', { each: true })
  viewerParticipantIds!: string[];
}
