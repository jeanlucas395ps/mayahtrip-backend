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
 * ARCHITECTURE.md §3: "SMTP Hostinger... no idioma da interface." A API é
 * quem fala com o SMTP — nunca o app/web (ARCHITECTURE.md §4).
 */
export interface RemetenteDeEmail {
  enviarCodigoDeVerificacao(params: EnviarCodigoDeVerificacaoParams): Promise<void>;
  enviarConvite(params: EnviarConviteParams): Promise<void>;
}
