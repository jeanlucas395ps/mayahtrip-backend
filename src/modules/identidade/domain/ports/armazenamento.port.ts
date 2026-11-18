export const ARMAZENAMENTO = Symbol('ARMAZENAMENTO');

/** ARCHITECTURE.md: o binário fica no Cloud Storage. O Postgres guarda a chave. */
export interface ArmazenamentoDeArquivo {
  guardar(chave: string, bytes: Buffer, mime: string): Promise<void>;
  ler(chave: string): Promise<{ bytes: Buffer; mime: string } | null>;
  apagar(chave: string): Promise<void>;
}
