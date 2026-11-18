import { Inject, Injectable } from '@nestjs/common';
import Redis from 'ioredis';
import { DataSource } from 'typeorm';

const FONTES = [
  ['Google Places', 'place', 'google_places'],
  ['TikTok', 'video', 'tiktok'],
  ['YouTube', 'video', 'youtube'],
  ['Pixabay', 'image', 'pixabay'],
  ['Unsplash', 'image', 'unsplash'],
  ['Pexels', 'image', 'pexels'],
] as const;

const PROVEDORES = FONTES.map((fonte) => fonte[2]);

export const AJUSTES: Record<string, { min: number; max: number; espelho?: string; descricao: string }> = {
  trip_calendar_max_days: { min: 1, max: 366, descricao: 'Teto do calendário, cerca de 3 meses.' },
  trip_flexible_max_days: { min: 1, max: 366, descricao: 'Teto dos dias flexíveis.' },
  handoff_ttl_seconds: { min: 1, max: 3600, descricao: 'Código que abre o site a partir do app. Uso único.' },
  refresh_keep_signed_in_days: { min: 1, max: 365, descricao: 'Sessão com manter conectado.' },
  refresh_session_days: { min: 1, max: 365, descricao: 'Sessão sem manter conectado.' },
  'refund.trial_days': { min: 1, max: 365, espelho: 'trial_refund_days', descricao: 'Estorno comum só até estes dias depois do teste.' },
  'refund.duplicate_days': { min: 1, max: 365, espelho: 'refund_window_days', descricao: 'Janela para estornar cobrança duplicada.' },
};

const STATUS_DE_ITEM = new Set(['discovered', 'processing', 'ai_validated', 'pending_review', 'failed', 'removal_requested']);
const FILAS = new Set(['itinerary', 'notification', 'ingestion']);

export type FalhaPlataforma = 'ausente' | 'inativa' | 'bloqueado' | 'faixa' | 'estado' | 'chave' | 'fonte';

export interface FonteLida {
  id: string;
  name: string;
  provider: string | null;
  sourceType: string;
  isActive: boolean;
  licenseLabel: string;
  canStore: boolean;
  canRepublish: boolean;
  rateLimitPerMinute: number | null;
  termsUrl: string | null;
  notes: string | null;
}

export interface ColetaNova {
  sourceId: string;
  externalId: string;
  title: string;
  originalUrl?: string | null;
  mediaType?: 'image' | 'video' | null;
  mediaUrl?: string | null;
  metadataKey?: string | null;
  metadataValue?: string | null;
  licenseName?: string | null;
}

export interface ColetaLida {
  jobId: string;
  itemId: string;
  eventId: string;
  reused: boolean;
}

@Injectable()
export class PlataformaUseCase {
  constructor(@Inject(DataSource) private readonly dados: DataSource) {}

  async garantirFontes(): Promise<void> {
    await this.dados.query(
      `INSERT INTO ingestion.content_sources (name, source_type, provider, is_active)
       SELECT v.name, v.source_type, v.provider, false
       FROM (VALUES
         ('Google Places', 'place', 'google_places'),
         ('TikTok', 'video', 'tiktok'),
         ('YouTube', 'video', 'youtube'),
         ('Pixabay', 'image', 'pixabay'),
         ('Unsplash', 'image', 'unsplash'),
         ('Pexels', 'image', 'pexels')
       ) AS v(name, source_type, provider)
       WHERE NOT EXISTS (
         SELECT 1 FROM ingestion.content_sources existente WHERE existente.provider = v.provider
       )`,
    );
    await this.dados.query(
      `INSERT INTO ingestion.content_source_policies (source_id, license_label, can_store, can_republish, notes)
       SELECT fonte.id, 'unknown', false, false, 'Candidata. Ainda não autorizada a guardar nem republicar arquivo.'
       FROM ingestion.content_sources fonte
       WHERE fonte.provider = ANY($1::text[])
         AND NOT EXISTS (
           SELECT 1 FROM ingestion.content_source_policies politica WHERE politica.source_id = fonte.id
         )`,
      [PROVEDORES],
    );
    await this.dados.query(
      `UPDATE ingestion.content_sources fonte
       SET is_active = false, updated_at = clock_timestamp()
       WHERE fonte.provider = ANY($1::text[])
         AND NOT EXISTS (
           SELECT 1 FROM ingestion.content_source_policies politica
           WHERE politica.source_id = fonte.id AND politica.reviewed_at IS NOT NULL
         )`,
      [PROVEDORES],
    );
  }

  fontes(): Promise<FonteLida[]> {
    return this.dados.query<FonteLida[]>(
      `SELECT fonte.id, fonte.name, fonte.provider, fonte.source_type AS "sourceType", fonte.is_active AS "isActive",
              COALESCE(politica.license_label, 'unknown') AS "licenseLabel",
              COALESCE(politica.can_store, false) AS "canStore",
              COALESCE(politica.can_republish, false) AS "canRepublish",
              politica.rate_limit_per_minute AS "rateLimitPerMinute",
              politica.terms_url AS "termsUrl",
              politica.notes
       FROM ingestion.content_sources fonte
       LEFT JOIN LATERAL (
         SELECT license_label, can_store, can_republish, rate_limit_per_minute, terms_url, notes
         FROM ingestion.content_source_policies politica
         WHERE politica.source_id = fonte.id
         ORDER BY politica.reviewed_at DESC NULLS LAST, politica.id
         LIMIT 1
       ) politica ON true
       WHERE fonte.provider = ANY($1::text[])
       ORDER BY fonte.name`,
      [PROVEDORES],
    );
  }

