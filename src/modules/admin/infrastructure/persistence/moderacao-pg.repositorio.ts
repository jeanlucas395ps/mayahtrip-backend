import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  DenunciaLida,
  FalhaModeracao,
  Julgamento,
  ModeracaoRepositorio,
  PublicacaoDoPainel,
  TarefaEditorial,
} from '../../domain/ports/moderacao.port';

@Injectable()
export class ModeracaoPgRepositorio implements ModeracaoRepositorio {
  constructor(@Inject(DataSource) private readonly dados: DataSource) {}

  async denuncias(status: string | null): Promise<DenunciaLida[]> {
    const linhas = await this.dados.query<{
      id: string;
      status: DenunciaLida['status'];
      category: string;
      description: string | null;
      reporter_user_id: string;
      reporter_name: string;
      reported_user_id: string | null;
      post_id: string | null;
      comment_id: string | null;
      review_id: string | null;
      created_at: Date;
    }[]>(
      `SELECT denuncia.id, denuncia.status::text AS status, categoria.name AS category, denuncia.description,
              denuncia.reporter_user_id, perfil.display_name AS reporter_name,
              denuncia.reported_user_id, denuncia.post_id, denuncia.comment_id, denuncia.review_id, denuncia.created_at
       FROM moderation.user_reports denuncia
       JOIN moderation.report_categories categoria ON categoria.id = denuncia.category_id
       JOIN identity.user_profiles perfil ON perfil.user_id = denuncia.reporter_user_id
       WHERE ($1::text IS NULL OR denuncia.status::text = $1)
       ORDER BY denuncia.created_at DESC
       LIMIT 100`,
      [status],
    );
    return linhas.map((linha) => {
      const alvo = alvoDe(linha);
      return {
        id: linha.id,
        status: linha.status,
        category: linha.category,
        description: linha.description,
        reporterId: linha.reporter_user_id,
        reporterName: linha.reporter_name,
        target: alvo.tipo,
        targetId: alvo.id,
        createdAt: linha.created_at.toISOString(),
      };
    });
  }

  async assumir(reportId: string): Promise<'ok' | FalhaModeracao> {
    const linhas = await this.dados.query<{ status: string }[]>(`SELECT status::text AS status FROM moderation.user_reports WHERE id = $1`, [reportId]);
    if (linhas.length === 0) return 'ausente';
    if (linhas[0].status === 'resolved' || linhas[0].status === 'dismissed') return 'fechada';
    await this.dados.query(`UPDATE moderation.user_reports SET status = 'reviewing' WHERE id = $1`, [reportId]);
    return 'ok';
  }

