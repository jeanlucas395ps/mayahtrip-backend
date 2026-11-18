import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  AbaDoFeed,
  AvaliacaoNova,
  ComentarioLido,
  ComunidadeRepositorio,
  DenunciaNova,
  FalhaComunidade,
  MidiaNova,
  PublicacaoLida,
  PublicacaoNova,
} from '../../domain/comunidade.port';

const VISIVEL = `
  p.deleted_at IS NULL AND p.status = 'published'
  AND (
    p.user_id = $1
    OR (
      p.visibility = 'public'
      AND NOT EXISTS (
        SELECT 1 FROM community.user_blocks bloqueio
        WHERE (bloqueio.blocker_user_id = $1 AND bloqueio.blocked_user_id = p.user_id)
           OR (bloqueio.blocker_user_id = p.user_id AND bloqueio.blocked_user_id = $1)
      )
      AND NOT EXISTS (
        SELECT 1 FROM community.user_mutes silencio
        WHERE silencio.muter_user_id = $1 AND silencio.muted_user_id = p.user_id
      )
      AND (
        EXISTS (SELECT 1 FROM identity.user_profiles perfil WHERE perfil.user_id = p.user_id AND perfil.visibility = 'public')
        OR EXISTS (SELECT 1 FROM community.user_follows segue WHERE segue.follower_user_id = $1 AND segue.followed_user_id = p.user_id)
      )
    )
  )
`;

@Injectable()
export class ComunidadePgRepositorio implements ComunidadeRepositorio {
  constructor(@Inject(DataSource) private readonly dados: DataSource) {}

  feed(userId: string, aba: AbaDoFeed): Promise<PublicacaoLida[]> {
    const extra =
      aba === 'seguindo'
        ? `AND (p.user_id = $1 OR EXISTS (SELECT 1 FROM community.user_follows segue WHERE segue.follower_user_id = $1 AND segue.followed_user_id = p.user_id))`
        : aba === 'salvos'
          ? `AND EXISTS (SELECT 1 FROM community.saved_posts salvo WHERE salvo.user_id = $1 AND salvo.post_id = p.id)`
          : '';
    return this.listar(`WHERE ${VISIVEL} ${extra} ORDER BY p.created_at DESC LIMIT 30`, [userId]);
  }

  async criar(userId: string, entrada: PublicacaoNova): Promise<PublicacaoLida | FalhaComunidade> {
    const lugar = await this.lugares(entrada.placeIds);
    if (lugar !== 'ok') return lugar;
    const gente = await this.mencoes(userId, entrada.mentionIds);
    if (gente !== 'ok') return gente;
    const criadas = await this.dados.query<{ id: string }[]>(
      `INSERT INTO community.posts (user_id, content, visibility, origin, status, published_at)
       VALUES ($1, $2, $3::community.audience, 'user', 'published', clock_timestamp())
       RETURNING id`,
      [userId, entrada.content, entrada.visibility],
    );
    const id = criadas[0].id;
    await this.ligarLugares(id, entrada.placeIds);
    await this.ligarMencoes(id, entrada.mentionIds);
    const lista = await this.listar(`WHERE p.id = $2 AND p.user_id = $1`, [userId, id]);
    return lista[0];
  }

  async anexar(userId: string, postId: string, midia: MidiaNova): Promise<PublicacaoLida | FalhaComunidade> {
    const dono = await this.dono(userId, postId);
    if (dono !== 'ok') return dono;
    const capas = await this.dados.query<{ id: string }[]>(
      `SELECT id FROM community.post_media WHERE post_id = $1 AND is_cover`,
      [postId],
    );
    await this.dados.query(
      `INSERT INTO community.post_media (post_id, media_type, storage_key, width, height, byte_size, is_cover)
       VALUES ($1, 'photo', $2, $3, $4, $5, $6)`,
      [postId, midia.storageKey, midia.width, midia.height, midia.byteSize, capas.length === 0],
    );
    const lista = await this.listar(`WHERE p.id = $2 AND p.user_id = $1`, [userId, postId]);
    return lista[0];
  }

