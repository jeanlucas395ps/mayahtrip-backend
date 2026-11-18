import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { FiltroDeUsuarios, UsuarioDoApp, UsuariosRepositorio } from '../../domain/ports/usuarios.port';

interface LinhaUsuario {
  id: string;
  name: string;
  username: string;
  email: string;
  country_id: string | null;
  country_name: string | null;
  locale: string;
  currency: string;
  plan_code: string;
  email_verified: boolean;
  created_at: Date;
  status: 'pending' | 'active' | 'inactive';
  deleted: boolean;
  entrada: 'google' | 'senha' | 'ambos';
}

const LIMITE = 50;

@Injectable()
export class UsuariosPgRepositorio implements UsuariosRepositorio {
  constructor(@Inject(DataSource) private readonly dados: DataSource) {}

  async listar(filtro: FiltroDeUsuarios): Promise<UsuarioDoApp[]> {
    const clausulas: string[] = [];
    const params: unknown[] = [];
    if (filtro.q) {
      params.push(comoBusca(filtro.q));
      clausulas.push(
        `(COALESCE(p.display_name, '') ILIKE $${params.length} ESCAPE '\\' OR COALESCE(p.username, '') ILIKE $${params.length} ESCAPE '\\' OR u.email ILIKE $${params.length} ESCAPE '\\')`,
      );
    }
    if (filtro.ativo !== null) {
      params.push(filtro.ativo ? 'active' : 'inactive');
      clausulas.push(`u.status = $${params.length}::identity.user_status`);
    }
    if (filtro.verificado !== null) {
      clausulas.push(filtro.verificado ? 'u.email_verified_at IS NOT NULL' : 'u.email_verified_at IS NULL');
    }
    if (filtro.entrada === 'google') clausulas.push('g.user_id IS NOT NULL');
    if (filtro.entrada === 'senha') clausulas.push('u.password_hash IS NOT NULL');
    if (filtro.pais) {
      params.push(filtro.pais);
      clausulas.push(`p.country_id = $${params.length}`);
    }
    if (filtro.cadastroDe) {
      params.push(filtro.cadastroDe);
      clausulas.push(`u.created_at >= $${params.length}::date`);
    }
    if (filtro.cadastroAte) {
      params.push(filtro.cadastroAte);
      clausulas.push(`u.created_at < ($${params.length}::date + interval '1 day')`);
    }
    const onde = clausulas.length > 0 ? `WHERE ${clausulas.join(' AND ')}` : '';
    const linhas = await this.dados.query<LinhaUsuario[]>(`${consulta} ${onde} ORDER BY u.created_at DESC, u.email LIMIT ${LIMITE}`, params);
    return linhas.map(paraUsuario);
  }

  async porId(id: string): Promise<UsuarioDoApp | null> {
    const linhas = await this.dados.query<LinhaUsuario[]>(`${consulta} WHERE u.id = $1`, [id]);
    return linhas[0] ? paraUsuario(linhas[0]) : null;
  }

  async definirStatus(id: string, status: 'active' | 'inactive'): Promise<'ok' | 'ausente' | 'excluido'> {
    const resultado = await this.dados.query(
      `UPDATE identity.users SET status = $2::identity.user_status, updated_at = now()
       WHERE id = $1 AND deleted_at IS NULL RETURNING id`,
      [id, status],
    );
    if (linhasDe(resultado).length > 0) return 'ok';
    const existente = await this.dados.query<{ deleted_at: Date | null }[]>(`SELECT deleted_at FROM identity.users WHERE id = $1`, [id]);
    if (!existente[0]) return 'ausente';
    return existente[0].deleted_at ? 'excluido' : 'ausente';
  }

  async excluir(id: string): Promise<UsuarioDoApp | null> {
    const anterior = await this.porId(id);
    if (!anterior || anterior.deleted) return null;
    const resultado = await this.dados.query(
      `UPDATE identity.users SET deleted_at = now(), updated_at = now() WHERE id = $1 AND deleted_at IS NULL RETURNING id`,
      [id],
    );
    return linhasDe(resultado).length > 0 ? { ...anterior, deleted: true } : null;
  }

  async restaurar(id: string): Promise<UsuarioDoApp | null> {
    const anterior = await this.porId(id);
    if (!anterior?.deleted) return null;
    const resultado = await this.dados.query(
      `UPDATE identity.users SET deleted_at = NULL, updated_at = now() WHERE id = $1 AND deleted_at IS NOT NULL RETURNING id`,
      [id],
    );
    return linhasDe(resultado).length > 0 ? { ...anterior, deleted: false } : null;
  }
}

const consulta = `
  SELECT u.id,
         COALESCE(p.display_name, u.email) AS name,
         COALESCE(p.username, '') AS username,
         u.email,
         p.country_id,
         c.name AS country_name,
         COALESCE(pref.locale, 'pt-BR') AS locale,
         COALESCE(pref.display_currency, 'BRL') AS currency,
         CASE
           WHEN promo.user_id IS NOT NULL AND (plano.code IS NULL OR plano.code = 'free') THEN 'pro'
           ELSE COALESCE(plano.code, 'free')
         END AS plan_code,
         (u.email_verified_at IS NOT NULL) AS email_verified,
         u.created_at,
         u.status,
         (u.deleted_at IS NOT NULL) AS deleted,
         CASE
           WHEN g.user_id IS NOT NULL AND u.password_hash IS NOT NULL THEN 'ambos'
           WHEN g.user_id IS NOT NULL THEN 'google'
           ELSE 'senha'
         END AS entrada
  FROM identity.users u
  LEFT JOIN identity.user_profiles p ON p.user_id = u.id
  LEFT JOIN geography.countries c ON c.id = p.country_id
  LEFT JOIN identity.user_preferences pref ON pref.user_id = u.id
  LEFT JOIN identity.user_auth_providers g ON g.user_id = u.id AND g.provider = 'google'
  LEFT JOIN LATERAL (
    SELECT pl.code
    FROM subscription.user_subscriptions s
    JOIN subscription.plans pl ON pl.id = s.plan_id
    WHERE s.user_id = u.id
      AND (
        s.status IN ('trialing', 'active', 'past_due')
        OR (s.status = 'cancelled' AND s.current_period_end > now())
      )
    ORDER BY s.current_period_end DESC NULLS LAST, s.created_at DESC
    LIMIT 1
  ) plano ON true
  LEFT JOIN LATERAL (
    SELECT user_id
    FROM subscription.promo_grants
    WHERE user_id = u.id AND revoked_at IS NULL AND starts_at <= now() AND ends_at > now()
    LIMIT 1
  ) promo ON true
`;

function paraUsuario(linha: LinhaUsuario): UsuarioDoApp {
  return {
    id: linha.id,
    name: linha.name,
    username: linha.username,
    email: linha.email,
    countryId: linha.country_id,
    countryName: linha.country_name,
    locale: linha.locale,
    currency: linha.currency,
    planCode: linha.plan_code,
    emailVerified: linha.email_verified,
    createdAt: new Date(linha.created_at).toISOString(),
    status: linha.status,
    deleted: linha.deleted,
    entrada: linha.entrada,
  };
}

function comoBusca(valor: string): string {
  return `%${valor.replace(/[\\%_]/g, (trecho) => `\\${trecho}`)}%`;
}

function linhasDe(resultado: unknown): unknown[] {
  if (Array.isArray(resultado) && Array.isArray(resultado[0])) return resultado[0] as unknown[];
  return Array.isArray(resultado) ? resultado : [];
}