  async julgar(reportId: string, adminId: string, julgamento: Julgamento): Promise<{ actionId: string; accountId: string | null; reporterId: string; decision: 'resolved' | 'dismissed' } | FalhaModeracao> {
    const linhas = await this.dados.query<{
      status: string;
      reporter_user_id: string;
      reported_user_id: string | null;
      post_id: string | null;
      comment_id: string | null;
      review_id: string | null;
    }[]>(
      `SELECT status::text AS status, reporter_user_id, reported_user_id, post_id, comment_id, review_id
       FROM moderation.user_reports WHERE id = $1`,
      [reportId],
    );
    if (linhas.length === 0) return 'ausente';
    if (linhas[0].status === 'resolved' || linhas[0].status === 'dismissed') return 'fechada';
    const denuncia = linhas[0];
    const alvo = alvoDe(denuncia);
    const dono = await this.donoDoAlvo(denuncia);
    await this.dados.transaction(async (tx) => {
      if (julgamento.decision === 'resolved' && julgamento.removeContent) {
        if (denuncia.post_id) await tx.query(`UPDATE community.posts SET status = 'removed', updated_at = clock_timestamp() WHERE id = $1`, [denuncia.post_id]);
        if (denuncia.comment_id) {
          await tx.query(
            `UPDATE community.comments SET deleted_at = clock_timestamp(), updated_at = clock_timestamp() WHERE id = $1 OR parent_comment_id = $1`,
            [denuncia.comment_id],
          );
        }
        if (denuncia.review_id) {
          await tx.query(`UPDATE community.place_reviews SET status = 'removed', updated_at = clock_timestamp() WHERE id = $1`, [denuncia.review_id]);
          await tx.query(
            `UPDATE community.posts SET status = 'removed', updated_at = clock_timestamp()
             WHERE id = (SELECT post_id FROM community.place_reviews WHERE id = $1)`,
            [denuncia.review_id],
          );
        }
      }
      await tx.query(
        `UPDATE moderation.user_reports SET status = $2::community.report_status, resolved_at = clock_timestamp() WHERE id = $1`,
        [reportId, julgamento.decision],
      );
    });
    const acoes = await this.dados.query<{ id: string }[]>(
      `INSERT INTO moderation.moderation_actions
         (admin_user_id, target_user_id, target_content_type, target_content_id, action_type, reason)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [adminId, dono, alvo.tipo, alvo.id, julgamento.decision === 'resolved' ? 'report.resolved' : 'report.dismissed', julgamento.reason],
    );
    return { actionId: acoes[0].id, accountId: julgamento.deactivateAccount ? dono : null, reporterId: denuncia.reporter_user_id, decision: julgamento.decision };
  }

  async registrarRecurso(adminId: string, actionId: string, email: string, reason: string | null): Promise<{ id: string } | FalhaModeracao> {
    const acoes = await this.dados.query(`SELECT 1 FROM moderation.moderation_actions WHERE id = $1`, [actionId]);
    if (acoes.length === 0) return 'ausente';
    const criados = await this.dados.query<{ id: string }[]>(
      `INSERT INTO moderation.moderation_appeals (moderation_action_id, requester_email, channel, reason, reviewed_by_admin_id)
       VALUES ($1, $2, 'email', $3, $4)
       RETURNING id`,
      [actionId, email, reason, adminId],
    );
    return { id: criados[0].id };
  }

  async lerRecurso(id: string): Promise<{ id: string; channel: string; email: string; actionId: string } | 'ausente'> {
    const linhas = await this.dados.query<{ id: string; channel: string; email: string; action_id: string }[]>(
      `SELECT id, channel::text AS channel, requester_email AS email, moderation_action_id AS action_id
       FROM moderation.moderation_appeals WHERE id = $1`,
      [id],
    );
    if (linhas.length === 0) return 'ausente';
    return { id: linhas[0].id, channel: linhas[0].channel, email: linhas[0].email, actionId: linhas[0].action_id };
  }

  async publicacoes(filtro: { q: string | null; from: string | null; to: string | null; status: string | null }): Promise<PublicacaoDoPainel[]> {
    const busca = filtro.q ? `%${filtro.q.replace(/[%_\\]/g, (letra) => `\\${letra}`)}%` : null;
    const linhas = await this.dados.query<{
      id: string;
      status: string;
      origin: string;
      content: string | null;
      author_name: string;
      place_name: string | null;
      rating: number | null;
      likes: string;
      comments: string;
      created_at: Date;
    }[]>(
      `SELECT p.id, p.status::text AS status, p.origin::text AS origin, p.content, perfil.display_name AS author_name,
              (SELECT lugar.name FROM community.post_places marca JOIN catalog.places lugar ON lugar.id = marca.place_id WHERE marca.post_id = p.id ORDER BY marca.sort_order LIMIT 1) AS place_name,
              (SELECT avaliacao.rating FROM community.place_reviews avaliacao WHERE avaliacao.post_id = p.id) AS rating,
              (SELECT count(*) FROM community.post_likes curtida WHERE curtida.post_id = p.id)::text AS likes,
              (SELECT count(*) FROM community.comments comentario WHERE comentario.post_id = p.id AND comentario.parent_comment_id IS NULL)::text AS comments,
              p.created_at
       FROM community.posts p
       JOIN identity.user_profiles perfil ON perfil.user_id = p.user_id
       WHERE p.deleted_at IS NULL
         AND ($1::text IS NULL OR perfil.display_name ILIKE $1 ESCAPE '\\' OR perfil.username ILIKE $1 ESCAPE '\\' OR p.content ILIKE $1 ESCAPE '\\'
              OR EXISTS (
                SELECT 1 FROM community.post_places marca
                JOIN catalog.places lugar ON lugar.id = marca.place_id
                WHERE marca.post_id = p.id AND lugar.name ILIKE $1 ESCAPE '\\'
              ))
         AND ($2::date IS NULL OR p.created_at::date >= $2::date)
         AND ($3::date IS NULL OR p.created_at::date <= $3::date)
         AND ($4::text IS NULL OR ($4 = 'removed' AND p.status = 'removed') OR ($4 = 'visible' AND p.status = 'published'))
       ORDER BY p.created_at DESC
       LIMIT 50`,
      [busca, filtro.from, filtro.to, filtro.status],
    );
    if (linhas.length === 0) return [];
    const ids = linhas.map((linha) => linha.id);
    const comentarios = await this.dados.query<{ id: string; post_id: string; content: string; author_name: string; likes: string; removed: boolean }[]>(
      `SELECT comentario.id, comentario.post_id, comentario.content, perfil.display_name AS author_name,
              (SELECT count(*) FROM community.comment_likes curtida WHERE curtida.comment_id = comentario.id)::text AS likes,
              comentario.deleted_at IS NOT NULL AS removed
       FROM community.comments comentario
       JOIN identity.user_profiles perfil ON perfil.user_id = comentario.user_id
       WHERE comentario.post_id = ANY($1::uuid[]) AND comentario.parent_comment_id IS NULL
       ORDER BY comentario.created_at DESC`,
      [ids],
    );
    return linhas.map((linha) => ({
      id: linha.id,
      status: linha.status,
      origin: linha.origin,
      content: linha.content,
      authorName: linha.author_name,
      placeName: linha.place_name,
      rating: linha.rating === null ? null : Number(linha.rating),
      likeCount: Number(linha.likes),
      commentCount: Number(linha.comments),
      createdAt: linha.created_at.toISOString(),
      comments: comentarios
        .filter((comentario) => comentario.post_id === linha.id)
        .map((comentario) => ({
          id: comentario.id,
          content: comentario.content,
          authorName: comentario.author_name,
          likeCount: Number(comentario.likes),
          removed: comentario.removed,
        })),
    }));
  }

  async definirPublicacao(postId: string, removida: boolean): Promise<'ok' | 'ausente'> {
    const linhas = await this.dados.query(
      `UPDATE community.posts SET status = $2::community.content_status, updated_at = clock_timestamp()
       WHERE id = $1 AND deleted_at IS NULL
       RETURNING id`,
      [postId, removida ? 'removed' : 'published'],
    );
    const ids = linhasRetornadas<{ id: string }>(linhas);
    if (ids.length === 0) return 'ausente';
    await this.dados.query(
      `UPDATE community.place_reviews SET status = $2::community.content_status, updated_at = clock_timestamp() WHERE post_id = $1`,
      [postId, removida ? 'removed' : 'published'],
    );
    return 'ok';
  }

  async definirComentario(commentId: string, removido: boolean): Promise<'ok' | 'ausente'> {
    const linhas = await this.dados.query(
      `UPDATE community.comments
       SET deleted_at = CASE WHEN $2 THEN clock_timestamp() ELSE NULL END, updated_at = clock_timestamp()
       WHERE id = $1 OR parent_comment_id = $1
       RETURNING id`,
      [commentId, removido],
    );
    return linhasRetornadas(linhas).length > 0 ? 'ok' : 'ausente';
  }

  async abrirEditorial(adminId: string, ingestionItemId: string): Promise<{ id: string } | 'ausente'> {
    const itens = await this.dados.query(`SELECT 1 FROM ingestion.ingestion_items WHERE id = $1`, [ingestionItemId]);
    if (itens.length === 0) return 'ausente';
    const criadas = await this.dados.query<{ id: string }[]>(
      `INSERT INTO moderation.content_review_tasks (ingestion_item_id, assigned_admin_id, status)
       VALUES ($1, $2, 'pending')
       RETURNING id`,
      [ingestionItemId, adminId],
    );
    return { id: criadas[0].id };
  }

  async decidir(
    adminId: string,
    taskId: string,
    decision: 'approved' | 'rejected' | 'edited' | 'escalated',
    reason: string | null,
  ): Promise<TarefaEditorial | FalhaModeracao> {
    const tarefas = await this.dados.query<{ ingestion_item_id: string; status: string }[]>(
      `SELECT ingestion_item_id, status FROM moderation.content_review_tasks WHERE id = $1 AND ingestion_item_id IS NOT NULL`,
      [taskId],
    );
    if (tarefas.length === 0) return 'ausente';
    if (tarefas[0].status === 'completed') return 'fechada';
    const itemId = tarefas[0].ingestion_item_id;
    await this.dados.transaction(async (tx) => {
      await tx.query(
        `INSERT INTO moderation.content_review_decisions (task_id, admin_user_id, decision, reason)
         VALUES ($1, $2, $3::moderation.decision_type, $4)`,
        [taskId, adminId, decision, reason],
      );
      if (decision === 'approved') {
        const lugares = await tx.query<{ place_id: string | null }[]>(`SELECT place_id FROM ingestion.ingestion_items WHERE id = $1`, [itemId]);
        await tx.query(
          `INSERT INTO moderation.content_publications (ingestion_item_id, place_id, published_by_admin_id, published_at)
           VALUES ($1, $2, $3, clock_timestamp())`,
          [itemId, lugares[0]?.place_id ?? null, adminId],
        );
        await tx.query(`UPDATE ingestion.ingestion_items SET status = 'published', reviewed_at = clock_timestamp(), updated_at = clock_timestamp() WHERE id = $1`, [itemId]);
        await tx.query(`UPDATE moderation.content_review_tasks SET status = 'completed', completed_at = clock_timestamp() WHERE id = $1`, [taskId]);
      } else if (decision === 'rejected') {
        await tx.query(`UPDATE ingestion.ingestion_items SET status = 'rejected', reviewed_at = clock_timestamp(), updated_at = clock_timestamp() WHERE id = $1`, [itemId]);
        await tx.query(`UPDATE moderation.content_review_tasks SET status = 'completed', completed_at = clock_timestamp() WHERE id = $1`, [taskId]);
      } else {
        await tx.query(`UPDATE moderation.content_review_tasks SET status = $2 WHERE id = $1`, [taskId, decision]);
      }
    });
    const lida = await this.lerTarefa(taskId);
    return lida === 'ausente' ? 'ausente' : lida;
  }

  async pedirRemocao(publicationId: string, email: string | null, reason: string | null): Promise<{ id: string } | 'ausente'> {
    const publicacoes = await this.dados.query<{ ingestion_item_id: string }[]>(
      `SELECT ingestion_item_id FROM moderation.content_publications WHERE id = $1`,
      [publicationId],
    );
    if (publicacoes.length === 0) return 'ausente';
    const criados = await this.dados.query<{ id: string }[]>(
      `INSERT INTO moderation.content_removal_requests (ingestion_item_id, publication_id, requester_email, reason, status, resolved_at)
       VALUES ($1, $2, $3, $4, 'resolved', clock_timestamp())
       RETURNING id`,
      [publicacoes[0].ingestion_item_id, publicationId, email, reason],
    );
    await this.dados.query(
      `UPDATE moderation.content_publications SET removed_at = clock_timestamp(), removal_reason = $2 WHERE id = $1`,
      [publicationId, reason],
    );
    await this.dados.query(
      `UPDATE ingestion.ingestion_items SET status = 'removed', updated_at = clock_timestamp() WHERE id = $1`,
      [publicacoes[0].ingestion_item_id],
    );
    return { id: criados[0].id };
  }

  async lerTarefa(taskId: string): Promise<TarefaEditorial | 'ausente'> {
    const linhas = await this.dados.query<{ id: string; status: string; ingestion_item_id: string; decision: string | null; publication_id: string | null }[]>(
      `SELECT tarefa.id, tarefa.status, tarefa.ingestion_item_id,
              (SELECT decisao.decision::text FROM moderation.content_review_decisions decisao WHERE decisao.task_id = tarefa.id ORDER BY decisao.created_at DESC LIMIT 1) AS decision,
              (SELECT publicacao.id FROM moderation.content_publications publicacao WHERE publicacao.ingestion_item_id = tarefa.ingestion_item_id ORDER BY publicacao.published_at DESC LIMIT 1) AS publication_id
       FROM moderation.content_review_tasks tarefa
       WHERE tarefa.id = $1`,
      [taskId],
    );
    if (linhas.length === 0) return 'ausente';
    return {
      id: linhas[0].id,
      status: linhas[0].status,
      ingestionItemId: linhas[0].ingestion_item_id,
      decision: linhas[0].decision,
      publicationId: linhas[0].publication_id,
    };
  }

  private async donoDoAlvo(denuncia: { reported_user_id: string | null; post_id: string | null; comment_id: string | null; review_id: string | null }): Promise<string | null> {
    if (denuncia.reported_user_id) return denuncia.reported_user_id;
    if (denuncia.post_id) {
      const linhas = await this.dados.query<{ user_id: string }[]>(`SELECT user_id FROM community.posts WHERE id = $1`, [denuncia.post_id]);
      return linhas[0]?.user_id ?? null;
    }
    if (denuncia.comment_id) {
      const linhas = await this.dados.query<{ user_id: string }[]>(`SELECT user_id FROM community.comments WHERE id = $1`, [denuncia.comment_id]);
      return linhas[0]?.user_id ?? null;
    }
    if (denuncia.review_id) {
      const linhas = await this.dados.query<{ user_id: string }[]>(`SELECT user_id FROM community.place_reviews WHERE id = $1`, [denuncia.review_id]);
      return linhas[0]?.user_id ?? null;
    }
    return null;
  }
}

function alvoDe(linha: { reported_user_id: string | null; post_id: string | null; comment_id: string | null; review_id: string | null }): { tipo: DenunciaLida['target']; id: string } {
  if (linha.post_id) return { tipo: 'post', id: linha.post_id };
  if (linha.comment_id) return { tipo: 'comment', id: linha.comment_id };
  if (linha.review_id) return { tipo: 'review', id: linha.review_id };
  return { tipo: 'profile', id: linha.reported_user_id ?? '' };
}

function linhasRetornadas<T>(resultado: T[] | [T[], number]): T[] {
  return Array.isArray(resultado[0]) ? resultado[0] : (resultado as T[]);
}
