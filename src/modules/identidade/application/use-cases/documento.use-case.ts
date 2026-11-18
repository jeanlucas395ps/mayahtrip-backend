import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { DocumentoInvalidoError, prepararDocumento } from '../../domain/documento';
import { ARMAZENAMENTO, ArmazenamentoDeArquivo } from '../../domain/ports/armazenamento.port';
import { DOCUMENTO_REPOSITORIO, DocumentoGravado, DocumentoRepositorio } from '../../domain/ports/documento-repositorio.port';

export class DocumentoAusenteError extends Error {
  constructor() {
    super('ausente');
    this.name = 'DocumentoAusenteError';
  }
}

export interface DocumentoVisivel {
  id: string;
  tipo: 'cpf' | 'cnh' | 'onibus' | 'aviao';
  nome: string;
  mime: string;
  tamanho: number;
  temCodigo: boolean;
  carteira: 'google' | 'apple' | null;
}

const TIPO_RESPOSTA = {
  cpf: 'cpf',
  cnh: 'cnh',
  bus_ticket: 'onibus',
  flight_ticket: 'aviao',
} as const;

const CARTEIRA_RESPOSTA = {
  google_wallet: 'google',
  apple_wallet: 'apple',
} as const;

@Injectable()
export class DocumentoUseCase {
  constructor(
    @Inject(DOCUMENTO_REPOSITORIO) private readonly documentos: DocumentoRepositorio,
    @Inject(ARMAZENAMENTO) private readonly armazenamento: ArmazenamentoDeArquivo,
  ) {}

  async listar(userId: string): Promise<DocumentoVisivel[]> {
    return (await this.documentos.listar(userId)).map(visao);
  }

  async ver(userId: string, id: string): Promise<DocumentoVisivel> {
    return visao(await this.exigir(userId, id));
  }

  async criar(
    userId: string,
    entrada: {
      tipo: string | undefined;
      codigo: string | undefined;
      carteira: string | undefined;
      nomeArquivo: string | undefined;
      mime: string | undefined;
      bytes: Buffer;
    },
  ): Promise<DocumentoVisivel> {
    const preparado = prepararDocumento({ ...entrada, bytes: entrada.bytes.length });
    const chave = `documentos/${userId}/${randomUUID()}`;
    await this.armazenamento.guardar(chave, entrada.bytes, preparado.mime);
    try {
      const id = await this.documentos.inserir({
        userId,
        tipo: preparado.tipo,
        nome: preparado.nome,
        storageKey: chave,
        mime: preparado.mime,
        bytes: entrada.bytes.length,
        codigo: preparado.codigo,
        carteira: preparado.carteira,
      });
      const gravado = await this.documentos.buscar(userId, id);
      if (!gravado) throw new DocumentoAusenteError();
      return visao(gravado);
    } catch (erro) {
      await this.armazenamento.apagar(chave).catch(() => undefined);
      if (erro instanceof DocumentoInvalidoError || erro instanceof DocumentoAusenteError) throw erro;
      throw erro;
    }
  }

  async baixar(userId: string, id: string): Promise<{ bytes: Buffer; mime: string; nome: string }> {
    const documento = await this.exigir(userId, id);
    const arquivo = await this.armazenamento.ler(documento.storageKey);
    if (!arquivo) throw new DocumentoAusenteError();
    return { bytes: arquivo.bytes, mime: arquivo.mime, nome: documento.nome };
  }

  async excluir(userId: string, id: string): Promise<void> {
    const chave = await this.documentos.excluir(userId, id);
    if (!chave) throw new DocumentoAusenteError();
    await this.armazenamento.apagar(chave).catch(() => undefined);
  }

  private async exigir(userId: string, id: string): Promise<DocumentoGravado> {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      throw new DocumentoAusenteError();
    }
    const documento = await this.documentos.buscar(userId, id);
    if (!documento) throw new DocumentoAusenteError();
    return documento;
  }
}

function visao(documento: DocumentoGravado): DocumentoVisivel {
  return {
    id: documento.id,
    tipo: TIPO_RESPOSTA[documento.tipo],
    nome: documento.nome,
    mime: documento.mime,
    tamanho: documento.bytes,
    temCodigo: documento.codigo !== null,
    carteira: documento.carteira ? CARTEIRA_RESPOSTA[documento.carteira] : null,
  };
}
