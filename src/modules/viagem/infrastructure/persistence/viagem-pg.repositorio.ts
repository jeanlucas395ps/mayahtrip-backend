import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  Carteira,
  CriarViagem,
  DestinoLido,
  FiltroDaCarteira,
  ModoDeComeco,
  StatusDoCartao,
  ViagemLida,
  ViagemRepositorio,
} from '../../domain/ports/viagem.port';

interface LinhaViagem {
  id: string;
  title: string;
  description: string | null;
  start_date: string | Date | null;
  end_date: string | Date | null;
  duration_days: number | null;
  day_count: number | string;
  status: StatusDoCartao;
  days_until: number | string | null;
  visibility: 'private' | 'public';
  start_mode: ModoDeComeco;
  adult_count: number;
  child_count: number;
  budget_amount: string | null;
  budget_currency: string | null;
  has_cover: boolean;
  destination_count: number | string;
}

interface LinhaDestino {
  id: string;
  trip_id: string;
  city_id: string | null;
  city_name: string | null;
  custom_name: string | null;
  arrival_date: string | Date | null;
  departure_date: string | Date | null;
  sort_order: number;
}

const STATUS = `CASE
  WHEN t.start_date IS NULL THEN 'draft'
  WHEN CURRENT_DATE < t.start_date THEN 'upcoming'
  WHEN CURRENT_DATE > t.end_date THEN 'finished'
  ELSE 'happening'
END`;

const DIAS = `CASE
  WHEN t.start_date IS NOT NULL THEN (t.end_date - t.start_date + 1)
  ELSE t.duration_days
END`;

@Injectable()
export class ViagemPgRepositorio implements ViagemRepositorio {
  constructor(@Inject(DataSource) private readonly dados: DataSource) {}

  async hoje(): Promise<string> {
    const linhas = await this.dados.query<{ hoje: string }[]>(`SELECT CURRENT_DATE::text AS hoje`);
    return String(linhas[0]?.hoje).slice(0, 10);
  }

  async teto(chave: string): Promise<number | null> {
    const linhas = await this.dados.query<{ setting_value: unknown }[]>(
      `SELECT setting_value FROM platform.system_settings WHERE setting_key = $1`,
      [chave],
    );
    const valor = linhas[0]?.setting_value;
    const numero = typeof valor === 'number' ? valor : typeof valor === 'string' ? Number(valor) : Number.NaN;
    return Number.isInteger(numero) && numero >= 1 ? numero : null;
  }

  async nomesDasCidades(ids: string[]): Promise<Map<string, string> | null> {
    if (ids.length === 0) return new Map();
    const unicos = [...new Set(ids)];
    const linhas = await this.dados.query<{ id: string; name: string }[]>(
      `SELECT id, name FROM geography.cities WHERE id = ANY($1::uuid[])`,
      [unicos],
    );
    if (linhas.length !== unicos.length) return null;
    return new Map(linhas.map((linha) => [linha.id, linha.name]));
  }

  async moedaAtiva(codigo: string): Promise<boolean> {
    const linhas = await this.dados.query<{ code: string }[]>(
      `SELECT code FROM finance.currency_definitions WHERE code = $1 AND is_active`,
      [codigo],
    );
    return linhas.length > 0;
  }

  async criar(entrada: CriarViagem): Promise<string> {
    return this.dados.transaction(async (tx) => {
      const criadas = await tx.query<{ id: string }[]>(
        `INSERT INTO travel.trips (
           owner_user_id, title, description, start_date, end_date, duration_days, visibility, start_mode,
           adult_count, child_count, budget_amount, budget_currency
         ) VALUES ($1, $2, $3, $4, $5, $6, 'private', $7, $8, $9, $10, $11)
         RETURNING id`,
        [
          entrada.ownerId,
          entrada.title,
          entrada.description,
          entrada.startDate,
          entrada.endDate,
          entrada.durationDays,
          entrada.startMode,
          entrada.adultCount,
          entrada.childCount,
          entrada.budgetAmount,
          entrada.budgetCurrency,
        ],
      );
      const id = criadas[0].id;
      for (const [ordem, destino] of entrada.destinations.entries()) {
        await tx.query(
          `INSERT INTO travel.trip_destinations (trip_id, city_id, custom_name, sort_order) VALUES ($1, $2, $3, $4)`,
          [id, destino.cityId, destino.customName, ordem],
        );
      }
      return id;
    });
  }

  async carteira(donoId: string, filtro: FiltroDaCarteira): Promise<Carteira> {
    const viagens = await this.listar(donoId, filtro);
    const totais = await this.dados.query<{ todas: string; proximas: string; rascunhos: string }[]>(
      `SELECT
         count(*)::text AS todas,
         count(*) FILTER (WHERE ${STATUS} IN ('upcoming', 'happening'))::text AS proximas,
         count(*) FILTER (WHERE ${STATUS} = 'draft')::text AS rascunhos
       FROM travel.trips t
       WHERE t.owner_user_id = $1 AND t.deleted_at IS NULL`,
      [donoId],
    );
    return {
      counts: {
        all: Number(totais[0]?.todas ?? 0),
        upcoming: Number(totais[0]?.proximas ?? 0),
        drafts: Number(totais[0]?.rascunhos ?? 0),
      },
      trips: viagens,
    };
  }

