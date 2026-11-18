import { Type } from 'class-transformer';
import { IsArray, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, ValidateNested } from 'class-validator';

const DATA = /^\d{4}-\d{2}-\d{2}$/;

export class DestinoDto {
  @IsOptional()
  @IsUUID()
  cityId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  customName?: string | null;
}

export class CriarViagemDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  title?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  description?: string | null;

  @IsOptional()
  @Matches(DATA)
  startDate?: string | null;

  @IsOptional()
  @Matches(DATA)
  endDate?: string | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  durationDays?: number | null;

  @IsIn(['suggested', 'community', 'from_scratch'])
  startMode!: 'suggested' | 'community' | 'from_scratch';

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  adultCount?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10)
  childCount?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  budgetAmount?: number | null;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z]{3}$/)
  budgetCurrency?: string | null;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DestinoDto)
  destinations!: DestinoDto[];
}
