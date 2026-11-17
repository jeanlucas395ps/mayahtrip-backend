export const SESSAO_REPOSITORIO = Symbol('SESSAO_REPOSITORIO');

export interface SessaoGravada {
  id: string;
  contaId: string;
  familiaId: string;
  hashRefresh: string;
  accessJti: string;
  expiraEm: Date;
  consumidaEm: Date | null;
  revogada: boolean;
}

export interface SessaoRepositorio {
  salvar(sessao: SessaoGravada): Promise<void>;
  buscarPorHashRefresh(hashRefresh: string): Promise<SessaoGravada | null>;
  marcarConsumida(id: string, quando: Date): Promise<void>;
  /** Devolve as linhas da família, já marcadas como revogadas. */
  revogarFamilia(familiaId: string): Promise<SessaoGravada[]>;
}
