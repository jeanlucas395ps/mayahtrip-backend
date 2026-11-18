import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { visaoDe } from '../../../viagem/domain/visao';
import { Papel } from '../../../viagem/domain/ports/viagem.port';
import {
  DeslocamentoLido,
  DeslocamentoNovo,
  DiaLido,
  DiaNovo,
  FalhaRoteiro,
  GeracaoLida,
  ParadaLida,
  ParadaNova,
  PedidoDeGeracao,
  RoteiroLido,
  RoteiroRepositorio,
} from '../../domain/roteiro.port';

interface Acesso {
  role: Papel | null;
}

@Injectable()
export class RoteiroPgRepositorio implements RoteiroRepositorio {
  constructor(@Inject(DataSource) private readonly dados: DataSource) {}

  async ler(userId: string, viagemId: string): Promise<RoteiroLido | 'ausente'> {
    if (!(await this.acesso(viagemId, userId))) return 'ausente';
    return this.montar(viagemId);
  }

  async criarDia(userId: string, viagemId: string, dia: DiaNovo): Promise<RoteiroLido | FalhaRoteiro> {
    const edicao = await this.podeEditar(viagemId, userId);
    if (edicao !== 'ok') return edicao;
    return this.dados.transaction(async (tx) => {
      if (dia.destinationId) {
        const destinos = await tx.query<{ id: string }[]>(
          `SELECT id FROM travel.trip_destinations WHERE id = $1 AND trip_id = $2`,
          [dia.destinationId, viagemId],
        );
        if (destinos.length === 0) return 'destino';
      }
      const roteiroId = await garantirRoteiro(tx, viagemId, userId);
      await tx.query(
        `INSERT INTO itinerary.itinerary_days (itinerary_id, trip_destination_id, day_number, date, title, sort_order)
         VALUES ($1, $2, $3, $4, $5, $3)`,
        [roteiroId, dia.destinationId ?? null, dia.dayNumber, dia.date ?? null, dia.title ?? null],
      );
      return this.montar(viagemId, tx);
    });
  }

  async criarParada(userId: string, viagemId: string, diaId: string, parada: ParadaNova): Promise<RoteiroLido | FalhaRoteiro> {
    const edicao = await this.podeEditar(viagemId, userId);
    if (edicao !== 'ok') return edicao;
    const dias = await this.dados.query<{ id: string }[]>(
      `SELECT d.id FROM itinerary.itinerary_days d
       JOIN itinerary.trip_itineraries i ON i.id = d.itinerary_id
       WHERE d.id = $1 AND i.trip_id = $2`,
      [diaId, viagemId],
    );
    if (dias.length === 0) return 'dia';
    await this.dados.query(
      `INSERT INTO itinerary.itinerary_stops (itinerary_day_id, title, sort_order, start_time, duration_minutes)
       VALUES ($1, $2, $3, $4, $5)`,
      [diaId, parada.title, parada.sortOrder, parada.startTime ?? null, parada.durationMinutes ?? null],
    );
    return this.montar(viagemId);
  }

  async criarDeslocamento(
    userId: string,
    viagemId: string,
    diaId: string,
    deslocamento: DeslocamentoNovo,
  ): Promise<RoteiroLido | FalhaRoteiro> {
    const edicao = await this.podeEditar(viagemId, userId);
    if (edicao !== 'ok') return edicao;
    const paradas = await this.dados.query<{ id: string }[]>(
      `SELECT id FROM itinerary.itinerary_stops WHERE itinerary_day_id = $1`,
      [diaId],
    );
    const ids = new Set(paradas.map((parada) => parada.id));
    const dia = await this.dados.query<{ id: string }[]>(
      `SELECT d.id FROM itinerary.itinerary_days d
       JOIN itinerary.trip_itineraries i ON i.id = d.itinerary_id
       WHERE d.id = $1 AND i.trip_id = $2`,
      [diaId, viagemId],
    );
    if (dia.length === 0) return 'dia';
    if ((deslocamento.fromStopId && !ids.has(deslocamento.fromStopId)) || (deslocamento.toStopId && !ids.has(deslocamento.toStopId))) {
      return 'parada';
    }
    await this.dados.query(
      `INSERT INTO itinerary.itinerary_transfers (itinerary_day_id, from_stop_id, to_stop_id, transport_type, duration_seconds)
       VALUES ($1, $2, $3, $4, $5)`,
      [diaId, deslocamento.fromStopId ?? null, deslocamento.toStopId ?? null, deslocamento.transportType, deslocamento.durationSeconds ?? null],
    );
    return this.montar(viagemId);
  }

  async marcarFeito(userId: string, viagemId: string, paradaId: string, feito: boolean): Promise<RoteiroLido | FalhaRoteiro> {
    if (!(await this.acesso(viagemId, userId))) return 'ausente';
    const atualizadas = await this.dados.query(
      `UPDATE itinerary.itinerary_stops s
       SET completed_at = CASE WHEN $3 THEN clock_timestamp() ELSE NULL END,
           completed_by_user_id = CASE WHEN $3 THEN $4::uuid ELSE NULL END
       FROM itinerary.itinerary_days d
       JOIN itinerary.trip_itineraries i ON i.id = d.itinerary_id
       WHERE s.id = $1 AND s.itinerary_day_id = d.id AND i.trip_id = $2
       RETURNING s.id`,
      [paradaId, viagemId, feito, userId],
    );
    const linhas = Array.isArray(atualizadas[0]) ? atualizadas[0] : atualizadas;
    if (linhas.length === 0) return 'parada';
    return this.montar(viagemId);
  }

