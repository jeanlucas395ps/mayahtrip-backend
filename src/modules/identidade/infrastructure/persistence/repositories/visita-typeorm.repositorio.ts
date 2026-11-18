import { Inject, Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { OrigemVisita, VisitaAtual, decidirMarcacao, podeRemover } from '../../../domain/visita';
import {
  Marcacao,
  VisitaCidade,
  VisitaPais,
  VisitaRepositorio,
  ViagemParaMapa,
} from '../../../domain/ports/visita-repositorio.port';

interface LinhaAtual {
  visit_source: OrigemVisita;
  trip_id: string | null;
  visited_at: string | null;
}

@Injectable()
export class VisitaTypeOrmRepositorio implements VisitaRepositorio {
  constructor(@Inject(DataSource) private readonly dados: DataSource) {}

  async paisExiste(paisId: string): Promise<boolean> {
    const linhas = await this.dados.query<{ id: string }[]>(`SELECT id FROM geography.countries WHERE id = $1`, [paisId]);
    return Boolean(linhas[0]);
  }

  async cidade(cidadeId: string): Promise<{ paisId: string } | null> {
    const linhas = await this.dados.query<{ country_id: string }[]>(`SELECT country_id FROM geography.cities WHERE id = $1`, [cidadeId]);
    return linhas[0] ? { paisId: linhas[0].country_id } : null;
  }

  async listarPaises(userId: string, locale: string): Promise<VisitaPais[]> {
    const linhas = await this.dados.query<
      {
        id: string;
        country_id: string;
        nome: string;
        iso2: string | null;
        visit_source: OrigemVisita;
        trip_id: string | null;
        visited_at: string | null;
      }[]
    >(
      `SELECT v.id, v.country_id, COALESCE(tr.translated_name, c.name) AS nome, c.iso2,
              v.visit_source::text, v.trip_id, v.visited_at::text
       FROM identity.user_visited_countries v
       JOIN geography.countries c ON c.id = v.country_id
       LEFT JOIN geography.geographic_translations tr
         ON tr.entity_type = 'country' AND tr.entity_id = c.id AND tr.locale = $2
       WHERE v.user_id = $1
       ORDER BY nome`,
      [userId, locale],
    );
    return linhas.map((linha) => ({
      id: linha.id,
      paisId: linha.country_id,
      nome: linha.nome,
      iso2: linha.iso2?.trim() || null,
      origem: linha.visit_source,
      viagemId: linha.trip_id,
      quando: linha.visited_at,
    }));
  }

  async listarCidades(userId: string, locale: string): Promise<VisitaCidade[]> {
    const linhas = await this.dados.query<
      {
        id: string;
        city_id: string;
        country_id: string;
        nome: string;
        visit_source: OrigemVisita;
        trip_id: string | null;
        visited_at: string | null;
      }[]
    >(
      `SELECT v.id, v.city_id, ci.country_id, COALESCE(tr.translated_name, ci.name) AS nome,
              v.visit_source::text, v.trip_id, v.visited_at::text
       FROM identity.user_visited_cities v
       JOIN geography.cities ci ON ci.id = v.city_id
       LEFT JOIN geography.geographic_translations tr
         ON tr.entity_type = 'city' AND tr.entity_id = ci.id AND tr.locale = $2
       WHERE v.user_id = $1
       ORDER BY nome`,
      [userId, locale],
    );
    return linhas.map((linha) => ({
      id: linha.id,
      cidadeId: linha.city_id,
      paisId: linha.country_id,
      nome: linha.nome,
      origem: linha.visit_source,
      viagemId: linha.trip_id,
      quando: linha.visited_at,
    }));
  }

  async contarPlanejados(userId: string): Promise<number> {
    const linhas = await this.dados.query<{ total: string }[]>(
      `SELECT count(DISTINCT c.id)::text AS total
       FROM travel.trips t
       JOIN travel.trip_destinations d ON d.trip_id = t.id
       JOIN geography.cities ci ON ci.id = d.city_id
       JOIN geography.countries c ON c.id = ci.country_id
       WHERE t.owner_user_id = $1
         AND t.deleted_at IS NULL
         AND t.end_date >= CURRENT_DATE
         AND NOT EXISTS (
           SELECT 1 FROM identity.user_visited_countries v
           WHERE v.user_id = t.owner_user_id AND v.country_id = c.id
         )`,
      [userId],
    );
    return Number(linhas[0]?.total ?? 0);
  }

  async marcarPais(paisId: string, marcacao: Marcacao): Promise<void> {
    await this.dados.transaction((tx) => this.aplicar(tx, 'identity.user_visited_countries', 'country_id', paisId, marcacao));
  }

  async marcarCidade(cidadeId: string, marcacao: Marcacao): Promise<void> {
    await this.dados.transaction((tx) => this.aplicar(tx, 'identity.user_visited_cities', 'city_id', cidadeId, marcacao));
  }

  async removerPais(userId: string, paisId: string): Promise<'removido' | 'ausente' | 'viagem'> {
    return this.remover('identity.user_visited_countries', 'country_id', userId, paisId);
  }

  async removerCidade(userId: string, cidadeId: string): Promise<'removido' | 'ausente' | 'viagem'> {
    return this.remover('identity.user_visited_cities', 'city_id', userId, cidadeId);
  }

  async viagem(tripId: string): Promise<ViagemParaMapa | null> {
    const viagens = await this.dados.query<
      { id: string; owner_user_id: string; encerrada: boolean; quando: string | null; deleted_at: string | null }[]
    >(
      `SELECT id, owner_user_id, (end_date < CURRENT_DATE) AS encerrada, end_date::text AS quando, deleted_at
       FROM travel.trips WHERE id = $1`,
      [tripId],
    );
    const viagem = viagens[0];
    if (!viagem || viagem.deleted_at) return null;
    const destinos = await this.dados.query<{ city_id: string; country_id: string }[]>(
      `SELECT d.city_id, ci.country_id
       FROM travel.trip_destinations d
       JOIN geography.cities ci ON ci.id = d.city_id
       WHERE d.trip_id = $1 AND d.city_id IS NOT NULL`,
      [tripId],
    );
    return {
      id: viagem.id,
      donoId: viagem.owner_user_id,
      encerrada: viagem.encerrada,
      quando: viagem.quando,
      destinos: destinos.map((destino) => ({ cidadeId: destino.city_id, paisId: destino.country_id })),
    };
  }

  private async aplicar(
    tx: EntityManager,
    tabela: 'identity.user_visited_countries' | 'identity.user_visited_cities',
    coluna: 'country_id' | 'city_id',
    lugarId: string,
    marcacao: Marcacao,
  ): Promise<void> {
    const atual = await this.atual(tx, tabela, coluna, marcacao.userId, lugarId);
    const decisao = decidirMarcacao(atual, { origem: marcacao.origem, viagemId: marcacao.viagemId, quando: marcacao.quando });
    if (decisao.tipo === 'inserir') {
      try {
        await tx.query(
          `INSERT INTO ${tabela} (user_id, ${coluna}, visit_source, trip_id, visited_at)
           VALUES ($1, $2, $3::identity.visit_source, $4, $5)`,
          [marcacao.userId, lugarId, marcacao.origem, marcacao.viagemId, marcacao.quando],
        );
      } catch (erro) {
        if (!chaveUnica(erro)) throw erro;
        const existente = await this.atual(tx, tabela, coluna, marcacao.userId, lugarId);
        const repetida = decidirMarcacao(existente, { origem: marcacao.origem, viagemId: marcacao.viagemId, quando: marcacao.quando });
        if (repetida.tipo !== 'atualizar') return;
        await tx.query(
          `UPDATE ${tabela}
           SET visit_source = $3::identity.visit_source, trip_id = $4, visited_at = $5
           WHERE user_id = $1 AND ${coluna} = $2`,
          [marcacao.userId, lugarId, repetida.origem, repetida.viagemId, repetida.quando],
        );
      }
      return;
    }
    if (decisao.tipo === 'atualizar') {
      await tx.query(
        `UPDATE ${tabela}
         SET visit_source = $3::identity.visit_source, trip_id = $4, visited_at = $5
         WHERE user_id = $1 AND ${coluna} = $2`,
        [marcacao.userId, lugarId, decisao.origem, decisao.viagemId, decisao.quando],
      );
    }
  }

  private async remover(
    tabela: 'identity.user_visited_countries' | 'identity.user_visited_cities',
    coluna: 'country_id' | 'city_id',
    userId: string,
    lugarId: string,
  ): Promise<'removido' | 'ausente' | 'viagem'> {
    return this.dados.transaction(async (tx) => {
      const atual = await this.atual(tx, tabela, coluna, userId, lugarId);
      const decisao = podeRemover(atual);
      if (decisao !== 'remover') return decisao;
      await tx.query(`DELETE FROM ${tabela} WHERE user_id = $1 AND ${coluna} = $2 AND visit_source = 'manual'`, [userId, lugarId]);
      return 'removido';
    });
  }

  private async atual(
    tx: EntityManager,
    tabela: string,
    coluna: string,
    userId: string,
    lugarId: string,
  ): Promise<VisitaAtual | null> {
    const linhas = await tx.query<LinhaAtual[]>(
      `SELECT visit_source::text, trip_id, visited_at::text FROM ${tabela} WHERE user_id = $1 AND ${coluna} = $2`,
      [userId, lugarId],
    );
    const linha = linhas[0];
    if (!linha) return null;
    return { origem: linha.visit_source, viagemId: linha.trip_id, quando: linha.visited_at };
  }
}

function chaveUnica(erro: unknown): boolean {
  if (typeof erro !== 'object' || erro === null) return false;
  const candidato = erro as { code?: string; driverError?: { code?: string } };
  return candidato.code === '23505' || candidato.driverError?.code === '23505';
}
