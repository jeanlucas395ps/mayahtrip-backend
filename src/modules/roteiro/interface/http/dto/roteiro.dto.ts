import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';

export class DiaDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(366)
  dayNumber!: number;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  title?: string;

  @IsOptional()
  @IsString()
  destinationId?: string;
}

export class ParadaDto {
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  title!: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder!: number;

  @IsOptional()
  @Matches(/^\d{2}:\d{2}$/)
  startTime?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  durationMinutes?: number;
}

export class GerarDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  interests?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(40)
  pace?: string;
}

export class DeslocamentoDto {
  @IsOptional()
  @IsString()
  fromStopId?: string;

  @IsOptional()
  @IsString()
  toStopId?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(50)
  transportType!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  durationSeconds?: number;
}
