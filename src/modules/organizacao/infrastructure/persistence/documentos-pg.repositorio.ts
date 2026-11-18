import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { visaoDe } from '../../../viagem/domain/visao';
import {
  DocumentoNovo,
  DocumentosLidos,
  DocumentosRepositorio,
  FalhaDocumento,
  LinkNovo,
} from '../../domain/documentos.port';
import { acessoDaViagem } from '../acesso';

@Injectable()
export class DocumentosPgRepositorio implements DocumentosRepositorio {
  constructor(@Inject(DataSource) private readonly dados: DataSource) {}

  async listar(userId: string, viagemId: string): Promise<DocumentosLidos | FalhaDocumento> {
    const acesso = await this.acesso(userId, viagemId);
    if (acesso !== 'ok') return acesso;
    return this.montar(viagemId);
  }

  async criar(userId: string, viagemId: string, documento: DocumentoNovo): Promise<DocumentosLidos | FalhaDocumento> {
    const acesso = await this.acesso(userId, viagemId);
    if (acesso !== 'ok') return acesso;
    await this.dados.query(
      `INSERT INTO organization.trip_documents
         (trip_id, uploaded_by_user_id, name, document_type, storage_key, mime_type, file_size)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [viagemId, userId, documento.name, documento.documentType, documento.storageKey, documento.mimeType, documento.fileSize],
    );
    return this.montar(viagemId);
  }

  async chave(userId: string, viagemId: string, documentoId: string): Promise<string | null | FalhaDocumento> {
    const acesso = await this.acesso(userId, viagemId);
    if (acesso !== 'ok') return acesso;
    const linhas = await this.dados.query<{ storage_key: string }[]>(
      `SELECT storage_key FROM organization.trip_documents
       WHERE id = $1 AND trip_id = $2 AND deleted_at IS NULL`,
      [documentoId, viagemId],
    );
    return linhas[0]?.storage_key ?? null;
  }

  async excluir(userId: string, viagemId: string, documentoId: string): Promise<{ lista: DocumentosLidos; chave: string } | FalhaDocumento> {
    const acesso = await this.acesso(userId, viagemId);
    if (acesso !== 'ok') return acesso;
    const linhas = await this.dados.query<{ storage_key: string }[]>(
      `UPDATE organization.trip_documents
       SET deleted_at = clock_timestamp()
       WHERE id = $1 AND trip_id = $2 AND deleted_at IS NULL
       RETURNING storage_key`,
      [documentoId, viagemId],
    );
    const gravadas = linhasRetornadas(linhas);
    if (gravadas.length === 0) return 'sumido';
    return { lista: await this.montar(viagemId), chave: gravadas[0].storage_key };
  }

  async criarLink(userId: string, viagemId: string, link: LinkNovo): Promise<DocumentosLidos | FalhaDocumento> {
    const acesso = await this.acesso(userId, viagemId);
    if (acesso !== 'ok') return acesso;
    await this.dados.query(
      `INSERT INTO organization.trip_links (trip_id, created_by_user_id, title, url, description)
       VALUES ($1, $2, $3, $4, $5)`,
      [viagemId, userId, link.title, link.url, link.description],
    );
    return this.montar(viagemId);
  }

  async editarLink(userId: string, viagemId: string, linkId: string, link: LinkNovo): Promise<DocumentosLidos | FalhaDocumento> {
    const acesso = await this.acesso(userId, viagemId);
    if (acesso !== 'ok') return acesso;
    const linhas = await this.dados.query<{ id: string }[]>(
      `UPDATE organization.trip_links
       SET title = $3, url = $4, description = $5
       WHERE id = $1 AND trip_id = $2
       RETURNING id`,
      [linkId, viagemId, link.title, link.url, link.description],
    );
    if (linhasRetornadas(linhas).length === 0) return 'sumido';
    return this.montar(viagemId);
  }

  async excluirLink(userId: string, viagemId: string, linkId: string): Promise<DocumentosLidos | FalhaDocumento> {
    const acesso = await this.acesso(userId, viagemId);
    if (acesso !== 'ok') return acesso;
    const linhas = await this.dados.query<{ id: string }[]>(
      `DELETE FROM organization.trip_links WHERE id = $1 AND trip_id = $2 RETURNING id`,
      [linkId, viagemId],
    );
    if (linhasRetornadas(linhas).length === 0) return 'sumido';
    return this.montar(viagemId);
  }

  private async acesso(userId: string, viagemId: string): Promise<'ok' | FalhaDocumento> {
    const acesso = await acessoDaViagem(this.dados, viagemId, userId);
    if (acesso === 'ausente') return 'ausente';
    return visaoDe(acesso.role).documents ? 'ok' : 'proibido';
  }

  private async montar(viagemId: string): Promise<DocumentosLidos> {
    const documentos = await this.dados.query<{ id: string; name: string; document_type: string | null; mime_type: string | null; file_size: string | null }[]>(
      `SELECT id, name, document_type, mime_type, file_size::text
       FROM organization.trip_documents
       WHERE trip_id = $1 AND deleted_at IS NULL
       ORDER BY created_at DESC, id`,
      [viagemId],
    );
    const links = await this.dados.query<{ id: string; title: string; url: string; description: string | null }[]>(
      `SELECT id, title, url, description
       FROM organization.trip_links
       WHERE trip_id = $1
       ORDER BY created_at, id`,
      [viagemId],
    );
    return {
      documents: documentos.map((linha) => ({
        id: linha.id,
        name: linha.name,
        documentType: linha.document_type,
        mimeType: linha.mime_type,
        fileSize: linha.file_size === null ? null : Number(linha.file_size),
      })),
      links: links.map((linha) => ({ id: linha.id, title: linha.title, url: linha.url, description: linha.description })),
    };
  }
}

function linhasRetornadas<T>(resultado: T[] | [T[], number]): T[] {
  return Array.isArray(resultado[0]) ? resultado[0] : (resultado as T[]);
}