  async ativarFonte(id: string, adminId: string, isActive: boolean): Promise<FonteLida | FalhaPlataforma> {
    const linhas = linhasRetornadas(
      await this.dados.query(
        `UPDATE ingestion.content_sources SET is_active = $2, updated_at = clock_timestamp()
         WHERE id = $1 AND provider = ANY($3::text[]) RETURNING id`,
        [id, isActive, PROVEDORES],
      ),
    );
    if (linhas.length === 0) return 'ausente';
    await this.dados.query(
      `UPDATE ingestion.content_source_policies
       SET reviewed_at = clock_timestamp(), reviewed_by_admin_id = $2
       WHERE source_id = $1`,
      [id, adminId],
    );
    const lista = await this.fontes();
    return lista.find((fonte) => fonte.id === id) ?? 'ausente';
  }

  async atualizarPolitica(
    id: string,
    adminId: string,
    rateLimitPerMinute: number | null,
    termsUrl: string | null,
    notes: string | null,
  ): Promise<FonteLida | FalhaPlataforma> {
    const fontes = await this.dados.query(`SELECT 1 FROM ingestion.content_sources WHERE id = $1 AND provider = ANY($2::text[])`, [id, PROVEDORES]);
    if (fontes.length === 0) return 'ausente';
    await this.dados.query(
      `UPDATE ingestion.content_source_policies
       SET rate_limit_per_minute = $2, terms_url = $3, notes = $4, reviewed_by_admin_id = $5, reviewed_at = clock_timestamp()
       WHERE source_id = $1`,
      [id, rateLimitPerMinute, termsUrl, notes, adminId],
    );
    const lista = await this.fontes();
    return lista.find((fonte) => fonte.id === id) ?? 'ausente';
  }

  async coletar(entrada: ColetaNova, chave: string | null): Promise<ColetaLida | FalhaPlataforma> {
    if (chave) {
      const guardada = await this.lerChave(chave, 'ingestion.collect');
      if (guardada === 'chave') return 'chave';
      if (guardada) return { ...guardada, reused: true };
    }
    try {
      const criada = await this.dados.transaction(async (tx) => {
        const fontes = await tx.query<{ is_active: boolean }[]>(
          `SELECT is_active FROM ingestion.content_sources WHERE id = $1 AND provider = ANY($2::text[])`,
          [entrada.sourceId, PROVEDORES],
        );
        if (fontes.length === 0) return 'fonte' as const;
        if (!fontes[0].is_active) return 'inativa' as const;
        const jobs = await tx.query<{ id: string }[]>(
          `INSERT INTO ingestion.ingestion_jobs (source_id, status, job_type, items_collected)
           VALUES ($1, 'pending', 'collect', 1) RETURNING id`,
          [entrada.sourceId],
        );
        const jobId = linhasRetornadas(jobs)[0].id;
        const itens = await tx.query<{ id: string }[]>(
          `INSERT INTO ingestion.ingestion_items (source_id, external_id, title, original_url, status, collected_at)
           VALUES ($1, $2, $3, $4, 'discovered', clock_timestamp()) RETURNING id`,
          [entrada.sourceId, entrada.externalId, entrada.title, entrada.originalUrl ?? null],
        );
        const itemId = linhasRetornadas(itens)[0].id;
        await tx.query(
          `INSERT INTO ingestion.ingestion_job_items (job_id, external_item_id, status) VALUES ($1, $2, 'discovered')`,
          [jobId, entrada.externalId],
        );
        if (entrada.mediaUrl) {
          await tx.query(
            `INSERT INTO ingestion.ingestion_item_media (ingestion_item_id, media_type, original_url, license_label)
             VALUES ($1, $2, $3, 'unknown')`,
            [itemId, entrada.mediaType ?? 'image', entrada.mediaUrl],
          );
        }
        if (entrada.metadataKey) {
          await tx.query(
            `INSERT INTO ingestion.ingestion_item_metadata (ingestion_item_id, metadata_key, metadata_value)
             VALUES ($1, $2, to_jsonb($3::text))`,
            [itemId, entrada.metadataKey, entrada.metadataValue ?? ''],
          );
        }
        await tx.query(
          `INSERT INTO ingestion.content_licenses (ingestion_item_id, license_name, license_label)
           VALUES ($1, $2, 'unknown')`,
          [itemId, entrada.licenseName?.trim() || 'unknown'],
        );
        await tx.query(
          `INSERT INTO ingestion.content_ai_validations (ingestion_item_id, model, result)
           VALUES ($1, 'manual', '{}'::jsonb)`,
          [itemId],
        );
        await tx.query(
          `INSERT INTO ingestion.content_provenance (ingestion_item_id, source_url, source_name, collected_at)
           SELECT $1, $2, fonte.name, clock_timestamp()
           FROM ingestion.content_sources fonte WHERE fonte.id = $3`,
          [itemId, entrada.originalUrl ?? null, entrada.sourceId],
        );
        const eventos = await tx.query<{ id: string }[]>(
          `INSERT INTO platform.outbox_events (aggregate_type, aggregate_id, event_type, payload)
           VALUES ('ingestion_job', $1, 'ingestion_job_requested', $2::jsonb) RETURNING id`,
          [jobId, JSON.stringify({ jobId, itemId })],
        );
        const eventId = linhasRetornadas(eventos)[0].id;
        const corpo: ColetaLida = { jobId, itemId, eventId, reused: false };
        if (chave) {
          await tx.query(
            `INSERT INTO platform.idempotency_keys (idempotency_key, scope, response_status, response_body)
             VALUES ($1, 'ingestion.collect', 201, $2::jsonb)`,
            [chave, JSON.stringify(corpo)],
          );
        }
        return corpo;
      });
      return criada;
    } catch (erro) {
      if (chave && codigoDe(erro) === '23505') {
        const guardada = await this.lerChave(chave, 'ingestion.collect');
        if (guardada && guardada !== 'chave') return { ...guardada, reused: true };
        return 'chave';
      }
      throw erro;
    }
  }

