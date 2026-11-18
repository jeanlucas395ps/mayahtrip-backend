import { CarteiraDocumento, TipoDocumento } from '../documento';

export const DOCUMENTO_REPOSITORIO = Symbol('DOCUMENTO_REPOSITORIO');

export interface DocumentoGravado {
  id: string;
  userId: string;
  tipo: TipoDocumento;
  nome: string;
  storageKey: string;
  mime: string;
  bytes: number;
  codigo: string | null;
  carteira: CarteiraDocumento | null;
}

export interface DocumentoNovo {
  userId: string;
  tipo: TipoDocumento;
  nome: string;
  storageKey: string;
  mime: string;
  bytes: number;
  codigo: string | null;
  carteira: CarteiraDocumento | null;
}

export interface DocumentoRepositorio {
  inserir(documento: DocumentoNovo): Promise<string>;
  listar(userId: string): Promise<DocumentoGravado[]>;
  buscar(userId: string, id: string): Promise<DocumentoGravado | null>;
  excluir(userId: string, id: string): Promise<string | null>;
}
