import { IsOptional, IsString } from 'class-validator';

export class EditarPreferenciaDto {
  @IsOptional()
  @IsString()
  idioma?: string;

  @IsOptional()
  @IsString()
  moeda?: string;
}