  async avancarItem(
    id: string,
    status: string,
    notas: { relevanceScore?: number | null; qualityScore?: number | null; duplicateScore?: number | null },
  ): Promise<{ id: string; status: string } | FalhaPlataforma> {
    if (!STATUS_DE_ITEM.has(status)) return 'estado';
    for (const nota of [notas.relevanceScore, notas.qualityScore, notas.duplicateScore]) {
      if (nota !== null && nota !== undefined && (nota < 0 || nota > 1)) return 'faixa';
    }
    const linhas = linhasRetornadas(
      await this.dados.query<{ id: string; external_id: string | null; source_id: string }[]>(
        `UPDATE ingestion.ingestion_items
         SET status = $2::ingestion.item_status, updated_at = clock_timestamp()
         WHERE id = $1
         RETURNING id, external_id, source_id`,
        [id, status],
      ),
    );
    if (linhas.length === 0) return 'ausente';
    await this.dados.query(
      `UPDATE ingestion.ingestion_job_items item
       SET status = $1::ingestion.item_status
       WHERE item.external_item_id = $2
         AND item.job_id = (
           SELECT job.id FROM ingestion.ingestion_jobs job
           WHERE job.source_id = $3
           ORDER BY job.created_at DESC
           LIMIT 1
         )`,
      [status, linhas[0].external_id, linhas[0].source_id],
    );
    if (status === 'ai_validated') {
      await this.dados.query(
        `UPDATE ingestion.content_ai_validations
         SET relevance_score = $2, quality_score = $3, duplicate_score = $4, model = 'manual',
             result = jsonb_build_object('status', 'ai_validated')
         WHERE ingestion_item_id = $1`,
        [id, notas.relevanceScore ?? null, notas.qualityScore ?? null, notas.duplicateScore ?? null],
      );
    }
    return { id, status };
  }

  async gravarMidia(id: string, mediaType: 'image' | 'video', originalUrl: string | null, storageKey: string | null): Promise<{ id: string } | FalhaPlataforma> {
    if (storageKey && storageKey.trim() !== '') return 'bloqueado';
    const itens = await this.dados.query(`SELECT 1 FROM ingestion.ingestion_items WHERE id = $1`, [id]);
    if (itens.length === 0) return 'ausente';
    const criadas = await this.dados.query<{ id: string }[]>(
      `INSERT INTO ingestion.ingestion_item_media (ingestion_item_id, media_type, original_url, license_label)
       VALUES ($1, $2, $3, 'unknown') RETURNING id`,
      [id, mediaType, originalUrl],
    );
    return { id: linhasRetornadas(criadas)[0].id };
  }

  async associarLugar(id: string, placeId: string): Promise<{ id: string; placeId: string } | FalhaPlataforma> {
    const lugares = await this.dados.query(`SELECT 1 FROM catalog.places WHERE id = $1`, [placeId]);
    if (lugares.length === 0) return 'ausente';
    const linhas = linhasRetornadas(
      await this.dados.query(`UPDATE ingestion.ingestion_items SET place_id = $2, updated_at = clock_timestamp() WHERE id = $1 RETURNING id`, [id, placeId]),
    );
    if (linhas.length === 0) return 'ausente';
    return { id, placeId };
  }

  async reavaliarLicenca(
    id: string,
    licenseName: string,
    licenseUrl: string | null,
    attribution: string | null,
  ): Promise<{ id: string; licenseName: string; licenseLabel: string } | FalhaPlataforma> {
    const itens = await this.dados.query(`SELECT 1 FROM ingestion.ingestion_items WHERE id = $1`, [id]);
    if (itens.length === 0) return 'ausente';
    const criadas = await this.dados.query<{ id: string }[]>(
      `INSERT INTO ingestion.content_licenses (ingestion_item_id, license_name, license_url, license_label, attribution_text, verified_at)
       VALUES ($1, $2, $3, 'unknown', $4, clock_timestamp()) RETURNING id`,
      [id, licenseName.trim() || 'unknown', licenseUrl, attribution],
    );
    return { id: linhasRetornadas(criadas)[0].id, licenseName: licenseName.trim() || 'unknown', licenseLabel: 'unknown' };
  }

  async pedirRemocao(id: string, email: string | null, reason: string | null): Promise<{ id: string } | FalhaPlataforma> {
    const itens = await this.dados.query<{ external_id: string | null; source_id: string }[]>(
      `SELECT external_id, source_id FROM ingestion.ingestion_items WHERE id = $1`,
      [id],
    );
    if (itens.length === 0) return 'ausente';
    const criados = await this.dados.query<{ id: string }[]>(
      `INSERT INTO moderation.content_removal_requests (ingestion_item_id, requester_email, reason, status)
       VALUES ($1, $2, $3, 'pending') RETURNING id`,
      [id, email, reason],
    );
    await this.dados.query(
      `UPDATE ingestion.ingestion_items SET status = 'removal_requested', updated_at = clock_timestamp() WHERE id = $1`,
      [id],
    );
    await this.dados.query(
      `UPDATE ingestion.ingestion_job_items item
       SET status = 'removal_requested'
       WHERE item.external_item_id = $1
         AND item.job_id = (
           SELECT job.id FROM ingestion.ingestion_jobs job WHERE job.source_id = $2 ORDER BY job.created_at DESC LIMIT 1
         )`,
      [itens[0].external_id, itens[0].source_id],
    );
    return { id: criados[0].id };
  }