  async ficha(donoId: string, viagemId: string): Promise<ViagemLida | null> {
    const viagens = await this.listar(donoId, 'todas', viagemId);
    return viagens[0] ?? null;
  }

  async guardarCapa(donoId: string, viagemId: string, chave: string): Promise<string | null | 'ausente'> {
    return this.dados.transaction(async (tx) => {
      const atuais = await tx.query<{ cover_storage_key: string | null }[]>(
        `SELECT cover_storage_key FROM travel.trips
         WHERE id = $1 AND owner_user_id = $2 AND deleted_at IS NULL
         FOR UPDATE`,
        [viagemId, donoId],
      );
      if (atuais.length === 0) return 'ausente';
      await tx.query(`UPDATE travel.trips SET cover_storage_key = $2, updated_at = now() WHERE id = $1`, [viagemId, chave]);
      return atuais[0].cover_storage_key;
    });
  }

  async chaveDaCapa(donoId: string, viagemId: string): Promise<string | null | 'ausente'> {
    const linhas = await this.dados.query<{ cover_storage_key: string | null }[]>(
      `SELECT cover_storage_key FROM travel.trips WHERE id = $1 AND owner_user_id = $2 AND deleted_at IS NULL`,
      [viagemId, donoId],
    );
    if (linhas.length === 0) return 'ausente';
    return linhas[0].cover_storage_key;
  }

  private async listar(donoId: string, filtro: FiltroDaCarteira, viagemId?: string): Promise<ViagemLida[]> {
    const filtroSql =
      filtro === 'proximas' ? `AND ${STATUS} IN ('upcoming', 'happening')` : filtro === 'rascunhos' ? `AND ${STATUS} = 'draft'` : '';
    const linhas = await this.dados.query<LinhaViagem[]>(
      `SELECT t.id, t.title, t.description, t.start_date::text AS start_date, t.end_date::text AS end_date,
              t.duration_days, ${DIAS} AS day_count, ${STATUS} AS status,
              CASE WHEN ${STATUS} = 'upcoming' THEN (t.start_date - CURRENT_DATE) ELSE NULL END AS days_until,
              t.visibility, t.start_mode, t.adult_count, t.child_count, t.budget_amount::text AS budget_amount,
              t.budget_currency, (t.cover_storage_key IS NOT NULL) AS has_cover,
              (SELECT count(*) FROM travel.trip_destinations d WHERE d.trip_id = t.id) AS destination_count
       FROM travel.trips t
       WHERE t.owner_user_id = $1 AND t.deleted_at IS NULL
         AND ($2::uuid IS NULL OR t.id = $2)
         ${filtroSql}
       ORDER BY t.start_date ASC NULLS LAST, t.id`,
      [donoId, viagemId ?? null],
    );
    if (linhas.length === 0) return [];
    const destinos = await this.dados.query<LinhaDestino[]>(
      `SELECT d.id, d.trip_id, d.city_id, c.name AS city_name, d.custom_name,
              d.arrival_date::text AS arrival_date, d.departure_date::text AS departure_date, d.sort_order
       FROM travel.trip_destinations d
       LEFT JOIN geography.cities c ON c.id = d.city_id
       WHERE d.trip_id = ANY($1::uuid[])
       ORDER BY d.sort_order, d.id`,
      [linhas.map((linha) => linha.id)],
    );
    const porViagem = new Map<string, DestinoLido[]>();
    for (const destino of destinos) {
      const lista = porViagem.get(destino.trip_id) ?? [];
      lista.push({
        id: destino.id,
        cityId: destino.city_id,
        cityName: destino.city_name,
        customName: destino.custom_name,
        name: destino.city_name ?? destino.custom_name ?? '',
        arrivalDate: dataDe(destino.arrival_date),
        departureDate: dataDe(destino.departure_date),
        sortOrder: destino.sort_order,
      });
      porViagem.set(destino.trip_id, lista);
    }
    return linhas.map((linha) => ({
      id: linha.id,
      title: linha.title,
      description: linha.description,
      startDate: dataDe(linha.start_date),
      endDate: dataDe(linha.end_date),
      durationDays: linha.duration_days,
      dayCount: Number(linha.day_count),
      status: linha.status,
      daysUntil: linha.days_until === null ? null : Number(linha.days_until),
      visibility: linha.visibility,
      startMode: linha.start_mode,
      adultCount: linha.adult_count,
      childCount: linha.child_count,
      budgetAmount: linha.budget_amount === null ? null : Number(linha.budget_amount),
      budgetCurrency: linha.budget_currency?.trim() || null,
      hasCover: linha.has_cover,
      destinationCount: Number(linha.destination_count),
      destinations: porViagem.get(linha.id) ?? [],
    }));
  }
}

function dataDe(valor: string | Date | null): string | null {
  if (!valor) return null;
  if (valor instanceof Date) return valor.toISOString().slice(0, 10);
  return String(valor).slice(0, 10);
}