  async salvar(userId: string, postId: string, salvo: boolean): Promise<PublicacaoLida | FalhaComunidade> {
    if (!(await this.ve(userId, postId))) return 'ausente';
    if (salvo) {
      await this.dados.query(
        `INSERT INTO community.saved_posts (user_id, post_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [userId, postId],
      );
    } else {
      await this.dados.query(`DELETE FROM community.saved_posts WHERE user_id = $1 AND post_id = $2`, [userId, postId]);
    }
    const lista = await this.listar(`WHERE p.id = $2 AND ${VISIVEL}`, [userId, postId]);
    return lista[0];
  }

  async curtir(userId: string, postId: string, ativo: boolean): Promise<PublicacaoLida | FalhaComunidade> {
    if (!(await this.ve(userId, postId))) return 'ausente';
    if (ativo) {
      await this.dados.query(`INSERT INTO community.post_likes (post_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [postId, userId]);
    } else {
      await this.dados.query(`DELETE FROM community.post_likes WHERE post_id = $1 AND user_id = $2`, [postId, userId]);
    }
    const lista = await this.listar(`WHERE p.id = $2 AND ${VISIVEL}`, [userId, postId]);
    return lista[0];
  }

  async comentarios(userId: string, postId: string): Promise<ComentarioLido[] | FalhaComunidade> {
    if (!(await this.ve(userId, postId))) return 'ausente';
    return this.lerComentarios(userId, postId);
  }

  async comentar(userId: string, postId: string, content: string, parentId: string | null): Promise<ComentarioLido[] | FalhaComunidade> {
    if (!(await this.ve(userId, postId))) return 'ausente';
    if (await this.bloqueadoNoPost(userId, postId)) return 'proibido';
    if (parentId) {
      const pais = await this.dados.query<{ post_id: string; parent_comment_id: string | null }[]>(
        `SELECT post_id, parent_comment_id FROM community.comments WHERE id = $1 AND deleted_at IS NULL`,
        [parentId],
      );
      if (pais.length === 0 || pais[0].post_id !== postId) return 'ausente';
      if (pais[0].parent_comment_id) return 'nivel';
    }
    try {
      await this.dados.query(
        `INSERT INTO community.comments (post_id, user_id, parent_comment_id, content)
         VALUES ($1, $2, $3, $4)`,
        [postId, userId, parentId, content],
      );
    } catch (erro) {
      if (mensagemDe(erro).includes('comentario so tem um nivel')) return 'nivel';
      if (codigoDe(erro) === '23503') return 'ausente';
      throw erro;
    }
    return this.lerComentarios(userId, postId);
  }

  async apagarComentario(userId: string, commentId: string): Promise<'ok' | FalhaComunidade> {
    const linhas = await this.dados.query<{ user_id: string; author_id: string; post_id: string }[]>(
      `SELECT comentario.user_id, publicacao.user_id AS author_id, comentario.post_id
       FROM community.comments comentario
       JOIN community.posts publicacao ON publicacao.id = comentario.post_id
       WHERE comentario.id = $1 AND comentario.deleted_at IS NULL`,
      [commentId],
    );
    if (linhas.length === 0) return 'ausente';
    if (linhas[0].user_id !== userId && linhas[0].author_id !== userId) return 'proibido';
    await this.dados.query(
      `UPDATE community.comments SET deleted_at = clock_timestamp(), updated_at = clock_timestamp()
       WHERE id = $1 OR parent_comment_id = $1`,
      [commentId],
    );
    return 'ok';
  }

  async curtirComentario(userId: string, commentId: string, ativo: boolean): Promise<'ok' | FalhaComunidade> {
    const linhas = await this.dados.query<{ post_id: string }[]>(
      `SELECT post_id FROM community.comments WHERE id = $1 AND deleted_at IS NULL`,
      [commentId],
    );
    if (linhas.length === 0 || !(await this.ve(userId, linhas[0].post_id))) return 'ausente';
    if (ativo) {
      await this.dados.query(`INSERT INTO community.comment_likes (comment_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [commentId, userId]);
    } else {
      await this.dados.query(`DELETE FROM community.comment_likes WHERE comment_id = $1 AND user_id = $2`, [commentId, userId]);
    }
    return 'ok';
  }

  async seguir(userId: string, alvoId: string): Promise<'segue' | 'pedido' | FalhaComunidade> {
    if (userId === alvoId) return 'pessoa';
    if (await this.bloqueio(userId, alvoId)) return 'proibido';
    const perfis = await this.dados.query<{ visibility: 'public' | 'private' }[]>(
      `SELECT visibility::text AS visibility
       FROM identity.user_profiles perfil
       JOIN identity.users conta ON conta.id = perfil.user_id
       WHERE perfil.user_id = $1 AND conta.deleted_at IS NULL AND conta.status = 'active'`,
      [alvoId],
    );
    if (perfis.length === 0) return 'ausente';
    const ja = await this.dados.query(`SELECT 1 FROM community.user_follows WHERE follower_user_id = $1 AND followed_user_id = $2`, [userId, alvoId]);
    if (ja.length > 0) return 'segue';
    if (perfis[0].visibility === 'public') {
      await this.dados.query(`INSERT INTO community.user_follows (follower_user_id, followed_user_id) VALUES ($1, $2)`, [userId, alvoId]);
      return 'segue';
    }
    await this.dados.query(
      `INSERT INTO community.user_follow_requests (requester_user_id, target_user_id, status)
       VALUES ($1, $2, 'pending')
       ON CONFLICT (requester_user_id, target_user_id)
       DO UPDATE SET status = 'pending', resolved_at = NULL, created_at = clock_timestamp()`,
      [userId, alvoId],
    );
    return 'pedido';
  }

  async deixarDeSeguir(userId: string, alvoId: string): Promise<'ok' | FalhaComunidade> {
    await this.dados.query(`DELETE FROM community.user_follows WHERE follower_user_id = $1 AND followed_user_id = $2`, [userId, alvoId]);
    return 'ok';
  }

  async responderPedido(userId: string, requesterId: string, aceitar: boolean): Promise<'ok' | FalhaComunidade> {
    const pedidos = await this.dados.query(
      `SELECT 1 FROM community.user_follow_requests
       WHERE requester_user_id = $1 AND target_user_id = $2 AND status = 'pending'`,
      [requesterId, userId],
    );
    if (pedidos.length === 0) return 'pedido';
    await this.dados.transaction(async (tx) => {
      await tx.query(
        `UPDATE community.user_follow_requests
         SET status = $3::community.follow_request_status, resolved_at = clock_timestamp()
         WHERE requester_user_id = $1 AND target_user_id = $2`,
        [requesterId, userId, aceitar ? 'accepted' : 'rejected'],
      );
      if (aceitar) {
        await tx.query(
          `INSERT INTO community.user_follows (follower_user_id, followed_user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [requesterId, userId],
        );
      }
    });
    return 'ok';
  }