  itens() {
    return this.dados.query(
      `SELECT item.id, item.title, item.status::text AS status, item.original_url AS "originalUrl", item.place_id AS "placeId",
              fonte.name AS "sourceName",
              (SELECT publicacao.id FROM moderation.content_publications publicacao
               WHERE publicacao.ingestion_item_id = item.id
               ORDER BY publicacao.published_at DESC NULLS LAST LIMIT 1) AS "publicationId"
       FROM ingestion.ingestion_items item
       JOIN ingestion.content_sources fonte ON fonte.id = item.source_id
       WHERE fonte.provider = ANY($1::text[])
       ORDER BY item.created_at DESC
       LIMIT 50`,
      [PROVEDORES],
    );
  }

  async transitarJob(id: string, acao: 'run' | 'pause' | 'cancel' | 'finish'): Promise<{ id: string; status: string } | FalhaPlataforma> {
    const regra = {
      run: { de: ['pending'], para: 'running', inicio: true, fim: false },
      pause: { de: ['running'], para: 'pending', inicio: false, fim: false },
      cancel: { de: ['pending', 'running'], para: 'cancelled', inicio: false, fim: true },
      finish: { de: ['running'], para: 'completed', inicio: false, fim: true },
    }[acao];
    const linhas = linhasRetornadas(
      await this.dados.query<{ id: string; status: string }[]>(
        `UPDATE ingestion.ingestion_jobs
         SET status = $2::ingestion.job_status,
             started_at = CASE WHEN $3 THEN COALESCE(started_at, clock_timestamp()) ELSE started_at END,
             finished_at = CASE WHEN $4 THEN clock_timestamp() ELSE finished_at END
         WHERE id = $1 AND status = ANY($5::ingestion.job_status[])
         RETURNING id, status::text AS status`,
        [id, regra.para, regra.inicio, regra.fim, regra.de],
      ),
    );
    if (linhas.length === 0) {
      const existe = await this.dados.query(`SELECT 1 FROM ingestion.ingestion_jobs WHERE id = $1`, [id]);
      return existe.length === 0 ? 'ausente' : 'estado';
    }
    return linhas[0];
  }

  async ajustes() {
    const chaves = Object.keys(AJUSTES);
    const linhas = await this.dados.query<{ setting_key: string; setting_value: unknown; description: string | null }[]>(
      `SELECT setting_key, setting_value, description FROM platform.system_settings WHERE setting_key = ANY($1::text[])`,
      [chaves],
    );
    const mapa = new Map(linhas.map((linha) => [linha.setting_key, linha]));
    return chaves.map((chave) => {
      const regra = AJUSTES[chave];
      const gravado = mapa.get(chave);
      return {
        key: chave,
        value: inteiro(gravado?.setting_value) ?? padrao(chave),
        description: gravado?.description ?? regra.descricao,
        min: regra.min,
        max: regra.max,
      };
    });
  }

  async salvarAjuste(adminId: string, chave: string, valor: number): Promise<{ key: string; value: number } | FalhaPlataforma> {
    const regra = AJUSTES[chave];
    if (!regra) return 'chave';
    if (!Number.isInteger(valor) || valor < regra.min || valor > regra.max) return 'faixa';
    await gravarAjuste(this.dados, chave, valor, regra.descricao, adminId);
    if (regra.espelho) await gravarAjuste(this.dados, regra.espelho, valor, regra.descricao, adminId);
    return { key: chave, value: valor };
  }

  bandeiras() {
    return this.dados.query(
      `SELECT id, flag_key AS "flagKey", description, is_enabled AS "isEnabled"
       FROM platform.feature_flags
       ORDER BY flag_key
       LIMIT 100`,
    );
  }

  async criarBandeira(adminId: string, flagKey: string, description: string | null): Promise<{ id: string; flagKey: string; isEnabled: boolean } | 'chave'> {
    if (!/^[a-z0-9._-]{2,150}$/.test(flagKey)) return 'chave';
    try {
      const criadas = await this.dados.query<{ id: string }[]>(
        `INSERT INTO platform.feature_flags (flag_key, description, is_enabled, updated_by_admin_id)
         VALUES ($1, $2, false, $3) RETURNING id`,
        [flagKey, description, adminId],
      );
      return { id: linhasRetornadas(criadas)[0].id, flagKey, isEnabled: false };
    } catch (erro) {
      if (codigoDe(erro) === '23505') return 'chave';
      throw erro;
    }
  }

  async alternarBandeira(adminId: string, id: string): Promise<{ id: string; flagKey: string; isEnabled: boolean } | 'ausente'> {
    const linhas = linhasRetornadas(
      await this.dados.query<{ id: string; flagKey: string; isEnabled: boolean }[]>(
        `UPDATE platform.feature_flags
         SET is_enabled = NOT is_enabled, updated_by_admin_id = $2, updated_at = clock_timestamp()
         WHERE id = $1
         RETURNING id, flag_key AS "flagKey", is_enabled AS "isEnabled"`,
        [id, adminId],
      ),
    );
    return linhas[0] ?? 'ausente';
  }

  async confirmarEvento(consumer: string, eventId: string): Promise<{ eventId: string; duplicated: boolean } | FalhaPlataforma> {
    if (!/^[a-z0-9._-]{2,80}$/.test(consumer)) return 'chave';
    const eventos = await this.dados.query(`SELECT 1 FROM platform.outbox_events WHERE id = $1`, [eventId]);
    if (eventos.length === 0) return 'ausente';
    const criados = linhasRetornadas(
      await this.dados.query(
        `INSERT INTO platform.processed_events (consumer_name, event_id)
         VALUES ($1, $2)
         ON CONFLICT (consumer_name, event_id) DO NOTHING
         RETURNING id`,
        [consumer, eventId],
      ),
    );
    return { eventId, duplicated: criados.length === 0 };
  }

