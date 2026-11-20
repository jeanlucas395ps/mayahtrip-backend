import { Idioma } from '../value-objects/idioma.vo';

export const REMETENTE_DE_EMAIL = Symbol('REMETENTE_DE_EMAIL');

export interface EnviarCodigoDeVerificacaoParams {
  paraEmail: string;
  nome: string;
  codigo: string;
  idioma: Idioma;
}

export interface EnviarConviteParams {
  paraEmail: string;
  nomeDeQuemConvida: string;
  viagem: string;
  token: string;
  idioma: Idioma;
}

/**
 * Resultado do envio de código. `codigoDev` só vem preenchido quando o
 * e-mail NÃO foi entregue e `NODE_ENV !== 'production'` — para o app
 * local mostrar o código no toast enquanto a rede bloqueia SMTP.
 */
export type ResultadoEnvioCodigo = {
  entregue: boolean;
  codigoDev?: string;
};

/**
 * ARCHITECTURE.md §3: "SMTP Hostinger... no idioma da interface." A API é
 * quem fala com o SMTP — nunca o app/web (ARCHITECTURE.md §4).
 */
export interface RemetenteDeEmail {
  enviarCodigoDeVerificacao(params: EnviarCodigoDeVerificacaoParams): Promise<ResultadoEnvioCodigo>;
  enviarConvite(params: EnviarConviteParams): Promise<void>;
}
