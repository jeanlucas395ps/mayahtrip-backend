import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import {
  CatalogoAdminRepositorio,
  CaminhoMidiaDoLugar,
  CategoriaAdmin,
  CidadeResumoAdmin,
  EnderecoEntrada,
  FalhaCatalogo,
  HorarioEntrada,
  IdiomaCatalogo,
  LugarAdmin,
  LugarResumo,
  PaginaDeLugares,
  PrecoEntrada,
  ReferenciaEntrada,
  SalvarCategoria,
  SalvarLugar,
  StatusLugar,
  TraducaoEntrada,
  VisitaEntrada,
} from '../../domain/ports/catalogo-admin.port';

type Consulta = (sql: string, params?: unknown[]) => Promise<unknown>;

@Injectable()
export class CatalogoAdminPgRepositorio implements CatalogoAdminRepositorio {
  constructor(@Inject(DataSource) private readonly dados: DataSource) {}

  async listar(texto: string, status: StatusLugar | null, page: number, pageSize: number): Promise<PaginaDeLugares> {
    const offset = (page - 1) * pageSize;
    const totalLinhas = await this.dados.query<{ total: string }[]>(
      `SELECT count(*)::text AS total
       FROM catalog.places p
       WHERE ($1::text = '' OR p.name ILIKE $2 ESCAPE '\\' OR p.slug ILIKE $2 ESCAPE '\\')
         AND ($3::text IS NULL OR p.status = $3)`,
      [texto, comoBusca(texto), status],
    );
    const linhas = await this.dados.query<LinhaResumo[]>(
      `SELECT p.id, p.slug, p.name, p.status, c.name AS city_name
       FROM catalog.places p
       LEFT JOIN geography.cities c ON c.id = p.city_id
       WHERE ($1::text = '' OR p.name ILIKE $2 ESCAPE '\\' OR p.slug ILIKE $2 ESCAPE '\\')
         AND ($3::text IS NULL OR p.status = $3)
       ORDER BY p.updated_at DESC, p.id
       LIMIT $4 OFFSET $5`,
      [texto, comoBusca(texto), status, pageSize, offset],
    );
    return {
      items: linhas.map((linha) => ({
        id: linha.id,
        slug: linha.slug,
        name: linha.name,
        status: linha.status,
        cityName: linha.city_name,
      })),
      total: Number(totalLinhas[0]?.total ?? 0),
      page,
      pageSize,
    };
  }

  async caminhoMidia(lugarId: string): Promise<CaminhoMidiaDoLugar | null> {
    const linhas = await this.dados.query<{ slug: string; name: string; city_name: string | null; country_name: string | null }[]>(
      `SELECT p.slug, p.name, c.name AS city_name, pais.name AS country_name
       FROM catalog.places p
       LEFT JOIN geography.cities c ON c.id = p.city_id
       LEFT JOIN geography.countries pais ON pais.id = c.country_id
       WHERE p.id = $1`,
      [lugarId],
    );
    const linha = linhas[0];
    if (!linha) return null;
    return {
      placeSlug: linha.slug,
      placeName: linha.name,
      cityName: linha.city_name,
      countryName: linha.country_name,
    };
  }

  async buscarCidades(texto: string): Promise<CidadeResumoAdmin[]> {
    const linhas = await this.dados.query<{ id: string; name: string; country_name: string | null }[]>(
      `SELECT c.id, c.name, p.name AS country_name
       FROM geography.cities c
       LEFT JOIN geography.countries p ON p.id = c.country_id
       WHERE ($1::text = '' OR c.name ILIKE $2 ESCAPE '\\' OR p.name ILIKE $2 ESCAPE '\\')
       ORDER BY c.name, c.id
       LIMIT 30`,
      [texto, comoBusca(texto)],
    );
    return linhas.map((linha) => ({ id: linha.id, name: linha.name, countryName: linha.country_name }));
  }

