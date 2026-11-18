import { RecuperacaoDeSenha } from '../entities/recuperacao-de-senha';

export const RECUPERACAO_DE_SENHA_REPOSITORIO = Symbol('RECUPERACAO_DE_SENHA_REPOSITORIO');

export interface RecuperacaoDeSenhaRepositorio {
  buscarAberta(userId: string): Promise<RecuperacaoDeSenha | null>;
  abrir(userId: string, recuperacao: RecuperacaoDeSenha): Promise<void>;
  gravarTentativa(recuperacao: RecuperacaoDeSenha): Promise<void>;
  /** Queima o código e grava o hash. Devolve false se o código já foi usado. */
  concluir(userId: string, recuperacao: RecuperacaoDeSenha, hashSenha: string, quando: Date): Promise<boolean>;
}
