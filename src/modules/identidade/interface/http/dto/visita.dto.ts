import { IsOptional, IsString, IsUUID } from 'class-validator';

export class MarcarPaisDto {
  @IsUUID()
  paisId!: string;

  @IsOptional()
  @IsString()
  quando?: string;
}

export class MarcarCidadeDto {
  @IsUUID()
  cidadeId!: string;

  @IsOptional()
  @IsString()
  quando?: string;
}
