export const DOCUMENTOS = Symbol('DOCUMENTOS');

export interface DocumentoLido {
  id: string;
  name: string;
  documentType: string | null;
  mimeType: string | null;
  fileSize: number | null;
}

export interface LinkLido {
  id: string;
  title: string;
  url: string;
  description: string | null;
}

export interface DocumentosLidos {
  documents: DocumentoLido[];
  links: LinkLido[];
}

export interface DocumentoNovo {
  name: string;
  documentType: string | null;
  storageKey: string;
  mimeType: string;
  fileSize: number;
}

export interface LinkNovo {
  title: string;
  url: string;
  description: string | null;
}

export type FalhaDocumento = 'ausente' | 'proibido' | 'sumido' | 'arquivo';

export interface DocumentosRepositorio {
  listar(userId: string, viagemId: string): Promise<DocumentosLidos | FalhaDocumento>;
  criar(userId: string, viagemId: string, documento: DocumentoNovo): Promise<DocumentosLidos | FalhaDocumento>;
  chave(userId: string, viagemId: string, documentoId: string): Promise<string | null | FalhaDocumento>;
  excluir(userId: string, viagemId: string, documentoId: string): Promise<{ lista: DocumentosLidos; chave: string } | FalhaDocumento>;
  criarLink(userId: string, viagemId: string, link: LinkNovo): Promise<DocumentosLidos | FalhaDocumento>;
  editarLink(userId: string, viagemId: string, linkId: string, link: LinkNovo): Promise<DocumentosLidos | FalhaDocumento>;
  excluirLink(userId: string, viagemId: string, linkId: string): Promise<DocumentosLidos | FalhaDocumento>;
}
