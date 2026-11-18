import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { FiltroDeViagem, ParticipanteAdmin, ViagemAdmin, ViagensAdminRepositorio } from '../../domain/ports/viagens-admin.port';

const STATUS = `CASE
  WHEN t.start_date IS NULL THEN 'draft'
  WHEN CURRENT_DATE < t.start_date THEN 'upcoming'
  WHEN CURRENT_DATE > t.end_date THEN 'finished'
  ELSE 'happening'
END`;

const STATUS_OK = new Set(['draft', 'upcoming', 'happening', 'finished']);
const MODOS = new Set(['suggested', 'community', 'from_scratch']);

@Injectable()
export class ViagensAdminPgRepositorio implements ViagensAdminRepositorio {
  constructor(@Inject(DataSource) private readonly dados: DataSource) {}

  async listar(filtro: FiltroDeViagem): Promise<ViagemAdmin[] | 'filtro'> {
    if ((filtro.status && !STATUS_OK.has(filtro.status)) || (filtro.startMode && !MODOS.has(filtro.startMode))) return 'filtro';
    if ((filtro.from && !/^\d{4}-\d{2}-\d{2}$/.test(filtro.from)) || (filtro.to && !/^\d{4}-\d{2}-\d{2}$/.test(filtro.to))) return 'filtro';
    if (filtro.visibility && filtro.visibility !== 'public' && filtro.visibility !== 'private') return 'filtro';
    const where = ['t.deleted_at IS NULL'];
    const params: unknown[] = [];
    const acrescentar = (sql: string, valor: unknown): void => {
      params.push(valor);
      where.push(sql.replace('?', `$${params.length}`));
    };
    if (filtro.q?.trim()) {
      const busca = comoBusca(filtro.q.trim());
      params.push(busca, busca, busca, busca);
      const base = params.length - 3;
      where.push(`(t.title ILIKE $${base} OR dono.email ILIKE $${base + 1} OR perfil.display_name ILIKE $${base + 2} OR destino.nome ILIKE $${base + 3})`);
    }
    if (filtro.owner?.trim()) {
      params.push(comoBusca(filtro.owner.trim()), comoBusca(filtro.owner.trim()));
      where.push(`(dono.email ILIKE $${params.length - 1} OR perfil.display_name ILIKE $${params.length})`);
    }
    if (filtro.destination?.trim()) {
      params.push(comoBusca(filtro.destination.trim()));
      where.push(`destino.nome ILIKE $${params.length}`);
    }
    if (filtro.status) acrescentar(`${STATUS} = ?`, filtro.status);
    if (filtro.startMode) acrescentar(`t.start_mode = ?::travel.trip_start_mode`, filtro.startMode);
    if (filtro.from) acrescentar(`t.start_date >= ?::date`, filtro.from);
    if (filtro.to) acrescentar(`t.start_date <= ?::date`, filtro.to);
    if (filtro.active === 'true') where.push('t.is_active');
    if (filtro.visibility) acrescentar(`t.visibility = ?::travel.trip_visibility`, filtro.visibility);
    const linhas = await this.dados.query<Linha[]>(consulta(where), params);
    return linhas.map((linha) => viagemDe(linha, []));
  }

  async ficha(id: string): Promise<ViagemAdmin | null> {
    const linhas = await this.dados.query<Linha[]>(`${consulta(['t.deleted_at IS NULL', 't.id = $1'])}`, [id]);
    if (linhas.length === 0) return null;
    const pessoas = await this.dados.query<{ display_name: string; party_kind: string; role: string | null }[]>(
      `SELECT display_name, party_kind::text, role::text FROM travel.trip_participants
       WHERE trip_id = $1 AND removed_at IS NULL ORDER BY created_at, id`,
      [id],
    );
    return viagemDe(linhas[0], pessoas.map((pessoa) => ({ displayName: pessoa.display_name, partyKind: pessoa.party_kind, role: pessoa.role })));
  }

  async ativar(id: string, ativa: boolean): Promise<'ok' | 'ausente'> {
    const linhas = linhasDe(await this.dados.query(`UPDATE travel.trips SET is_active = $2, updated_at = now() WHERE id = $1 AND deleted_at IS NULL RETURNING id`, [id, ativa]));
    return linhas.length === 0 ? 'ausente' : 'ok';
  }

  async visibilidade(id: string, visibility: 'private' | 'public'): Promise<'ok' | 'ausente'> {
    const linhas = linhasDe(
      await this.dados.query(`UPDATE travel.trips SET visibility = $2::travel.trip_visibility, updated_at = now() WHERE id = $1 AND deleted_at IS NULL RETURNING id`, [id, visibility]),
    );
    return linhas.length === 0 ? 'ausente' : 'ok';
  }

  async excluir(id: string): Promise<'ok' | 'ausente'> {
    const linhas = linhasDe(
      await this.dados.query(`UPDATE travel.trips SET deleted_at = now(), is_active = false, updated_at = now() WHERE id = $1 AND deleted_at IS NULL RETURNING id`, [id]),
    );
    return linhas.length === 0 ? 'ausente' : 'ok';
  }
}

function consulta(where: string[]): string {
  return `SELECT t.id, t.title, coalesce(perfil.display_name, dono.email) AS owner_name, dono.email AS owner_email,
            coalesce(destino.nomes, ARRAY[]::text[]) AS destinations,
            t.start_date::text AS start_date, t.end_date::text AS end_date, t.duration_days,
            ${STATUS} AS status, t.start_mode::text AS start_mode, t.is_active, t.visibility::text AS visibility
     FROM travel.trips t
     JOIN identity.users dono ON dono.id = t.owner_user_id
     LEFT JOIN identity.user_profiles perfil ON perfil.user_id = dono.id
     LEFT JOIN LATERAL (
       SELECT array_agg(coalesce(c.name, d.custom_name) ORDER BY d.sort_order) AS nomes,
              string_agg(coalesce(c.name, d.custom_name), ' ') AS nome
       FROM travel.trip_destinations d
       LEFT JOIN geography.cities c ON c.id = d.city_id
       WHERE d.trip_id = t.id
     ) destino ON true
     WHERE ${where.join(' AND ')}
     ORDER BY t.created_at DESC
     LIMIT 50`;
}

function viagemDe(linha: Linha, participants: ParticipanteAdmin[]): ViagemAdmin {
  return {
    id: linha.id,
    title: linha.title,
    ownerName: linha.owner_name,
    ownerEmail: linha.owner_email,
    destinations: linha.destinations ?? [],
    startDate: linha.start_date,
    endDate: linha.end_date,
    durationDays: linha.duration_days,
    status: linha.status,
    startMode: linha.start_mode,
    isActive: linha.is_active,
    visibility: linha.visibility,
    participants,
  };
}

function comoBusca(texto: string): string {
  return `%${texto.replace(/[\\%_]/g, (parte) => `\\${parte}`)}%`;
}

function linhasDe<T>(resultado: T[] | [T[], number]): T[] {
  return Array.isArray(resultado[0]) ? resultado[0] : (resultado as T[]);
}

interface Linha {
  id: string;
  title: string;
  owner_name: string;
  owner_email: string;
  destinations: string[] | null;
  start_date: string | null;
  end_date: string | null;
  duration_days: number | null;
  status: string;
  start_mode: string;
  is_active: boolean;
  visibility: string;
}
