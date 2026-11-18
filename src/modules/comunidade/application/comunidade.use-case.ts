import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { ARMAZENAMENTO, ArmazenamentoDeArquivo } from '../../identidade/domain/ports/armazenamento.port';
import {
  AbaDoFeed,
  AvaliacaoNova,
  ComentarioLido,
  COMUNIDADE,
  ComunidadeRepositorio,
  DenunciaNova,
  FalhaComunidade,
  PublicacaoLida,
  PublicacaoNova,
} from '../domain/comunidade.port';

const FOTOS = new Set(['image/jpeg', 'image/png', 'image/webp']);
const TETO = 10 * 1024 * 1024;

export interface FotoRecebida {
  bytes: Buffer;
  mime: string;
  width: number;
  height: number;
}

@Injectable()
export class ComunidadeUseCase {
  constructor(
    @Inject(COMUNIDADE) private readonly comunidade: ComunidadeRepositorio,
    @Inject(ARMAZENAMENTO) private readonly arquivos: ArmazenamentoDeArquivo,
  ) {}

  feed(userId: string, aba: AbaDoFeed): Promise<PublicacaoLida[]> {
    return this.comunidade.feed(userId, aba);
  }

  criar(userId: string, entrada: PublicacaoNova): Promise<PublicacaoLida | FalhaComunidade> {
    return this.comunidade.criar(userId, entrada);
  }

  async anexar(userId: string, postId: string, foto: FotoRecebida): Promise<PublicacaoLida | FalhaComunidade> {
    const midia = fotoValida(foto);
    if (midia !== 'ok') return midia;
    const chave = `comunidade/${postId}/midia-${randomUUID()}`;
    await this.arquivos.guardar(chave, foto.bytes, foto.mime);
    const resultado = await this.comunidade.anexar(userId, postId, { storageKey: chave, mime: foto.mime, width: foto.width, height: foto.height, byteSize: foto.bytes.length });
    if (typeof resultado === 'string') await this.arquivos.apagar(chave);
    return resultado;
  }

  salvar(userId: string, postId: string, salvo: boolean): Promise<PublicacaoLida | FalhaComunidade> {
    return this.comunidade.salvar(userId, postId, salvo);
  }

  curtir(userId: string, postId: string, ativo: boolean): Promise<PublicacaoLida | FalhaComunidade> {
    return this.comunidade.curtir(userId, postId, ativo);
  }

  comentarios(userId: string, postId: string): Promise<ComentarioLido[] | FalhaComunidade> {
    return this.comunidade.comentarios(userId, postId);
  }

  comentar(userId: string, postId: string, content: string, parentId: string | null): Promise<ComentarioLido[] | FalhaComunidade> {
    return this.comunidade.comentar(userId, postId, content.trim(), parentId);
  }

  apagarComentario(userId: string, commentId: string): Promise<'ok' | FalhaComunidade> {
    return this.comunidade.apagarComentario(userId, commentId);
  }

  curtirComentario(userId: string, commentId: string, ativo: boolean): Promise<'ok' | FalhaComunidade> {
    return this.comunidade.curtirComentario(userId, commentId, ativo);
  }

  seguir(userId: string, alvoId: string): Promise<'segue' | 'pedido' | FalhaComunidade> {
    return this.comunidade.seguir(userId, alvoId);
  }

  deixarDeSeguir(userId: string, alvoId: string): Promise<'ok' | FalhaComunidade> {
    return this.comunidade.deixarDeSeguir(userId, alvoId);
  }

  responderPedido(userId: string, requesterId: string, aceitar: boolean): Promise<'ok' | FalhaComunidade> {
    return this.comunidade.responderPedido(userId, requesterId, aceitar);
  }

  bloquear(userId: string, alvoId: string, ativo: boolean): Promise<'ok' | FalhaComunidade> {
    return this.comunidade.bloquear(userId, alvoId, ativo);
  }

  silenciar(userId: string, alvoId: string, ativo: boolean): Promise<'ok' | FalhaComunidade> {
    return this.comunidade.silenciar(userId, alvoId, ativo);
  }

  async avaliar(userId: string, placeId: string, rating: number, reviewText: string | null, foto: FotoRecebida): Promise<PublicacaoLida | FalhaComunidade> {
    const midia = fotoValida(foto);
    if (midia !== 'ok') return midia;
    if (rating < 1 || rating > 5) return 'nota';
    const chave = `comunidade/avaliacoes/${placeId}-${randomUUID()}`;
    await this.arquivos.guardar(chave, foto.bytes, foto.mime);
    const entrada: AvaliacaoNova = { storageKey: chave, mime: foto.mime, width: foto.width, height: foto.height, byteSize: foto.bytes.length, rating, reviewText };
    const resultado = await this.comunidade.avaliar(userId, placeId, entrada);
    if (typeof resultado === 'string') await this.arquivos.apagar(chave);
    return resultado;
  }

  categorias(): Promise<{ id: string; name: string }[]> {
    return this.comunidade.categorias();
  }

  denunciar(userId: string, entrada: DenunciaNova): Promise<{ id: string } | FalhaComunidade> {
    return this.comunidade.denunciar(userId, entrada);
  }
}

function fotoValida(foto: FotoRecebida): 'ok' | 'midia' {
  if (!FOTOS.has(foto.mime) || foto.bytes.length === 0 || foto.bytes.length > TETO) return 'midia';
  if (!Number.isInteger(foto.width) || !Number.isInteger(foto.height) || foto.width < 1 || foto.height < 1 || foto.width > 1920 || foto.height > 1920) return 'midia';
  return 'ok';
}
