import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsBoolean, IsIn, IsNumber, IsOptional, IsString, IsUUID, Matches, MaxLength, Min, ValidateNested } from 'class-validator';

export class DivisaoDto {
  @IsUUID()
  participantId!: string;

  @IsIn(['equal', 'percent', 'fixed'])
  allocationType!: 'equal' | 'percent' | 'fixed';

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  allocationValue?: number;
}

export class GastoDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  amount!: number;

  @IsString()
  @Matches(/^[A-Za-z]{3}$/)
  currency!: string;

  @IsUUID()
  categoryId!: string;

  @IsIn(['before_trip', 'on_trip', 'after_trip', 'planned'])
  context!: 'before_trip' | 'on_trip' | 'after_trip' | 'planned';

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  expenseDate?: string;

  @IsOptional()
  @IsBoolean()
  isEstimate?: boolean;

  @IsUUID()
  paidByParticipantId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => DivisaoDto)
  splits!: DivisaoDto[];
}

export class AcertoDto {
  @IsUUID()
  payerParticipantId!: string;

  @IsUUID()
  receiverParticipantId!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  amount!: number;

  @IsString()
  @Matches(/^[A-Za-z]{3}$/)
  currency!: string;
}