  async bloquear(userId: string, alvoId: string, ativo: boolean): Promise<'ok' | FalhaComunidade> {
    if (userId === alvoId) return 'pessoa';
    if (!(await this.existe(alvoId))) return 'ausente';
    if (!ativo) {
      await this.dados.query(`DELETE FROM community.user_blocks WHERE blocker_user_id = $1 AND blocked_user_id = $2`, [userId, alvoId]);
      return 'ok';
    }
    await this.dados.transaction(async (tx) => {
      await tx.query(
        `INSERT INTO community.user_blocks (blocker_user_id, blocked_user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [userId, alvoId],
      );
      await tx.query(
        `DELETE FROM community.user_follows
         WHERE (follower_user_id = $1 AND followed_user_id = $2) OR (follower_user_id = $2 AND followed_user_id = $1)`,
        [userId, alvoId],
      );
      await tx.query(
        `DELETE FROM community.user_follow_requests
         WHERE (requester_user_id = $1 AND target_user_id = $2) OR (requester_user_id = $2 AND target_user_id = $1)`,
        [userId, alvoId],
      );
    });
    return 'ok';
  }

  async silenciar(userId: string, alvoId: string, ativo: boolean): Promise<'ok' | FalhaComunidade> {
    if (userId === alvoId) return 'pessoa';
    if (!(await this.existe(alvoId))) return 'ausente';
    if (ativo) {
      await this.dados.query(
        `INSERT INTO community.user_mutes (muter_user_id, muted_user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [userId, alvoId],
      );
    } else {
      await this.dados.query(`DELETE FROM community.user_mutes WHERE muter_user_id = $1 AND muted_user_id = $2`, [userId, alvoId]);
    }
    return 'ok';
  }

  async avaliar(userId: string, placeId: string, entrada: AvaliacaoNova): Promise<PublicacaoLida | FalhaComunidade> {
    const lugar = await this.lugares([placeId]);
    if (lugar !== 'ok') return lugar;
    if (entrada.rating < 1 || entrada.rating > 5) return 'nota';
    const texto = entrada.reviewText?.trim() || 'Sem legenda.';
    const criadas = await this.dados.query<{ id: string }[]>(
      `INSERT INTO community.posts (user_id, content, visibility, origin, status, published_at)
       VALUES ($1, $2, 'public', 'review', 'published', clock_timestamp())
       RETURNING id`,
      [userId, texto],
    );
    const postId = criadas[0].id;
    await this.ligarLugares(postId, [placeId]);
    const avaliacoes = await this.dados.query<{ id: string }[]>(
      `INSERT INTO community.place_reviews (place_id, user_id, post_id, rating, review_text, status)
       VALUES ($1, $2, $3, $4, $5, 'published')
       RETURNING id`,
      [placeId, userId, postId, entrada.rating, texto],
    );
    await this.dados.query(
      `INSERT INTO community.post_media (post_id, media_type, storage_key, width, height, byte_size, is_cover)
       VALUES ($1, 'photo', $2, $3, $4, $5, true)`,
      [postId, entrada.storageKey, entrada.width, entrada.height, entrada.byteSize],
    );
    await this.dados.query(
      `INSERT INTO community.place_review_media (review_id, media_type, storage_key, width, height, byte_size, is_cover)
       VALUES ($1, 'photo', $2, $3, $4, $5, true)`,
      [avaliacoes[0].id, entrada.storageKey, entrada.width, entrada.height, entrada.byteSize],
    );
    const lista = await this.listar(`WHERE p.id = $2 AND p.user_id = $1`, [userId, postId]);
    return lista[0];
  }

  async nomeDe(userId: string): Promise<string> {
    const linhas = await this.dados.query<{ display_name: string }[]>(`SELECT display_name FROM identity.user_profiles WHERE user_id = $1`, [userId]);
    return linhas[0]?.display_name ?? '';
  }

  async autorDaPublicacao(postId: string): Promise<string | null> {
    const linhas = await this.dados.query<{ user_id: string }[]>(`SELECT user_id FROM community.posts WHERE id = $1 AND deleted_at IS NULL`, [postId]);
    return linhas[0]?.user_id ?? null;
  }

  async autorDoComentario(commentId: string): Promise<string | null> {
    const linhas = await this.dados.query<{ user_id: string }[]>(`SELECT user_id FROM community.comments WHERE id = $1 AND deleted_at IS NULL`, [commentId]);
    return linhas[0]?.user_id ?? null;
  }

  categorias(): Promise<{ id: string; name: string }[]> {
    return this.dados.query(`SELECT id, name FROM moderation.report_categories WHERE is_active ORDER BY name`);
  }

  async denunciar(userId: string, entrada: DenunciaNova): Promise<{ id: string } | FalhaComunidade> {
    const alvos = [entrada.postId, entrada.commentId, entrada.reviewId, entrada.reportedUserId].filter(Boolean);
    if (alvos.length !== 1) return 'alvo';
    const categorias = await this.dados.query(`SELECT 1 FROM moderation.report_categories WHERE id = $1 AND is_active`, [entrada.categoryId]);
    if (categorias.length === 0) return 'categoria';
    const criadas = await this.dados.query<{ id: string }[]>(
      `INSERT INTO moderation.user_reports
         (reporter_user_id, reported_user_id, post_id, comment_id, review_id, category_id, description, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')
       RETURNING id`,
      [userId, entrada.reportedUserId, entrada.postId, entrada.commentId, entrada.reviewId, entrada.categoryId, entrada.description],
    );
    return { id: criadas[0].id };
  }

  private async listar(where: string, params: unknown[]): Promise<PublicacaoLida[]> {
    const linhas = await this.dados.query<{
      id: string;
      user_id: string;
      username: string;
      display_name: string;
      content: string | null;
      visibility: 'public' | 'private';
      origin: 'user' | 'review';
      liked: boolean;
      saved: boolean;
      likes: string;
      comments: string;
    }[]>(
      `SELECT p.id, p.user_id, perfil.username, perfil.display_name, p.content, p.visibility::text AS visibility, p.origin::text AS origin,
              EXISTS (SELECT 1 FROM community.post_likes curtida WHERE curtida.post_id = p.id AND curtida.user_id = $1) AS liked,
              EXISTS (SELECT 1 FROM community.saved_posts salvo WHERE salvo.post_id = p.id AND salvo.user_id = $1) AS saved,
              (SELECT count(*) FROM community.post_likes curtida WHERE curtida.post_id = p.id)::text AS likes,
              (SELECT count(*) FROM community.comments comentario WHERE comentario.post_id = p.id AND comentario.parent_comment_id IS NULL AND comentario.deleted_at IS NULL)::text AS comments
       FROM community.posts p
       JOIN identity.user_profiles perfil ON perfil.user_id = p.user_id
       ${where}`,
      params,
    );
    if (linhas.length === 0) return [];
    const ids = linhas.map((linha) => linha.id);
    const lugares = await this.dados.query<{ post_id: string; id: string; name: string }[]>(
      `SELECT marca.post_id, lugar.id, lugar.name
       FROM community.post_places marca
       JOIN catalog.places lugar ON lugar.id = marca.place_id
       WHERE marca.post_id = ANY($1::uuid[])
       ORDER BY marca.sort_order, lugar.name`,
      [ids],
    );
    const mencoes = await this.dados.query<{ post_id: string; user_id: string; username: string }[]>(
      `SELECT mencao.post_id, mencao.mentioned_user_id AS user_id, perfil.username
       FROM community.post_mentions mencao
       JOIN identity.user_profiles perfil ON perfil.user_id = mencao.mentioned_user_id
       WHERE mencao.post_id = ANY($1::uuid[])`,
      [ids],
    );
    const capas = await this.dados.query<{ id: string; post_id: string; width: number; height: number }[]>(
      `SELECT id, post_id, width, height FROM community.post_media WHERE post_id = ANY($1::uuid[]) AND is_cover`,
      [ids],
    );
    return linhas.map((linha) => ({
      id: linha.id,
      authorId: linha.user_id,
      username: linha.username,
      displayName: linha.display_name,
      content: linha.content,
      visibility: linha.visibility,
      origin: linha.origin,
      liked: linha.liked,
      saved: linha.saved,
      likeCount: Number(linha.likes),
      commentCount: Number(linha.comments),
      places: lugares.filter((lugar) => lugar.post_id === linha.id).map((lugar) => ({ id: lugar.id, name: lugar.name })),
      mentions: mencoes.filter((mencao) => mencao.post_id === linha.id).map((mencao) => ({ userId: mencao.user_id, username: mencao.username })),
      cover: capas.filter((capa) => capa.post_id === linha.id).map((capa) => ({ id: capa.id, width: capa.width, height: capa.height }))[0] ?? null,
    }));
  }

  private async lerComentarios(userId: string, postId: string): Promise<ComentarioLido[]> {
    const linhas = await this.dados.query<{
      id: string;
      user_id: string;
      username: string;
      content: string;
      parent_comment_id: string | null;
      likes: string;
      liked: boolean;
    }[]>(
      `SELECT comentario.id, comentario.user_id, perfil.username, comentario.content, comentario.parent_comment_id,
              (SELECT count(*) FROM community.comment_likes curtida WHERE curtida.comment_id = comentario.id)::text AS likes,
              EXISTS (SELECT 1 FROM community.comment_likes curtida WHERE curtida.comment_id = comentario.id AND curtida.user_id = $2) AS liked
       FROM community.comments comentario
       JOIN identity.user_profiles perfil ON perfil.user_id = comentario.user_id
       WHERE comentario.post_id = $1 AND comentario.deleted_at IS NULL
         AND NOT EXISTS (
           SELECT 1 FROM community.user_blocks bloqueio
           WHERE (bloqueio.blocker_user_id = $2 AND bloqueio.blocked_user_id = comentario.user_id)
              OR (bloqueio.blocker_user_id = comentario.user_id AND bloqueio.blocked_user_id = $2)
         )
       ORDER BY comentario.created_at DESC, comentario.id`,
      [postId, userId],
    );
    const pais = linhas.filter((linha) => !linha.parent_comment_id);
    return pais.map((pai) => ({
      ...comentarioDe(pai),
      replies: linhas.filter((linha) => linha.parent_comment_id === pai.id).reverse().map(comentarioDe),
    }));
  }

  private async lugares(ids: string[]): Promise<'ok' | 'lugar'> {
    const unicos = [...new Set(ids)];
    const linhas = await this.dados.query(`SELECT id FROM catalog.places WHERE status = 'active' AND id = ANY($1::uuid[])`, [unicos]);
    return linhas.length === unicos.length ? 'ok' : 'lugar';
  }

  private async mencoes(userId: string, ids: string[]): Promise<'ok' | FalhaComunidade> {
    if (ids.length === 0) return 'ok';
    const unicos = [...new Set(ids)];
    const linhas = await this.dados.query<{ id: string }[]>(
      `SELECT conta.id FROM identity.users conta WHERE conta.deleted_at IS NULL AND conta.id = ANY($1::uuid[])`,
      [unicos],
    );
    if (linhas.length !== unicos.length) return 'pessoa';
    const bloqueio = await this.dados.query(
      `SELECT 1 FROM community.user_blocks
       WHERE (blocker_user_id = $1 AND blocked_user_id = ANY($2::uuid[]))
          OR (blocked_user_id = $1 AND blocker_user_id = ANY($2::uuid[]))`,
      [userId, unicos],
    );
    return bloqueio.length > 0 ? 'proibido' : 'ok';
  }

  private async ligarLugares(postId: string, ids: string[]): Promise<void> {
    for (const [ordem, id] of [...new Set(ids)].entries()) {
      await this.dados.query(`INSERT INTO community.post_places (post_id, place_id, sort_order) VALUES ($1, $2, $3)`, [postId, id, ordem]);
    }
  }

  private async ligarMencoes(postId: string, ids: string[]): Promise<void> {
    for (const id of [...new Set(ids)]) {
      await this.dados.query(`INSERT INTO community.post_mentions (post_id, mentioned_user_id) VALUES ($1, $2)`, [postId, id]);
    }
  }

  private async dono(userId: string, postId: string): Promise<'ok' | 'ausente'> {
    const linhas = await this.dados.query(`SELECT 1 FROM community.posts WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL`, [postId, userId]);
    return linhas.length > 0 ? 'ok' : 'ausente';
  }

  private async ve(userId: string, postId: string): Promise<boolean> {
    const linhas = await this.dados.query(`SELECT 1 FROM community.posts p WHERE p.id = $2 AND ${VISIVEL}`, [userId, postId]);
    return linhas.length > 0;
  }

  private async bloqueadoNoPost(userId: string, postId: string): Promise<boolean> {
    const linhas = await this.dados.query(
      `SELECT 1 FROM community.posts p
       JOIN community.user_blocks bloqueio
         ON (bloqueio.blocker_user_id = $1 AND bloqueio.blocked_user_id = p.user_id)
         OR (bloqueio.blocker_user_id = p.user_id AND bloqueio.blocked_user_id = $1)
       WHERE p.id = $2`,
      [userId, postId],
    );
    return linhas.length > 0;
  }

  private async bloqueio(a: string, b: string): Promise<boolean> {
    const linhas = await this.dados.query(
      `SELECT 1 FROM community.user_blocks
       WHERE (blocker_user_id = $1 AND blocked_user_id = $2) OR (blocker_user_id = $2 AND blocked_user_id = $1)`,
      [a, b],
    );
    return linhas.length > 0;
  }

  private async existe(userId: string): Promise<boolean> {
    const linhas = await this.dados.query(`SELECT 1 FROM identity.users WHERE id = $1 AND deleted_at IS NULL AND status = 'active'`, [userId]);
    return linhas.length > 0;
  }
}

function comentarioDe(linha: { id: string; user_id: string; username: string; content: string; parent_comment_id: string | null; likes: string; liked: boolean }): ComentarioLido {
  return {
    id: linha.id,
    authorId: linha.user_id,
    username: linha.username,
    content: linha.content,
    parentId: linha.parent_comment_id,
    likeCount: Number(linha.likes),
    liked: linha.liked,
    replies: [],
  };
}

function codigoDe(erro: unknown): string | undefined {
  if (typeof erro !== 'object' || erro === null) return undefined;
  const direto = 'code' in erro ? (erro as { code?: unknown }).code : undefined;
  if (typeof direto === 'string') return direto;
  const driver = 'driverError' in erro ? (erro as { driverError?: { code?: unknown } }).driverError : undefined;
  return typeof driver?.code === 'string' ? driver.code : undefined;
}

function mensagemDe(erro: unknown): string {
  if (!(erro instanceof Error)) return '';
  const driver = 'driverError' in erro ? (erro as { driverError?: { message?: unknown } }).driverError : undefined;
  return `${erro.message} ${typeof driver?.message === 'string' ? driver.message : ''}`;
}