  async expirar(): Promise<{ expired: number; runId: string }> {
    return this.dados.transaction(async (tx) => {
      const linhas = linhasRetornadas(
        await tx.query(
          `UPDATE subscription.user_subscriptions s
           SET status = 'expired'::subscription.subscription_status, updated_at = clock_timestamp()
           WHERE s.status IN ('active', 'trialing', 'past_due')
             AND s.current_period_end IS NOT NULL
             AND s.current_period_end <= clock_timestamp()
             AND NOT EXISTS (
               SELECT 1 FROM subscription.promo_grants g
               WHERE g.id = s.promo_grant_id AND g.revoked_at IS NULL AND g.ends_at > clock_timestamp()
             )
             AND NOT EXISTS (
               SELECT 1 FROM subscription.coupons c
               WHERE c.id = s.coupon_id
                 AND s.started_at IS NOT NULL
                 AND s.started_at + make_interval(days => c.free_days) > clock_timestamp()
             )
             AND NOT EXISTS (
               SELECT 1 FROM subscription.subscription_payments p
               WHERE p.subscription_id = s.id
                 AND p.status = 'paid'
                 AND p.paid_at IS NOT NULL
                 AND p.paid_at >= s.current_period_end
             )
           RETURNING s.id`,
        ),
      );
      const corridas = await tx.query<{ id: string }[]>(
        `INSERT INTO platform.scheduled_job_runs (job_name, status, started_at, finished_at, result)
         VALUES ('subscription.expiry', 'completed', clock_timestamp(), clock_timestamp(), $1::jsonb)
         RETURNING id`,
        [JSON.stringify({ expired: linhas.length })],
      );
      return { expired: linhas.length, runId: linhasRetornadas(corridas)[0].id };
    });
  }

  corridas() {
    return this.dados.query(
      `SELECT id, job_name AS "jobName", status::text AS status, started_at AS "startedAt", finished_at AS "finishedAt", result
       FROM platform.scheduled_job_runs
       WHERE job_name = 'subscription.expiry'
       ORDER BY created_at DESC
       LIMIT 10`,
    );
  }

  async filas() {
    const [geracao, aviso, ingestao, recentesGeracao, recentesAviso, recentesIngestao] = await Promise.all([
      this.dados.query<{ status: string; total: number }[]>(
        `SELECT status::text AS status, count(*)::int AS total FROM itinerary.itinerary_generation_jobs GROUP BY status`,
      ),
      this.dados.query<{ status: string; total: number }[]>(
        `SELECT status::text AS status, count(*)::int AS total
         FROM notification.notification_deliveries
         WHERE channel IN ('in_app', 'push')
         GROUP BY status`,
      ),
      this.dados.query<{ status: string; total: number }[]>(
        `SELECT status::text AS status, count(*)::int AS total FROM ingestion.ingestion_jobs GROUP BY status`,
      ),
      this.dados.query(
        `SELECT id, status::text AS status, created_at AS "createdAt"
         FROM itinerary.itinerary_generation_jobs ORDER BY created_at DESC LIMIT 20`,
      ),
      this.dados.query(
        `SELECT id, status::text AS status, created_at AS "createdAt"
         FROM notification.notification_deliveries
         WHERE channel IN ('in_app', 'push')
         ORDER BY created_at DESC LIMIT 20`,
      ),
      this.dados.query(
        `SELECT id, status::text AS status, created_at AS "createdAt"
         FROM ingestion.ingestion_jobs ORDER BY created_at DESC LIMIT 20`,
      ),
    ]);
    return {
      workers: { itinerary: 'parado', notification: 'parado', ingestion: 'parado' },
      itinerary: { ...contagem(geracao, { processing: 'processing' }), jobs: recentesGeracao },
      notification: { ...contagem(aviso, { processing: 'processing' }), jobs: recentesAviso },
      ingestion: { ...contagem(ingestao, { processing: 'running' }), jobs: recentesIngestao },
    };
  }

  async limparFila(fila: string, escopo: 'pending' | 'processing'): Promise<{ cleared: number } | FalhaPlataforma> {
    if (!FILAS.has(fila)) return 'chave';
    if (fila === 'itinerary') {
      const status = escopo === 'processing' ? 'processing' : 'pending';
      const linhas = linhasRetornadas(
        await this.dados.query(
          `UPDATE itinerary.itinerary_generation_jobs
           SET status = 'failed', error_message = 'limpo pelo painel', finished_at = clock_timestamp()
           WHERE status = $1::itinerary.generation_status RETURNING id`,
          [status],
        ),
      );
      return { cleared: linhas.length };
    }
    if (fila === 'notification') {
      if (escopo === 'processing') return { cleared: 0 };
      const linhas = linhasRetornadas(
        await this.dados.query(
          `UPDATE notification.notification_deliveries
           SET status = 'failed', error_message = 'limpo pelo painel'
           WHERE status = 'pending' AND channel IN ('in_app', 'push') RETURNING id`,
        ),
      );
      return { cleared: linhas.length };
    }
    const status = escopo === 'processing' ? 'running' : 'pending';
    const linhas = linhasRetornadas(
      await this.dados.query(
        `UPDATE ingestion.ingestion_jobs
         SET status = 'failed', error_message = 'limpo pelo painel', finished_at = clock_timestamp()
         WHERE status = $1::ingestion.job_status RETURNING id`,
        [status],
      ),
    );
    return { cleared: linhas.length };
  }

  async recolocar(fila: string, id: string | null): Promise<{ updated: number; kept: boolean } | FalhaPlataforma> {
    if (!FILAS.has(fila)) return 'chave';
    if (fila === 'itinerary') return this.recolocarGeracao(id);
    if (fila === 'notification') return this.recolocarAviso(id);
    return this.recolocarIngestao(id);
  }

  async apagarFalhos(fila: string, id: string | null): Promise<{ deleted: number } | FalhaPlataforma> {
    if (!FILAS.has(fila)) return 'chave';
    if (fila === 'itinerary') return this.apagarGeracao(id);
    if (fila === 'notification') return this.apagarAviso(id);
    return this.apagarIngestao(id);
  }