  async ficha(id: string): Promise<LugarAdmin | null> {
    const lugares = await this.dados.query<LinhaLugar[]>(`SELECT * FROM catalog.places WHERE id = $1`, [id]);
    const lugar = lugares[0];
    if (!lugar) return null;
    await this.recalcular([id]);
    const [traducoes, categorias, enderecos, horarios, precos, visitas, referencias, midias, resumo] = await Promise.all([
      this.dados.query<TraducaoEntrada[]>(
        `SELECT locale, name, description FROM catalog.place_translations WHERE place_id = $1 ORDER BY locale`,
        [id],
      ),
      this.dados.query<{ category_id: string }[]>(
        `SELECT category_id FROM catalog.place_category_relations WHERE place_id = $1 ORDER BY category_id`,
        [id],
      ),
      this.dados.query<LinhaEndereco[]>(
        `SELECT line1, neighborhood, postal_code, city_id FROM catalog.place_addresses WHERE place_id = $1 ORDER BY id`,
        [id],
      ),
      this.dados.query<LinhaHorario[]>(
        `SELECT weekday, opening_time, closing_time, is_closed FROM catalog.place_opening_hours WHERE place_id = $1 ORDER BY weekday, id`,
        [id],
      ),
      this.dados.query<LinhaPreco[]>(
        `SELECT currency, price_level, minimum_price, maximum_price FROM catalog.place_price_information WHERE place_id = $1 ORDER BY id`,
        [id],
      ),
      this.dados.query<LinhaVisita[]>(
        `SELECT recommended_duration_minutes, best_time_to_visit, accessibility_information
         FROM catalog.place_visit_information WHERE place_id = $1 ORDER BY id`,
        [id],
      ),
      this.dados.query<LinhaReferencia[]>(
        `SELECT provider, external_id, external_url, provider_metadata FROM catalog.place_external_references WHERE place_id = $1 ORDER BY id`,
        [id],
      ),
      this.dados.query<LinhaMidia[]>(
        `SELECT id, media_type, attribution, sort_order FROM catalog.place_media
         WHERE place_id = $1 AND storage_key IS NOT NULL ORDER BY sort_order NULLS LAST, id`,
        [id],
      ),
      this.dados.query<{ average_rating: string | null; total_reviews: number }[]>(
        `SELECT average_rating, total_reviews FROM catalog.place_ratings_summary WHERE place_id = $1`,
        [id],
      ),
    ]);
    return {
      id: lugar.id,
      slug: lugar.slug,
      name: lugar.name,
      description: lugar.description,
      cityId: lugar.city_id,
      latitude: numero(lugar.latitude),
      longitude: numero(lugar.longitude),
      websiteUrl: lugar.website_url,
      phone: lugar.phone,
      status: lugar.status,
      translations: traducoes.map((item) => ({ locale: item.locale, name: item.name, description: item.description })),
      categoryIds: categorias.map((item) => item.category_id),
      addresses: enderecos.map((item) => ({
        line1: item.line1,
        neighborhood: item.neighborhood,
        postalCode: item.postal_code,
        cityId: item.city_id,
      })),
      openingHours: horarios.map((item) => ({
        weekday: Number(item.weekday),
        openingTime: item.opening_time,
        closingTime: item.closing_time,
        isClosed: item.is_closed,
      })),
      prices: precos.map((item) => ({
        currency: item.currency?.trim() || null,
        priceLevel: numero(item.price_level),
        minimumPrice: numero(item.minimum_price),
        maximumPrice: numero(item.maximum_price),
      })),
      visitInformation: visitas.map((item) => ({
        recommendedDurationMinutes: numero(item.recommended_duration_minutes),
        bestTimeToVisit: item.best_time_to_visit,
        accessibilityInformation: item.accessibility_information,
      })),
      externalReferences: referencias.map((item) => ({
        provider: item.provider,
        externalId: item.external_id,
        externalUrl: item.external_url,
        providerMetadata: objeto(item.provider_metadata),
      })),
      media: midias.map((item) => ({
        id: item.id,
        mediaType: item.media_type,
        attribution: item.attribution,
        sortOrder: numero(item.sort_order),
      })),
      averageRating: numero(resumo[0]?.average_rating ?? null),
      totalReviews: Number(resumo[0]?.total_reviews ?? 0),
    };
  }

