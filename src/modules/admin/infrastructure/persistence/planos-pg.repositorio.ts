import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { FeatureDePlano, NovoPlano, PlanoGravado, PlanosRepositorio, PrecoDePlano } from '../../application/planos.repositorio';

interface Linha {
  id: string;
  code: string;
  name: string;
  description: string | null;
  is_free: boolean;
  is_active: boolean;
  currency: string | null;
  billing_period: PrecoDePlano['billingPeriod'] | null;
  amount: string | null;
  duration_days: number | null;
  price_active: boolean | null;
  features: FeatureDePlano[] | null;
}

@Injectable()
export class PlanosPgRepositorio implements PlanosRepositorio {
  constructor(@Inject(DataSource) private readonly dados: DataSource) {}

  async listar(): Promise<PlanoGravado[]> {
    const linhas = await this.dados.query<Linha[]>(consulta);
    return linhas.map(montar);
  }

  async porId(id: string): Promise<PlanoGravado | null> {
    const linhas = await this.dados.query<Linha[]>(`${consulta} WHERE p.id = $1`, [id]);
    return linhas[0] ? montar(linhas[0]) : null;
  }

  async porCodigo(code: string): Promise<PlanoGravado | null> {
    const linhas = await this.dados.query<Linha[]>(`${consulta} WHERE p.code = $1`, [code]);
    return linhas[0] ? montar(linhas[0]) : null;
  }

  async criar(entrada: NovoPlano): Promise<PlanoGravado> {
    const id = await this.dados.transaction(async (tx) => {
      const criados = await tx.query<{ id: string }[]>(
        `INSERT INTO subscription.plans (code, name, description, is_free, is_active)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [entrada.code, entrada.name, entrada.description, entrada.isFree, entrada.isActive],
      );
      const novoId = criados[0]?.id;
      if (!novoId) throw new Error('plano sem id');
      await gravarDetalhes(tx, novoId, entrada);
      return novoId;
    });
    const plano = await this.porId(id);
    if (!plano) throw new Error('plano não voltou');
    return plano;
  }

  async editar(id: string, entrada: Omit<NovoPlano, 'isActive'>): Promise<PlanoGravado> {
    await this.dados.transaction(async (tx) => {
      await tx.query(
        `UPDATE subscription.plans
         SET name = $2, description = $3, updated_at = now()
         WHERE id = $1`,
        [id, entrada.name, entrada.description],
      );
      await tx.query(`DELETE FROM subscription.plan_features WHERE plan_id = $1`, [id]);
      await tx.query(`DELETE FROM subscription.plan_prices WHERE plan_id = $1`, [id]);
      await tx.query(`DELETE FROM subscription.plan_translations WHERE plan_id = $1`, [id]);
      await gravarDetalhes(tx, id, { ...entrada, isActive: false });
    });
    const plano = await this.porId(id);
    if (!plano) throw new Error('plano não voltou');
    return plano;
  }

  async definirAtivo(id: string, ativo: boolean): Promise<void> {
    await this.dados.query(`UPDATE subscription.plans SET is_active = $2, updated_at = now() WHERE id = $1`, [id, ativo]);
  }
}

const consulta = `
  SELECT p.id, p.code, p.name, p.description, p.is_free, p.is_active,
         pr.currency, pr.billing_period, pr.amount, pr.duration_days, pr.is_active AS price_active,
         COALESCE(
           (SELECT json_agg(json_build_object('key', f.feature_key, 'value', f.feature_value #>> '{}') ORDER BY f.feature_key)
            FROM subscription.plan_features f WHERE f.plan_id = p.id),
           '[]'::json
         ) AS features
  FROM subscription.plans p
  LEFT JOIN LATERAL (
    SELECT currency, billing_period, amount, duration_days, is_active
    FROM subscription.plan_prices
    WHERE plan_id = p.id AND is_active
    LIMIT 1
  ) pr ON true
`;

function montar(linha: Linha): PlanoGravado {
  const preco = linha.currency && linha.billing_period && linha.amount !== null
    ? {
        currency: linha.currency.trim(),
        billingPeriod: linha.billing_period,
        amount: Number(linha.amount),
        durationDays: linha.duration_days,
        isActive: Boolean(linha.price_active),
      }
    : null;
  return {
    id: linha.id,
    code: linha.code,
    name: linha.name,
    description: linha.description,
    isFree: linha.is_free,
    isActive: linha.is_active,
    temPrecoAtivo: preco?.isActive === true && preco.amount > 0,
    preco,
    features: linha.features ?? [],
  };
}

async function gravarDetalhes(
  tx: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
  id: string,
  entrada: NovoPlano,
): Promise<void> {
  for (const locale of ['pt-BR', 'pt-PT', 'en', 'es']) {
    await tx.query(
      `INSERT INTO subscription.plan_translations (plan_id, locale, name, description)
       VALUES ($1, $2, $3, $4)`,
      [id, locale, entrada.name, entrada.description],
    );
  }
  for (const feature of entrada.features) {
    await tx.query(
      `INSERT INTO subscription.plan_features (plan_id, feature_key, feature_value)
       VALUES ($1, $2, to_jsonb($3::text))`,
      [id, feature.key, feature.value],
    );
  }
  if (entrada.amount !== null && entrada.currency && entrada.billingPeriod) {
    await tx.query(
      `INSERT INTO subscription.plan_prices (plan_id, currency, billing_period, duration_days, amount, is_active)
       VALUES ($1, $2, $3, $4, $5, true)`,
      [id, entrada.currency, entrada.billingPeriod, entrada.durationDays, entrada.amount],
    );
  }
}
