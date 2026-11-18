import { IsIn, IsOptional, IsString } from 'class-validator';

export class EditarPerfilDto {
  @IsOptional()
  @IsString()
  nome?: string;

  @IsOptional()
  @IsString()
  usuario?: string;

  @IsOptional()
  @IsString()
  cidade?: string;

  @IsOptional()
  @IsString()
  link?: string;

  @IsOptional()
  @IsString()
  bio?: string;

  @IsOptional()
  @IsIn(['publico', 'privado'])
  visibilidade?: 'publico' | 'privado';
}
