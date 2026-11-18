import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, IsUUID, MaxLength, Min, MinLength } from 'class-validator';

export class CategoriaMalaDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder!: number;

  @IsBoolean()
  isActive!: boolean;
}

export class ItemMalaDto {
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder!: number;

  @IsBoolean()
  isDefault!: boolean;

  @IsUUID()
  categoryId!: string;
}
