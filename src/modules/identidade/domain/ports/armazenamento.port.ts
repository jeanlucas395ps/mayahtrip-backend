export const ARMAZENAMENTO = Symbol('ARMAZENAMENTO');

export type OpcoesDeArmazenamento = {
  /** Sobrescreve o bucket padrão (ex.: mayahtrip-places). */
  bucket?: string;
};

/** ARCHITECTURE.md: o binário fica no Cloud Storage. O Postgres guarda a chave. */
export interface ArmazenamentoDeArquivo {
  guardar(chave: string, bytes: Buffer, mime: string, opcoes?: OpcoesDeArmazenamento): Promise<void>;
  ler(chave: string, opcoes?: OpcoesDeArmazenamento): Promise<{ bytes: Buffer; mime: string } | null>;
  apagar(chave: string, opcoes?: OpcoesDeArmazenamento): Promise<void>;
}