  async falharGeracao(id: string): Promise<{ id: string; tripId: string } | FalhaPlataforma> {
    const linhas = linhasRetornadas(
      await this.dados.query<{ id: string; tripId: string }[]>(
        `UPDATE itinerary.itinerary_generation_jobs
         SET status = 'failed', error_message = 'marcada como falha pelo painel', finished_at = clock_timestamp()
         WHERE id = $1 AND status IN ('pending', 'processing')
         RETURNING id, trip_id AS "tripId"`,
        [id],
      ),
    );
    if (linhas.length === 0) {
      const existe = await this.dados.query(`SELECT 1 FROM itinerary.itinerary_generation_jobs WHERE id = $1`, [id]);
      return existe.length === 0 ? 'ausente' : 'estado';
    }
    return linhas[0];
  }

  async painel(from: string, to: string, year: number) {
    const [totais, usuarios, viagens, aquisicoes, proAtivo, filas] = await Promise.all([
      this.dados.query<{ trips: number; users: number; admins: number; itineraries: number; agents: number }[]>(
        `SELECT
           (SELECT count(*)::int FROM travel.trips WHERE deleted_at IS NULL) AS trips,
           (SELECT count(*)::int FROM identity.users WHERE deleted_at IS NULL) AS users,
           (SELECT count(*)::int FROM admin.admin_users WHERE deleted_at IS NULL) AS admins,
           (SELECT count(*)::int FROM itinerary.trip_itineraries) AS itineraries,
           (SELECT count(*)::int FROM maya.maya_model_configs WHERE is_active) AS agents`,
      ),
      this.dados.query<{ day: string; total: number }[]>(
        `SELECT to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS day, count(*)::int AS total
         FROM identity.users
         WHERE deleted_at IS NULL AND created_at >= $1::date AND created_at < $2::date + interval '1 day'
         GROUP BY 1 ORDER BY 1`,
        [from, to],
      ),
      this.dados.query<{ day: string; total: number }[]>(
        `SELECT to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS day, count(*)::int AS total
         FROM travel.trips
         WHERE deleted_at IS NULL AND created_at >= $1::date AND created_at < $2::date + interval '1 day'
         GROUP BY 1 ORDER BY 1`,
        [from, to],
      ),
      this.dados.query<{ free: number; pro: number }[]>(
        `SELECT
           (SELECT count(*)::int
            FROM subscription.user_subscriptions assinatura
            JOIN subscription.plans plano ON plano.id = assinatura.plan_id
            WHERE plano.is_free AND assinatura.started_at >= $1::date AND assinatura.started_at < $2::date + interval '1 day') AS free,
           (
             (SELECT count(*)::int
              FROM subscription.user_subscriptions assinatura
              JOIN subscription.plans plano ON plano.id = assinatura.plan_id
              WHERE NOT plano.is_free AND assinatura.started_at >= $1::date AND assinatura.started_at < $2::date + interval '1 day')
             +
             (SELECT count(*)::int
              FROM subscription.promo_grants promo
              WHERE promo.revoked_at IS NULL AND promo.starts_at >= $1::date AND promo.starts_at < $2::date + interval '1 day')
           ) AS pro`,
        [from, to],
      ),
      this.dados.query<{ total: number }[]>(
        `SELECT count(DISTINCT usuario)::int AS total FROM (
           SELECT assinatura.user_id AS usuario
           FROM subscription.user_subscriptions assinatura
           JOIN subscription.plans plano ON plano.id = assinatura.plan_id
           WHERE NOT plano.is_free
             AND assinatura.started_at < make_date($1::int + 1, 1, 1)
             AND COALESCE(assinatura.current_period_end, assinatura.started_at) >= make_date($1::int, 1, 1)
           UNION
           SELECT promo.user_id
           FROM subscription.promo_grants promo
           WHERE promo.revoked_at IS NULL
             AND promo.starts_at < make_date($1::int + 1, 1, 1)
             AND promo.ends_at >= make_date($1::int, 1, 1)
         ) ativos`,
        [year],
      ),
      this.filas(),
    ]);
    return {
      totals: totais[0],
      users: usuarios,
      trips: viagens,
      acquisitions: aquisicoes[0] ?? { free: 0, pro: 0 },
      activePro: proAtivo[0]?.total ?? 0,
      queues: {
        itinerary: semJobs(filas.itinerary),
        notification: semJobs(filas.notification),
        ingestion: semJobs(filas.ingestion),
      },
      workers: filas.workers,
    };
  }

  async financeiro(year: number) {
    const [totais, status, meses] = await Promise.all([
      this.dados.query<{ currency: string; paid: string; pending: string; refunded: string }[]>(
        `SELECT trim(currency) AS currency,
                COALESCE(SUM(amount) FILTER (WHERE status = 'paid'), 0)::text AS paid,
                COALESCE(SUM(amount) FILTER (WHERE status = 'pending'), 0)::text AS pending,
                COALESCE(SUM(amount) FILTER (WHERE status = 'refunded'), 0)::text AS refunded
         FROM subscription.subscription_payments
         GROUP BY trim(currency)`,
      ),
      this.dados.query<{ status: string; total: number }[]>(
        `SELECT status::text AS status, count(*)::int AS total FROM subscription.user_subscriptions GROUP BY status`,
      ),
      this.dados.query<{ currency: string; month: number; total: string }[]>(
        `SELECT trim(currency) AS currency, EXTRACT(MONTH FROM paid_at)::int AS month, SUM(amount)::text AS total
         FROM subscription.subscription_payments
         WHERE status = 'paid' AND paid_at IS NOT NULL AND EXTRACT(YEAR FROM paid_at)::int = $1
         GROUP BY 1, 2`,
        [year],
      ),
    ]);
    const moedas = totais.length > 0 ? totais : [{ currency: 'BRL', paid: '0', pending: '0', refunded: '0' }];
    return {
      currencies: moedas.map((linha) => ({
        currency: linha.currency,
        paid: Number(linha.paid),
        pending: Number(linha.pending),
        refunded: Number(linha.refunded),
        net: Number(linha.paid) - Number(linha.refunded),
      })),
      subscriptions: ['trialing', 'active', 'past_due', 'cancelled', 'expired'].map((nome) => ({
        status: nome,
        total: status.find((linha) => linha.status === nome)?.total ?? 0,
      })),
      months: projetar(year, meses.map((linha) => ({ currency: linha.currency, month: linha.month, total: Number(linha.total) }))),
    };
  }

