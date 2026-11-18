import { IsBoolean, IsEmail, IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class JulgamentoDto {
  @IsIn(['resolved', 'dismissed'])
  decision!: 'resolved' | 'dismissed';

  @IsBoolean()
  removeContent!: boolean;

  @IsBoolean()
  deactivateAccount!: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reason?: string;
}

export class RecursoDto {
  @IsUUID('4')
  moderationActionId!: string;

  @IsEmail()
  requesterEmail!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reason?: string;
}

export class TarefaEditorialDto {
  @IsUUID('4')
  ingestionItemId!: string;
}

export class DecisaoEditorialDto {
  @IsIn(['approved', 'rejected', 'edited', 'escalated'])
  decision!: 'approved' | 'rejected' | 'edited' | 'escalated';

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reason?: string;
}

export class RemocaoEditorialDto {
  @IsOptional()
  @IsEmail()
  requesterEmail?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reason?: string;
}