  async gerar(userId: string, viagemId: string, pedido: PedidoDeGeracao): Promise<GeracaoLida | FalhaRoteiro> {
    const edicao = await this.podeEditar(viagemId, userId);
    if (edicao !== 'ok') return edicao;
    return this.dados.transaction(async (tx) => {
      const viagens = await tx.query<{ dias: number; start_date: string | null }[]>(
        `SELECT CASE WHEN start_date IS NOT NULL THEN (end_date - start_date + 1) ELSE duration_days END AS dias,
                start_date::text AS start_date
         FROM travel.trips WHERE id = $1 AND deleted_at IS NULL`,
        [viagemId],
      );
      if (viagens.length === 0) return 'ausente';
      if (Number(viagens[0].dias) > 14) return 'longa';
      const entrada = { interests: pedido.interests ?? [], pace: pedido.pace ?? null };
      const jobs = await tx.query<{ id: string }[]>(
        `INSERT INTO itinerary.itinerary_generation_jobs (trip_id, requested_by_user_id, status, input_data, started_at, finished_at)
         VALUES ($1, $2, 'completed', $3::jsonb, clock_timestamp(), clock_timestamp()) RETURNING id`,
        [viagemId, userId, JSON.stringify(entrada)],
      );
      const roteiroId = await garantirDias(tx, viagemId, userId, Number(viagens[0].dias), viagens[0].start_date);
      await tx.query(
        `INSERT INTO itinerary.itinerary_generation_results (job_id, itinerary_id, result_data)
         VALUES ($1, $2, $3::jsonb)`,
        [jobs[0].id, roteiroId, JSON.stringify({ filledBy: 'none' })],
      );
      await tx.query(
        `INSERT INTO platform.outbox_events (aggregate_type, aggregate_id, event_type, payload)
         VALUES ('itinerary_generation_job', $1, 'itinerary_generation_requested', $2::jsonb)`,
        [jobs[0].id, JSON.stringify({ tripId: viagemId, itineraryId: roteiroId })],
      );
      return { jobId: jobs[0].id, status: 'completed', itineraryId: roteiroId };
    });
  }

  async otimizar(userId: string, viagemId: string): Promise<RoteiroLido | FalhaRoteiro> {
    const edicao = await this.podeEditar(viagemId, userId);
    if (edicao !== 'ok') return edicao;
    return this.dados.transaction(async (tx) => {
      const roteiros = await tx.query<{ id: string }[]>(
        `SELECT id FROM itinerary.trip_itineraries WHERE trip_id = $1 AND is_active ORDER BY version DESC LIMIT 1`,
        [viagemId],
      );
      if (roteiros.length === 0) return 'roteiro';
      await tx.query(
        `WITH ordenadas AS (
           SELECT s.id,
                  row_number() OVER (
                    PARTITION BY s.itinerary_day_id
                    ORDER BY (s.start_time IS NULL), s.start_time, s.sort_order, s.id
                  ) - 1 AS nova
           FROM itinerary.itinerary_stops s
           JOIN itinerary.itinerary_days d ON d.id = s.itinerary_day_id
           WHERE d.itinerary_id = $1
         )
         UPDATE itinerary.itinerary_stops s
         SET sort_order = ordenadas.nova
         FROM ordenadas
         WHERE s.id = ordenadas.id`,
        [roteiros[0].id],
      );
      await tx.query(
        `INSERT INTO itinerary.itinerary_optimization_runs (itinerary_id, requested_by_user_id, status, completed_at)
         VALUES ($1, $2, 'completed', clock_timestamp())`,
        [roteiros[0].id, userId],
      );
      return this.montar(viagemId, tx);
    });
  }

  private async podeEditar(viagemId: string, userId: string): Promise<'ok' | 'ausente' | 'semEdicao'> {
    const acesso = await this.acesso(viagemId, userId);
    if (!acesso) return 'ausente';
    if (!visaoDe(acesso.role ?? 'owner').edit) return 'semEdicao';
    return 'ok';
  }

  private async acesso(viagemId: string, userId: string): Promise<Acesso | undefined> {
    const linhas = await this.dados.query<Acesso[]>(
      `SELECT p.role::text AS role
       FROM travel.trips t
       LEFT JOIN travel.trip_participants p ON p.trip_id = t.id AND p.user_id = $2 AND p.removed_at IS NULL
       WHERE t.id = $1 AND t.deleted_at IS NULL AND t.is_active AND (t.owner_user_id = $2 OR p.id IS NOT NULL)`,
      [viagemId, userId],
    );
    return linhas[0];
  }