  async saude() {
    const postgres = await this.dados.query('SELECT 1').then(() => 'saudavel' as const).catch(() => 'fora' as const);
    const redis = await pingRedis();
    const falhas = await this.dados.query<{ provider: string; failed: number; total: number }[]>(
      `SELECT provider,
              count(*) FILTER (WHERE status IN ('failed', 'falhou'))::int AS failed,
              count(*)::int AS total
       FROM integration.integration_logs
       WHERE created_at >= clock_timestamp() - interval '24 hours'
       GROUP BY provider
       ORDER BY provider`,
    );
    const recentes = await this.dados.query(
      `SELECT id, provider, operation, created_at AS "createdAt"
       FROM integration.integration_logs
       WHERE status IN ('failed', 'falhou')
       ORDER BY created_at DESC
       LIMIT 15`,
    );
    return {
      services: [
        { name: 'api', status: 'saudavel', detail: null },
        { name: 'postgres', status: postgres, detail: null },
        { name: 'redis', status: redis, detail: null },
        { name: 'kafka', status: 'degradado', detail: 'sem_sonda' },
        { name: 'nginx', status: 'degradado', detail: 'sem_sonda' },
      ],
      host: { cpu: null, memory: null, disk: null, containerCpu: null, containerMemory: null },
      integration: falhas,
      apiErrors: [] as { correlationId: string }[],
      integrationFailures: recentes,
    };
  }

  private async lerChave(chave: string, scope: string): Promise<ColetaLida | 'chave' | null> {
    const linhas = await this.dados.query<{ scope: string; response_body: ColetaLida }[]>(
      `SELECT scope, response_body FROM platform.idempotency_keys WHERE idempotency_key = $1`,
      [chave],
    );
    if (linhas.length === 0) return null;
    if (linhas[0].scope !== scope) return 'chave';
    return linhas[0].response_body;
  }

  private async recolocarGeracao(id: string | null): Promise<{ updated: number; kept: boolean } | FalhaPlataforma> {
    if (id) {
      const atual = await this.dados.query<{ status: string }[]>(
        `SELECT status::text AS status FROM itinerary.itinerary_generation_jobs WHERE id = $1`,
        [id],
      );
      if (atual.length === 0) return 'ausente';
      if (atual[0].status === 'pending' || atual[0].status === 'processing') return { updated: 0, kept: true };
      if (atual[0].status !== 'failed') return 'estado';
    }
    const linhas = linhasRetornadas(
      await this.dados.query(
        `UPDATE itinerary.itinerary_generation_jobs
         SET status = 'pending', error_message = NULL, started_at = NULL, finished_at = NULL
         WHERE status = 'failed' AND ($1::uuid IS NULL OR id = $1) RETURNING id`,
        [id],
      ),
    );
    return { updated: linhas.length, kept: false };
  }

  private async recolocarAviso(id: string | null): Promise<{ updated: number; kept: boolean } | FalhaPlataforma> {
    if (id) {
      const atual = await this.dados.query<{ status: string }[]>(
        `SELECT status::text AS status FROM notification.notification_deliveries WHERE id = $1 AND channel IN ('in_app', 'push')`,
        [id],
      );
      if (atual.length === 0) return 'ausente';
      if (atual[0].status === 'pending') return { updated: 0, kept: true };
      if (atual[0].status !== 'failed') return 'estado';
    }
    const linhas = linhasRetornadas(
      await this.dados.query(
        `UPDATE notification.notification_deliveries
         SET status = 'pending', error_message = NULL
         WHERE status = 'failed' AND channel IN ('in_app', 'push') AND ($1::uuid IS NULL OR id = $1)
         RETURNING id`,
        [id],
      ),
    );
    return { updated: linhas.length, kept: false };
  }

  private async recolocarIngestao(id: string | null): Promise<{ updated: number; kept: boolean } | FalhaPlataforma> {
    if (id) {
      const atual = await this.dados.query<{ status: string }[]>(`SELECT status::text AS status FROM ingestion.ingestion_jobs WHERE id = $1`, [id]);
      if (atual.length === 0) return 'ausente';
      if (atual[0].status === 'pending' || atual[0].status === 'running') return { updated: 0, kept: true };
      if (atual[0].status !== 'failed') return 'estado';
    }
    const linhas = linhasRetornadas(
      await this.dados.query(
        `UPDATE ingestion.ingestion_jobs
         SET status = 'pending', error_message = NULL, started_at = NULL, finished_at = NULL
         WHERE status = 'failed' AND ($1::uuid IS NULL OR id = $1) RETURNING id`,
        [id],
      ),
    );
    return { updated: linhas.length, kept: false };
  }

  private async apagarGeracao(id: string | null): Promise<{ deleted: number }> {
    return this.dados.transaction(async (tx) => {
      await tx.query(
        `DELETE FROM itinerary.itinerary_generation_results
         WHERE job_id IN (
           SELECT id FROM itinerary.itinerary_generation_jobs
           WHERE status = 'failed' AND ($1::uuid IS NULL OR id = $1)
         )`,
        [id],
      );
      const linhas = linhasRetornadas(
        await tx.query(
          `DELETE FROM itinerary.itinerary_generation_jobs WHERE status = 'failed' AND ($1::uuid IS NULL OR id = $1) RETURNING id`,
          [id],
        ),
      );
      return { deleted: linhas.length };
    });
  }