  async salvar(id: string | null, entrada: SalvarLugar): Promise<LugarAdmin | FalhaCatalogo> {
    const lugarId = id ?? randomUUID();
    if (id && !(await this.existeLugar(id))) return 'ausente';
    if (!(await this.cidadesValidas([entrada.cityId, ...entrada.addresses.map((item) => item.cityId)]))) return 'cidade';
    if (!(await this.categoriasValidas(entrada.categoryIds))) return 'categoria';
    if (await this.referenciaOcupada(entrada.externalReferences, lugarId)) return 'referencia';
    try {
      await this.dados.transaction(async (manager) => {
        const consultar = consultaDe(manager);
        if (id) {
          await consultar(
            `UPDATE catalog.places
             SET city_id = $2, slug = $3, name = $4, description = $5, latitude = $6, longitude = $7,
                 website_url = $8, phone = $9, status = $10, updated_at = now()
             WHERE id = $1`,
            [lugarId, entrada.cityId, entrada.slug, entrada.name, entrada.description, entrada.latitude, entrada.longitude, entrada.websiteUrl, entrada.phone, entrada.status],
          );
          await limparFicha(consultar, lugarId);
        } else {
          await consultar(
            `INSERT INTO catalog.places (id, city_id, slug, name, description, latitude, longitude, website_url, phone, status)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
            [lugarId, entrada.cityId, entrada.slug, entrada.name, entrada.description, entrada.latitude, entrada.longitude, entrada.websiteUrl, entrada.phone, entrada.status],
          );
        }
        await gravarFicha(consultar, lugarId, entrada);
      });
    } catch (erro) {
      const falha = falhaDe(erro);
      if (falha) return falha;
      throw erro;
    }
    return (await this.ficha(lugarId)) ?? 'ausente';
  }

  async arquivar(id: string): Promise<LugarAdmin | 'ausente'> {
    const linhas = linhasDe(await this.dados.query(`UPDATE catalog.places SET status = 'archived', updated_at = now() WHERE id = $1 RETURNING id`, [id]));
    if (linhas.length === 0) return 'ausente';
    return (await this.ficha(id)) ?? 'ausente';
  }

  async unificar(destinoId: string, origemId: string): Promise<LugarAdmin | 'ausente' | 'mesmo'> {
    if (destinoId === origemId) return 'mesmo';
    if (!(await this.existeLugar(destinoId)) || !(await this.existeLugar(origemId))) return 'ausente';
    await this.dados.transaction(async (manager) => {
      const consultar = consultaDe(manager);
      await consultar(`UPDATE catalog.place_addresses SET place_id = $1 WHERE place_id = $2`, [destinoId, origemId]);
      await consultar(`UPDATE catalog.place_opening_hours SET place_id = $1 WHERE place_id = $2`, [destinoId, origemId]);
      await consultar(`UPDATE catalog.place_price_information SET place_id = $1 WHERE place_id = $2`, [destinoId, origemId]);
      await consultar(`UPDATE catalog.place_visit_information SET place_id = $1 WHERE place_id = $2`, [destinoId, origemId]);
      await consultar(`UPDATE catalog.place_media SET place_id = $1 WHERE place_id = $2`, [destinoId, origemId]);
      await consultar(`UPDATE catalog.place_community_tips SET place_id = $1 WHERE place_id = $2`, [destinoId, origemId]);
      await consultar(`UPDATE community.place_reviews SET place_id = $1 WHERE place_id = $2`, [destinoId, origemId]);
      await consultar(
        `INSERT INTO catalog.place_category_relations (place_id, category_id)
         SELECT $1, category_id FROM catalog.place_category_relations WHERE place_id = $2
         ON CONFLICT DO NOTHING`,
        [destinoId, origemId],
      );
      await consultar(`DELETE FROM catalog.place_category_relations WHERE place_id = $1`, [origemId]);
      await consultar(
        `INSERT INTO catalog.place_translations (place_id, locale, name, description)
         SELECT $1, locale, name, description FROM catalog.place_translations origem
         WHERE origem.place_id = $2
           AND NOT EXISTS (
             SELECT 1 FROM catalog.place_translations destino
             WHERE destino.place_id = $1 AND destino.locale = origem.locale
           )`,
        [destinoId, origemId],
      );
      await consultar(`DELETE FROM catalog.place_translations WHERE place_id = $1`, [origemId]);
      await consultar(`UPDATE catalog.place_external_references SET place_id = $1 WHERE place_id = $2`, [destinoId, origemId]);
      await consultar(`DELETE FROM catalog.place_ratings_summary WHERE place_id IN ($1, $2)`, [destinoId, origemId]);
      await consultar(`UPDATE catalog.places SET status = 'archived', updated_at = now() WHERE id = $1`, [origemId]);
    });
    await this.recalcular([destinoId]);
    return (await this.ficha(destinoId)) ?? 'ausente';
  }

  async categorias(): Promise<CategoriaAdmin[]> {
    const linhas = await this.dados.query<{ id: string; slug: string; parent_id: string | null }[]>(
      `SELECT id, slug, parent_id FROM catalog.place_categories ORDER BY slug, id`,
    );
    const traducoes = await this.dados.query<{ category_id: string; locale: IdiomaCatalogo; name: string }[]>(
      `SELECT category_id, locale, name FROM catalog.place_category_translations ORDER BY locale`,
    );
    return linhas.map((linha) => ({
      id: linha.id,
      slug: linha.slug,
      parentId: linha.parent_id,
      translations: traducoes
        .filter((item) => item.category_id === linha.id)
        .map((item) => ({ locale: item.locale, name: item.name })),
    }));
  }

  async salvarCategoria(id: string | null, entrada: SalvarCategoria): Promise<CategoriaAdmin | FalhaCatalogo> {
    const categoriaId = id ?? randomUUID();
    if (entrada.parentId === categoriaId) return 'invalido';
    if (entrada.parentId && !(await this.existeCategoria(entrada.parentId))) return 'categoria';
    if (id && !(await this.existeCategoria(id))) return 'ausente';
    if (id && entrada.parentId && (await this.cadeiaChega(entrada.parentId, id))) return 'invalido';
    try {
      await this.dados.transaction(async (manager) => {
        const consultar = consultaDe(manager);
        if (id) {
          await consultar(`UPDATE catalog.place_categories SET slug = $2, parent_id = $3 WHERE id = $1`, [categoriaId, entrada.slug, entrada.parentId]);
          await consultar(`DELETE FROM catalog.place_category_translations WHERE category_id = $1`, [categoriaId]);
        } else {
          await consultar(`INSERT INTO catalog.place_categories (id, parent_id, slug) VALUES ($1, $2, $3)`, [categoriaId, entrada.parentId, entrada.slug]);
        }
        for (const traducao of entrada.translations) {
          await consultar(
            `INSERT INTO catalog.place_category_translations (category_id, locale, name) VALUES ($1, $2, $3)`,
            [categoriaId, traducao.locale, traducao.name],
          );
        }
      });
    } catch (erro) {
      const falha = falhaDe(erro);
      if (falha) return falha === 'referencia' ? 'slug' : falha;
      throw erro;
    }
    const lista = await this.categorias();
    return lista.find((item) => item.id === categoriaId) ?? 'ausente';
  }

  async excluirCategoria(id: string): Promise<'ok' | 'ausente' | 'em_uso'> {
    if (!(await this.existeCategoria(id))) return 'ausente';
    const uso = await this.dados.query<{ total: string }[]>(
      `SELECT (
         (SELECT count(*) FROM catalog.place_category_relations WHERE category_id = $1)
         + (SELECT count(*) FROM catalog.place_categories WHERE parent_id = $1)
       )::text AS total`,
      [id],
    );
    if (Number(uso[0]?.total ?? 0) > 0) return 'em_uso';
    await this.dados.transaction(async (manager) => {
      const consultar = consultaDe(manager);
      await consultar(`DELETE FROM catalog.place_category_translations WHERE category_id = $1`, [id]);
      await consultar(`DELETE FROM catalog.place_categories WHERE id = $1`, [id]);
    });
    return 'ok';
  }

  async adicionarMidia(
    lugarId: string,
    chave: string,
    tipo: 'photo' | 'video',
    atribuicao: string | null,
    ordem: number | null,
  ): Promise<{ id: string } | 'ausente'> {
    if (!(await this.existeLugar(lugarId))) return 'ausente';
    const id = randomUUID();
    await this.dados.query(
      `INSERT INTO catalog.place_media (id, place_id, media_type, storage_key, attribution, sort_order) VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, lugarId, tipo, chave, atribuicao, ordem],
    );
    return { id };
  }

  async removerMidia(lugarId: string, midiaId: string): Promise<{ chave: string } | 'ausente'> {
    const linhas = linhasDe<{ storage_key: string }>(
      await this.dados.query(
        `DELETE FROM catalog.place_media WHERE id = $1 AND place_id = $2 AND storage_key IS NOT NULL RETURNING storage_key`,
        [midiaId, lugarId],
      ),
    );
    const chave = linhas[0]?.storage_key;
    return chave ? { chave } : 'ausente';
  }

  private async existeLugar(id: string): Promise<boolean> {
    const linhas = await this.dados.query<{ id: string }[]>(`SELECT id FROM catalog.places WHERE id = $1`, [id]);
    return Boolean(linhas[0]);
  }

  private async existeCategoria(id: string): Promise<boolean> {
    const linhas = await this.dados.query<{ id: string }[]>(`SELECT id FROM catalog.place_categories WHERE id = $1`, [id]);
    return Boolean(linhas[0]);
  }

  private async cidadesValidas(ids: (string | null)[]): Promise<boolean> {
    const pedidos = [...new Set(ids.filter((id): id is string => Boolean(id)))];
    if (pedidos.length === 0) return true;
    const linhas = await this.dados.query<{ total: string }[]>(
      `SELECT count(*)::text AS total FROM geography.cities WHERE id = ANY($1::uuid[])`,
      [pedidos],
    );
    return Number(linhas[0]?.total ?? 0) === pedidos.length;
  }

  private async categoriasValidas(ids: string[]): Promise<boolean> {
    if (ids.length === 0) return true;
    const linhas = await this.dados.query<{ total: string }[]>(
      `SELECT count(*)::text AS total FROM catalog.place_categories WHERE id = ANY($1::uuid[])`,
      [ids],
    );
    return Number(linhas[0]?.total ?? 0) === ids.length;
  }

  private async referenciaOcupada(referencias: ReferenciaEntrada[], lugarId: string): Promise<boolean> {
    for (const referencia of referencias) {
      const linhas = await this.dados.query<{ id: string }[]>(
        `SELECT id FROM catalog.place_external_references WHERE provider = $1 AND external_id = $2 AND place_id <> $3`,
        [referencia.provider, referencia.externalId, lugarId],
      );
      if (linhas[0]) return true;
    }
    return false;
  }

  private async cadeiaChega(partidaId: string, alvoId: string): Promise<boolean> {
    const linhas = await this.dados.query<{ id: string }[]>(
      `WITH RECURSIVE cadeia AS (
         SELECT id, parent_id FROM catalog.place_categories WHERE id = $1
         UNION ALL
         SELECT categoria.id, categoria.parent_id
         FROM catalog.place_categories categoria
         JOIN cadeia ON categoria.id = cadeia.parent_id
       )
       SELECT id FROM cadeia WHERE id = $2`,
      [partidaId, alvoId],
    );
    return Boolean(linhas[0]);
  }

  private async recalcular(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await this.dados.query(
      `INSERT INTO catalog.place_ratings_summary (place_id, average_rating, total_reviews, updated_at)
       SELECT p.id, ROUND(AVG(r.rating)::numeric, 2), COUNT(r.id)::int, now()
       FROM catalog.places p
       LEFT JOIN community.place_reviews r ON r.place_id = p.id AND r.status = 'published'
       WHERE p.id = ANY($1::uuid[])
       GROUP BY p.id
       ON CONFLICT (place_id) DO UPDATE
       SET average_rating = EXCLUDED.average_rating,
           total_reviews = EXCLUDED.total_reviews,
           updated_at = now()`,
      [ids],
    );
  }
}

async function limparFicha(consultar: Consulta, lugarId: string): Promise<void> {
  await consultar(`DELETE FROM catalog.place_translations WHERE place_id = $1`, [lugarId]);
  await consultar(`DELETE FROM catalog.place_category_relations WHERE place_id = $1`, [lugarId]);
  await consultar(`DELETE FROM catalog.place_addresses WHERE place_id = $1`, [lugarId]);
  await consultar(`DELETE FROM catalog.place_opening_hours WHERE place_id = $1`, [lugarId]);
  await consultar(`DELETE FROM catalog.place_price_information WHERE place_id = $1`, [lugarId]);
  await consultar(`DELETE FROM catalog.place_visit_information WHERE place_id = $1`, [lugarId]);
  await consultar(`DELETE FROM catalog.place_external_references WHERE place_id = $1`, [lugarId]);
}

async function gravarFicha(consultar: Consulta, lugarId: string, entrada: SalvarLugar): Promise<void> {
  for (const traducao of entrada.translations) await gravarTraducao(consultar, lugarId, traducao);
  for (const categoriaId of entrada.categoryIds) {
    await consultar(`INSERT INTO catalog.place_category_relations (place_id, category_id) VALUES ($1, $2)`, [lugarId, categoriaId]);
  }
  for (const endereco of entrada.addresses) await gravarEndereco(consultar, lugarId, endereco);
  for (const horario of entrada.openingHours) await gravarHorario(consultar, lugarId, horario);
  for (const preco of entrada.prices) await gravarPreco(consultar, lugarId, preco);
  for (const visita of entrada.visitInformation) await gravarVisita(consultar, lugarId, visita);
  for (const referencia of entrada.externalReferences) await gravarReferencia(consultar, lugarId, referencia);
}

function gravarTraducao(consultar: Consulta, lugarId: string, traducao: TraducaoEntrada): Promise<unknown> {
  return consultar(
    `INSERT INTO catalog.place_translations (place_id, locale, name, description) VALUES ($1, $2, $3, $4)`,
    [lugarId, traducao.locale, traducao.name, traducao.description],
  );
}

function gravarEndereco(consultar: Consulta, lugarId: string, endereco: EnderecoEntrada): Promise<unknown> {
  return consultar(
    `INSERT INTO catalog.place_addresses (place_id, line1, neighborhood, postal_code, city_id) VALUES ($1, $2, $3, $4, $5)`,
    [lugarId, endereco.line1, endereco.neighborhood, endereco.postalCode, endereco.cityId],
  );
}

function gravarHorario(consultar: Consulta, lugarId: string, horario: HorarioEntrada): Promise<unknown> {
  return consultar(
    `INSERT INTO catalog.place_opening_hours (place_id, weekday, opening_time, closing_time, is_closed) VALUES ($1, $2, $3, $4, $5)`,
    [lugarId, horario.weekday, horario.openingTime, horario.closingTime, horario.isClosed],
  );
}

function gravarPreco(consultar: Consulta, lugarId: string, preco: PrecoEntrada): Promise<unknown> {
  return consultar(
    `INSERT INTO catalog.place_price_information (place_id, currency, price_level, minimum_price, maximum_price) VALUES ($1, $2, $3, $4, $5)`,
    [lugarId, preco.currency, preco.priceLevel, preco.minimumPrice, preco.maximumPrice],
  );
}

function gravarVisita(consultar: Consulta, lugarId: string, visita: VisitaEntrada): Promise<unknown> {
  return consultar(
    `INSERT INTO catalog.place_visit_information (place_id, recommended_duration_minutes, best_time_to_visit, accessibility_information)
     VALUES ($1, $2, $3, $4)`,
    [lugarId, visita.recommendedDurationMinutes, visita.bestTimeToVisit, visita.accessibilityInformation],
  );
}

function gravarReferencia(consultar: Consulta, lugarId: string, referencia: ReferenciaEntrada): Promise<unknown> {
  return consultar(
    `INSERT INTO catalog.place_external_references (place_id, provider, external_id, external_url, provider_metadata)
     VALUES ($1, $2, $3, $4, $5::jsonb)`,
    [lugarId, referencia.provider, referencia.externalId, referencia.externalUrl, referencia.providerMetadata ? JSON.stringify(referencia.providerMetadata) : null],
  );
}

function consultaDe(manager: EntityManager): Consulta {
  return (sql, params) => manager.query(sql, params);
}

interface LinhaResumo {
  id: string;
  slug: string;
  name: string;
  status: StatusLugar;
  city_name: string | null;
}

interface LinhaLugar {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  city_id: string | null;
  latitude: string | null;
  longitude: string | null;
  website_url: string | null;
  phone: string | null;
  status: StatusLugar;
}

interface LinhaEndereco {
  line1: string | null;
  neighborhood: string | null;
  postal_code: string | null;
  city_id: string | null;
}

interface LinhaHorario {
  weekday: number;
  opening_time: string | null;
  closing_time: string | null;
  is_closed: boolean;
}

interface LinhaPreco {
  currency: string | null;
  price_level: string | number | null;
  minimum_price: string | null;
  maximum_price: string | null;
}

interface LinhaVisita {
  recommended_duration_minutes: string | number | null;
  best_time_to_visit: string | null;
  accessibility_information: string | null;
}

interface LinhaReferencia {
  provider: string;
  external_id: string;
  external_url: string | null;
  provider_metadata: unknown;
}

interface LinhaMidia {
  id: string;
  media_type: string;
  attribution: string | null;
  sort_order: string | number | null;
}

function linhasDe<T>(resultado: unknown): T[] {
  if (Array.isArray(resultado) && Array.isArray(resultado[0])) return resultado[0] as T[];
  return (resultado as T[]) ?? [];
}

function numero(valor: string | number | null): number | null {
  if (valor === null || valor === undefined) return null;
  const lido = Number(valor);
  return Number.isFinite(lido) ? lido : null;
}

function objeto(valor: unknown): Record<string, unknown> | null {
  if (valor === null || valor === undefined) return null;
  if (typeof valor === 'string') return JSON.parse(valor) as Record<string, unknown>;
  if (typeof valor === 'object') return valor as Record<string, unknown>;
  return null;
}

function comoBusca(valor: string): string {
  return `%${valor.replace(/[\\%_]/g, (trecho) => `\\${trecho}`)}%`;
}

function falhaDe(erro: unknown): FalhaCatalogo | null {
  if (!erro || typeof erro !== 'object') return null;
  const atual = erro as { code?: string; constraint?: string; driverError?: { code?: string; constraint?: string } };
  const code = atual.code ?? atual.driverError?.code;
  if (code !== '23505') return null;
  const constraint = atual.constraint ?? atual.driverError?.constraint ?? '';
  if (constraint.includes('external')) return 'referencia';
  return 'slug';
}
