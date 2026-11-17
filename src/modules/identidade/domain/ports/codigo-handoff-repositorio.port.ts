export const CODIGO_HANDOFF_REPOSITORIO = Symbol('CODIGO_HANDOFF_REPOSITORIO');

export interface CodigoHandoffGravado {
  id: string;
  contaId: string;
  hashCodigo: string;
  expiraEm: Date;
  usadoEm: Date | null;
}

export interface CodigoHandoffRepositorio {
  salvar(codigo: CodigoHandoffGravado): Promise<void>;
  buscarPorHash(hashCodigo: string): Promise<CodigoHandoffGravado | null>;
  marcarUsado(id: string, quando: Date): Promise<void>;
}