  private async apagarAviso(id: string | null): Promise<{ deleted: number }> {
    const linhas = linhasRetornadas(
      await this.dados.query(
        `DELETE FROM notification.notification_deliveries
         WHERE status = 'failed' AND channel IN ('in_app', 'push') AND ($1::uuid IS NULL OR id = $1)
         RETURNING id`,
        [id],
      ),
    );
    return { deleted: linhas.length };
  }

  private async apagarIngestao(id: string | null): Promise<{ deleted: number }> {
    return this.dados.transaction(async (tx) => {
      await tx.query(
        `DELETE FROM ingestion.ingestion_job_items
         WHERE job_id IN (
           SELECT id FROM ingestion.ingestion_jobs WHERE status = 'failed' AND ($1::uuid IS NULL OR id = $1)
         )`,
        [id],
      );
      const linhas = linhasRetornadas(
        await tx.query(
          `DELETE FROM ingestion.ingestion_jobs WHERE status = 'failed' AND ($1::uuid IS NULL OR id = $1) RETURNING id`,
          [id],
        ),
      );
      return { deleted: linhas.length };
    });
  }
}

function padrao(chave: string): number {
  if (chave === 'trip_calendar_max_days') return 92;
  if (chave === 'trip_flexible_max_days') return 30;
  if (chave === 'handoff_ttl_seconds') return 60;
  if (chave === 'refresh_keep_signed_in_days') return 30;
  if (chave === 'refresh_session_days') return 1;
  if (chave === 'refund.trial_days') return 7;
  return 60;
}

async function gravarAjuste(dados: DataSource, chave: string, valor: number, descricao: string, adminId: string): Promise<void> {
  await dados.query(
    `INSERT INTO platform.system_settings (setting_key, setting_value, description, updated_by_admin_id)
     VALUES ($1, to_jsonb($2::int), $3, $4)
     ON CONFLICT (setting_key) DO UPDATE
     SET setting_value = EXCLUDED.setting_value,
         updated_by_admin_id = EXCLUDED.updated_by_admin_id,
         updated_at = clock_timestamp()`,
    [chave, valor, descricao, adminId],
  );
}

function contagem(linhas: { status: string; total: number }[], mapa: { processing: string }): { pending: number; processing: number; failed: number } {
  const ler = (status: string) => linhas.find((linha) => linha.status === status)?.total ?? 0;
  return { pending: ler('pending'), processing: ler(mapa.processing), failed: ler('failed') };
}

function semJobs(fila: { pending: number; processing: number; failed: number; jobs: unknown }): { pending: number; processing: number; failed: number } {
  return { pending: fila.pending, processing: fila.processing, failed: fila.failed };
}

function projetar(ano: number, meses: { currency: string; month: number; total: number }[]) {
  const agora = new Date();
  const anoAtual = agora.getFullYear();
  const mesAtual = agora.getMonth() + 1;
  const moedas = [...new Set(meses.map((mes) => mes.currency))];
  if (moedas.length === 0) moedas.push('BRL');
  const saida: { currency: string; month: number; total: number; projected: boolean }[] = [];
  for (const currency of moedas) {
    const fechados: number[] = [];
    for (let month = 1; month <= 12; month += 1) {
      const fechado = ano < anoAtual || (ano === anoAtual && month < mesAtual);
      if (fechado) fechados.push(meses.find((mes) => mes.currency === currency && mes.month === month)?.total ?? 0);
    }
    const media = fechados.length === 0 ? 0 : Number((fechados.reduce((soma, valor) => soma + valor, 0) / fechados.length).toFixed(2));
    for (let month = 1; month <= 12; month += 1) {
      const fechado = ano < anoAtual || (ano === anoAtual && month < mesAtual);
      if (ano > anoAtual) saida.push({ currency, month, total: 0, projected: true });
      else if (fechado) saida.push({ currency, month, total: meses.find((mes) => mes.currency === currency && mes.month === month)?.total ?? 0, projected: false });
      else saida.push({ currency, month, total: media, projected: true });
    }
  }
  return saida;
}

async function pingRedis(): Promise<'saudavel' | 'fora'> {
  const url = process.env.REDIS_URL;
  if (!url) return 'fora';
  const cliente = new Redis(url, { maxRetriesPerRequest: 1, connectTimeout: 1500, enableOfflineQueue: false, lazyConnect: true });
  cliente.on('error', () => undefined);
  try {
    await cliente.connect();
    const resposta = await cliente.ping();
    return resposta === 'PONG' ? 'saudavel' : 'fora';
  } catch {
    return 'fora';
  } finally {
    cliente.disconnect();
  }
}

function inteiro(valor: unknown): number | null {
  if (typeof valor === 'number' && Number.isInteger(valor)) return valor;
  if (typeof valor === 'string' && /^-?\d+$/.test(valor)) return Number(valor);
  return null;
}

function linhasRetornadas<T>(resultado: T[] | [T[], number]): T[] {
  return Array.isArray(resultado[0]) ? resultado[0] : (resultado as T[]);
}

function codigoDe(erro: unknown): string | undefined {
  if (typeof erro !== 'object' || erro === null) return undefined;
  const direto = 'code' in erro ? (erro as { code?: unknown }).code : undefined;
  if (typeof direto === 'string') return direto;
  const driver = 'driverError' in erro ? (erro as { driverError?: { code?: unknown } }).driverError : undefined;
  return typeof driver?.code === 'string' ? driver.code : undefined;
}
