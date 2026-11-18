import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { CarteiraDocumento, TipoDocumento } from '../../../domain/documento';
import { DocumentoGravado, DocumentoNovo, DocumentoRepositorio } from '../../../domain/ports/documento-repositorio.port';

interface LinhaDocumento {
  id: string;
  user_id: string;
  document_type: TipoDocumento;
  file_name: string;
  storage_key: string;
  mime_type: string;
  byte_size: number;
  barcode_payload: string | null;
  wallet_provider: CarteiraDocumento | null;
}

const COLUNAS = `id, user_id, document_type::text, file_name, storage_key, mime_type, byte_size, barcode_payload, wallet_provider::text`;

@Injectable()
export class DocumentoTypeOrmRepositorio implements DocumentoRepositorio {
  constructor(@Inject(DataSource) private readonly dados: DataSource) {}

  async inserir(documento: DocumentoNovo): Promise<string> {
    const linhas = await this.dados.query<{ id: string }[]>(
      `INSERT INTO identity.user_documents
         (user_id, document_type, file_name, storage_key, mime_type, byte_size, barcode_payload, wallet_provider)
       VALUES ($1, $2::identity.document_type, $3, $4, $5, $6, $7, $8::identity.wallet_provider)
       RETURNING id`,
      [
        documento.userId,
        documento.tipo,
        documento.nome,
        documento.storageKey,
        documento.mime,
        documento.bytes,
        documento.codigo,
        documento.carteira,
      ],
    );
    return linhas[0].id;
  }

  async listar(userId: string): Promise<DocumentoGravado[]> {
    const linhas = await this.dados.query<LinhaDocumento[]>(
      `SELECT ${COLUNAS} FROM identity.user_documents
       WHERE user_id = $1 AND deleted_at IS NULL
       ORDER BY created_at DESC`,
      [userId],
    );
    return linhas.map(paraDocumento);
  }

  async buscar(userId: string, id: string): Promise<DocumentoGravado | null> {
    const linhas = await this.dados.query<LinhaDocumento[]>(
      `SELECT ${COLUNAS} FROM identity.user_documents
       WHERE user_id = $1 AND id = $2 AND deleted_at IS NULL`,
      [userId, id],
    );
    return linhas[0] ? paraDocumento(linhas[0]) : null;
  }

  async excluir(userId: string, id: string): Promise<string | null> {
    const resultado = await this.dados.query<{ storage_key: string }[]>(
      `UPDATE identity.user_documents
       SET deleted_at = now()
       WHERE user_id = $1 AND id = $2 AND deleted_at IS NULL
       RETURNING storage_key`,
      [userId, id],
    );
    // O driver devolve [linhas, quantidade] em UPDATE. Em SELECT devolve só as linhas.
    const linhas = Array.isArray(resultado[0]) ? resultado[0] : resultado;
    return linhas[0]?.storage_key ?? null;
  }
}

function paraDocumento(linha: LinhaDocumento): DocumentoGravado {
  return {
    id: linha.id,
    userId: linha.user_id,
    tipo: linha.document_type,
    nome: linha.file_name,
    storageKey: linha.storage_key,
    mime: linha.mime_type,
    bytes: Number(linha.byte_size),
    codigo: linha.barcode_payload,
    carteira: linha.wallet_provider,
  };
}
