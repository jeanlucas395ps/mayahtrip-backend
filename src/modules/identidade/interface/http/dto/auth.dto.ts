import { IsBoolean, IsEmail, IsIn, IsOptional, IsString, Length, Matches, MaxLength, MinLength } from 'class-validator';

const IDIOMAS = ['pt-BR', 'pt-PT', 'en', 'es'] as const;

/** Query de `GET /v1/auth/email-availability`. */
export class VerificarEmailQueryDto {
  @IsEmail({}, { message: 'Digite um e-mail válido.' })
  email!: string;
}

/** Query de `GET /v1/auth/username-availability`. */
export class VerificarUsernameQueryDto {
  @IsString({ message: 'Digite um usuário.' })
  @MinLength(1, { message: 'Digite um usuário.' })
  @MaxLength(80, { message: 'Use letras, números e # . _ - $ & (sem espaços).' })
  @Matches(/^@?[\p{L}\p{N}#._$&-]+$/u, {
    message: 'Use letras, números e # . _ - $ & (sem espaços).',
  })
  usuario!: string;
}

export class ConfirmarContaDto {
  @IsEmail({}, { message: 'Digite um e-mail válido.' })
  email!: string;

  @IsString()
  @Length(4, 4)
  @Matches(/^\d{4}$/)
  codigo!: string;

  @IsOptional()
  @IsIn(IDIOMAS)
  idioma?: string;
}

export class ReenviarCodigoDto {
  @IsEmail({}, { message: 'Digite um e-mail válido.' })
  email!: string;

  @IsOptional()
  @IsIn(IDIOMAS)
  idioma?: string;
}

export class EntrarComSenhaDto {
  @IsEmail()
  email!: string;

  @IsString()
  senha!: string;

  @IsOptional()
  @IsBoolean()
  manterConectado?: boolean;
}

export class EntrarComGoogleDto {
  @IsString()
  token!: string;

  @IsOptional()
  @IsBoolean()
  manterConectado?: boolean;
}

export class RenovarSessaoDto {
  @IsString()
  refreshToken!: string;
}

export class TrocarHandoffDto {
  @IsString()
  codigo!: string;
}

export class PedirSenhaDto {
  @IsEmail({}, { message: 'Digite um e-mail válido.' })
  email!: string;

  @IsOptional()
  @IsIn(IDIOMAS)
  idioma?: string;
}

export class RedefinirSenhaDto {
  @IsEmail({}, { message: 'Digite um e-mail válido.' })
  email!: string;

  @IsString()
  @Length(4, 4)
  @Matches(/^\d{4}$/)
  codigo!: string;

  @IsString()
  @MinLength(8, { message: 'A senha precisa ter pelo menos 8 caracteres.' })
  senha!: string;

  @IsOptional()
  @IsIn(IDIOMAS)
  idioma?: string;
}

export class SairDto {
  @IsString()
  refreshToken!: string;
}
