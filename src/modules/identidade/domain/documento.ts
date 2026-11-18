export const LIMITE_DOCUMENTO_BYTES = 10 * 1024 * 1024;
const LIMITE_CODIGO = 4096;
const LIMITE_NOME = 255;

export type TipoDocumento = 'cpf' | 'cnh' | 'bus_ticket' | 'flight_ticket';
export type CarteiraDocumento = 'google_wallet' | 'apple_wallet';
export type MotivoDocumento = 'tipo' | 'arquivo' | 'tamanho' | 'carteira' | 'codigo';

export class DocumentoInvalidoError extends Error {
  constructor(readonly motivo: MotivoDocumento) {
    super(motivo);
    this.name = 'DocumentoInvalidoError';
  }
}

export interface DocumentoPreparado {
  tipo: TipoDocumento;
  nome: string;
  mime: string;
  codigo: string | null;
  carteira: CarteiraDocumento | null;
}

const TIPOS: Record<string, TipoDocumento> = {
  cpf: 'cpf',
  cnh: 'cnh',
  onibus: 'bus_ticket',
  aviao: 'flight_ticket',
};

const CARTEIRAS: Record<string, CarteiraDocumento> = {
  google: 'google_wallet',
  apple: 'apple_wallet',
};

const MIMES: Record<string, string> = {
  'image/jpeg': 'image/jpeg',
  'image/jpg': 'image/jpeg',
  'image/png': 'image/png',
  'image/webp': 'image/webp',
  'application/pdf': 'application/pdf',
};

export function prepararDocumento(entrada: {
  tipo: string | undefined;
  codigo: string | undefined;
  carteira: string | undefined;
  nomeArquivo: string | undefined;
  mime: string | undefined;
  bytes: number;
}): DocumentoPreparado {
  const tipo = TIPOS[(entrada.tipo ?? '').trim()];
  if (!tipo) throw new DocumentoInvalidoError('tipo');

  const mime = MIMES[(entrada.mime ?? '').toLowerCase()];
  if (!mime) throw new DocumentoInvalidoError('arquivo');
  if (entrada.bytes <= 0 || entrada.bytes > LIMITE_DOCUMENTO_BYTES) throw new DocumentoInvalidoError('tamanho');

  const codigo = (entrada.codigo ?? '').trim();
  if (codigo.length > LIMITE_CODIGO) throw new DocumentoInvalidoError('codigo');
  const carteiraInformada = (entrada.carteira ?? '').trim();
  if (!carteiraInformada) {
    return { tipo, nome: nomeDe(entrada.nomeArquivo, mime), mime, codigo: codigo || null, carteira: null };
  }
  const carteira = CARTEIRAS[carteiraInformada];
  if (!carteira) throw new DocumentoInvalidoError('carteira');
  if (!codigo) throw new DocumentoInvalidoError('carteira');
  return { tipo, nome: nomeDe(entrada.nomeArquivo, mime), mime, codigo, carteira };
}

function nomeDe(original: string | undefined, mime: string): string {
  const base = (original ?? '').split(/[/\\]/).pop() ?? '';
  const limpo = base.replace(/[^\p{L}\p{N} ._()-]/gu, '').trim().slice(0, LIMITE_NOME);
  if (limpo) return limpo;
  const extensao = mime === 'application/pdf' ? 'pdf' : mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg';
  return `documento.${extensao}`;
}