  private async montar(viagemId: string, tx: { query: DataSource['query'] } = this.dados): Promise<RoteiroLido> {
    const roteiros = await tx.query<{ id: string }[]>(
      `SELECT id FROM itinerary.trip_itineraries WHERE trip_id = $1 AND is_active ORDER BY version DESC LIMIT 1`,
      [viagemId],
    );
    if (roteiros.length === 0) return { id: null, days: [] };
    const dias = await tx.query<DiaLinha[]>(
      `SELECT id, day_number, date::text AS date, title, trip_destination_id
       FROM itinerary.itinerary_days WHERE itinerary_id = $1 ORDER BY day_number, sort_order, id`,
      [roteiros[0].id],
    );
    const paradas = await tx.query<ParadaLinha[]>(
      `SELECT s.id, s.itinerary_day_id, s.title, s.sort_order, s.start_time::text AS start_time, s.duration_minutes, s.completed_at
       FROM itinerary.itinerary_stops s
       JOIN itinerary.itinerary_days d ON d.id = s.itinerary_day_id
       WHERE d.itinerary_id = $1
       ORDER BY s.sort_order, s.id`,
      [roteiros[0].id],
    );
    const deslocamentos = await tx.query<DeslocamentoLinha[]>(
      `SELECT t.id, t.itinerary_day_id, t.from_stop_id, t.to_stop_id, t.transport_type, t.duration_seconds
       FROM itinerary.itinerary_transfers t
       JOIN itinerary.itinerary_days d ON d.id = t.itinerary_day_id
       WHERE d.itinerary_id = $1
       ORDER BY t.id`,
      [roteiros[0].id],
    );
    const days: DiaLido[] = dias.map((dia) => ({
      id: dia.id,
      dayNumber: dia.day_number,
      date: dia.date,
      title: dia.title,
      destinationId: dia.trip_destination_id,
      stops: paradas.filter((parada) => parada.itinerary_day_id === dia.id).map(paradaDe),
      transfers: deslocamentos.filter((item) => item.itinerary_day_id === dia.id).map(deslocamentoDe),
    }));
    return { id: roteiros[0].id, days };
  }
}

async function garantirDias(
  tx: { query: DataSource['query'] },
  viagemId: string,
  userId: string,
  dias: number,
  inicio: string | null,
): Promise<string> {
  const roteiroId = await garantirRoteiro(tx, viagemId, userId);
  const existentes = await tx.query<{ total: string }[]>(`SELECT count(*)::text AS total FROM itinerary.itinerary_days WHERE itinerary_id = $1`, [roteiroId]);
  if (Number(existentes[0].total) > 0) return roteiroId;
  for (let dia = 1; dia <= dias; dia += 1) {
    const data = inicio ? somarData(inicio, dia - 1) : null;
    await tx.query(
      `INSERT INTO itinerary.itinerary_days (itinerary_id, day_number, date, title, sort_order) VALUES ($1, $2, $3, $4, $2)`,
      [roteiroId, dia, data, `Dia ${dia}`],
    );
  }
  return roteiroId;
}

function somarData(iso: string, dias: number): string {
  const data = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  data.setUTCDate(data.getUTCDate() + dias);
  return data.toISOString().slice(0, 10);
}

async function garantirRoteiro(tx: { query: DataSource['query'] }, viagemId: string, userId: string): Promise<string> {
  const atuais = await tx.query<{ id: string }[]>(
    `SELECT id FROM itinerary.trip_itineraries WHERE trip_id = $1 AND is_active ORDER BY version DESC LIMIT 1`,
    [viagemId],
  );
  if (atuais.length > 0) return atuais[0].id;
  const criados = await tx.query<{ id: string }[]>(
    `INSERT INTO itinerary.trip_itineraries (trip_id, version, is_active, created_by_user_id)
     VALUES ($1, 1, true, $2) RETURNING id`,
    [viagemId, userId],
  );
  return criados[0].id;
}

function paradaDe(linha: ParadaLinha): ParadaLida {
  return {
    id: linha.id,
    title: linha.title,
    sortOrder: linha.sort_order,
    startTime: linha.start_time ? linha.start_time.slice(0, 5) : null,
    durationMinutes: linha.duration_minutes,
    done: linha.completed_at !== null,
  };
}

function deslocamentoDe(linha: DeslocamentoLinha): DeslocamentoLido {
  return {
    id: linha.id,
    fromStopId: linha.from_stop_id,
    toStopId: linha.to_stop_id,
    transportType: linha.transport_type,
    durationSeconds: linha.duration_seconds,
  };
}

interface DiaLinha {
  id: string;
  day_number: number;
  date: string | null;
  title: string | null;
  trip_destination_id: string | null;
}

interface ParadaLinha {
  id: string;
  itinerary_day_id: string;
  title: string | null;
  sort_order: number;
  start_time: string | null;
  duration_minutes: number | null;
  completed_at: Date | string | null;
}

interface DeslocamentoLinha {
  id: string;
  itinerary_day_id: string;
  from_stop_id: string | null;
  to_stop_id: string | null;
  transport_type: string | null;
  duration_seconds: number | null;
}
