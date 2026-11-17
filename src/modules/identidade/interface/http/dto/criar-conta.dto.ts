import { Transform } from 'class-transformer';
import { Equals, IsEmail, IsIn, IsOptional, IsString, MinLength } from 'class-validator';

/**
 * Ordem e mensagens de `BUSINESS/02-cadastro-e-verificacao.md` §Validações
 * (AC-2 a AC-5 de `042-sign-up-api.md`). `class-validator` não garante
 * "parar na primeira falha"; isso é comportamento da UI do app/web, que
 * decide qual mensagem mostrar — a API devolve todos os erros encontrados.
 */
export class CriarContaDto {
  @IsString({ message: 'Digite seu nome.' })
  @MinLength(1, { message: 'Digite seu nome.' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  nome!: string;

  @IsEmail({}, { message: 'Digite um e-mail válido.' })
  email!: string;

  @IsString()
  @MinLength(8, { message: 'A senha precisa ter pelo menos 8 caracteres.' })
  senha!: string;

  @Equals(true, { message: 'Aceite os termos para continuar.' })
  aceitouTermos!: boolean;

  /**
   * Locale da interface no momento do cadastro, para o e-mail do código
   * sair no idioma certo (`ARCHITECTURE.md` §3). Não é regra de negócio
   * fechada em `BUSINESS/02` — decisão de implementação desta fatia.
   */
  @IsOptional()
  @IsIn(['pt-BR', 'pt-PT', 'en', 'es'])
  idioma?: string;
}
