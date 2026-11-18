import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { ARMAZENAMENTO, ArmazenamentoDeArquivo } from '../../identidade/domain/ports/armazenamento.port';
import { DOCUMENTOS, DocumentosLidos, DocumentosRepositorio, FalhaDocumento, LinkNovo } from '../domain/documentos.port';

const MIMES = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);
const LIMITE_BYTES = 10 * 1024 * 1024;

@Injectable()
export class DocumentosUseCase {
  constructor(
    @Inject(DOCUMENTOS) private readonly documentos: DocumentosRepositorio,
    @Inject(ARMAZENAMENTO) private readonly arquivos: ArmazenamentoDeArquivo,
  ) {}

  listar(userId: string, viagemId: string): Promise<DocumentosLidos | FalhaDocumento> {
    return this.documentos.listar(userId, viagemId);
  }

  async guardar(
    userId: string,
    viagemId: string,
    nome: string,
    tipo: string | undefined,
    bytes: Buffer,
    mime: string,
  ): Promise<DocumentosLidos | FalhaDocumento> {
    const name = nome.trim();
    const documentType = tipo?.trim() || null;
    if (!MIMES.has(mime) || bytes.length === 0 || bytes.length > LIMITE_BYTES || !name || name.length > 255 || (documentType && documentType.length > 80)) {
      return 'arquivo';
    }
    const chave = `viagens/${viagemId}/documento-${randomUUID()}`;
    await this.arquivos.guardar(chave, bytes, mime);
    const gravado = await this.documentos.criar(userId, viagemId, { name, documentType, storageKey: chave, mimeType: mime, fileSize: bytes.length });
    if (typeof gravado === 'string') {
      await this.arquivos.apagar(chave);
      return gravado;
    }
    return gravado;
  }

  async ler(userId: string, viagemId: string, documentoId: string): Promise<{ bytes: Buffer; mime: string } | FalhaDocumento> {
    const chave = await this.documentos.chave(userId, viagemId, documentoId);
    if (chave === 'ausente' || chave === 'proibido' || chave === 'sumido' || chave === 'arquivo') return chave;
    if (!chave) return 'sumido';
    const arquivo = await this.arquivos.ler(chave);
    return arquivo ?? 'sumido';
  }

  async excluir(userId: string, viagemId: string, documentoId: string): Promise<DocumentosLidos | FalhaDocumento> {
    const apagado = await this.documentos.excluir(userId, viagemId, documentoId);
    if (typeof apagado === 'string') return apagado;
    await this.arquivos.apagar(apagado.chave);
    return apagado.lista;
  }

  criarLink(userId: string, viagemId: string, link: LinkNovo): Promise<DocumentosLidos | FalhaDocumento> {
    return this.documentos.criarLink(userId, viagemId, link);
  }

  editarLink(userId: string, viagemId: string, linkId: string, link: LinkNovo): Promise<DocumentosLidos | FalhaDocumento> {
    return this.documentos.editarLink(userId, viagemId, linkId, link);
  }

  excluirLink(userId: string, viagemId: string, linkId: string): Promise<DocumentosLidos | FalhaDocumento> {
    return this.documentos.excluirLink(userId, viagemId, linkId);
  }
}
