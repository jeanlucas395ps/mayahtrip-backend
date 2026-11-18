import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  CatalogoRepositorio,
  CategoriaLida,
  EnderecoLido,
  HorarioLido,
  IdiomaCatalogo,
  LugarBuscado,
  LugarLido,
  MidiaLida,
  PrecoLido,
  ReferenciaLida,
  VisitaLida,
} from '../../domain/ports/catalogo.port';

const LIMITE_LUGARES = 20;

@Injectable()
export class CatalogoPgRepositorio implements CatalogoRepositorio {
  constructor(@Inject(DataSource) private readonly dados: DataSource) {}

  async buscar(texto: string, idioma: IdiomaCatalogo): Promise<LugarBuscado[]> {
    const linhas = await this.dados.query<LinhaLugar[]>(
      `${baseLugar}
       WHERE p.status = 'active'
         AND (
           p.name ILIKE $2 ESCAPE '\\'
           OR COALESCE(t.name, '') ILIKE $2 ESCAPE '\\'
           OR c.name ILIKE $2 ESCAPE '\\'
           OR COALESCE(tc.translated_name, '') ILIKE $2 ESCAPE '\\'
           OR EXISTS (
             SELECT 1 FROM catalog.place_addresses e
             WHERE e.place_id = p.id
               AND COALESCE(e.neighborhood, '') ILIKE $2 ESCAPE '\\'
           )
           OR EXISTS (
             SELECT 1
             FROM catalog.place_category_relations r
             JOIN catalog.place_categories cat ON cat.id = r.category_id
             LEFT JOIN catalog.place_category_translations ct
               ON ct.category_id = cat.id AND ct.locale = $1
             WHERE r.place_id = p.id
               AND COALESCE(ct.name, cat.slug) ILIKE $2 ESCAPE '\\'
           )
         )
       ORDER BY COALESCE(t.name, p.name), p.id
       LIMIT ${LIMITE_LUGARES}`,
      [idioma, comoBusca(texto)],
    );
    const categorias = await this.categorias(linhas.map((linha) => linha.id), idioma);
    return linhas.map((linha) => paraBusca(linha, categorias.get(linha.id) ?? []));
  }

  async lugar(id: string, idioma: IdiomaCatalogo): Promise<LugarLido | null> {
    const linhas = await this.dados.query<LinhaLugar[]>(`${baseLugar} WHERE p.id = $2 AND p.status = 'active'`, [idioma, id]);
    const linha = linhas[0];
    if (!linha) return null;
    const [categorias, addresses, openingHours, prices, visitInformation, media, externalReferences] = await Promise.all([
      this.categorias([linha.id], idioma),
      this.enderecos(linha.id),
      this.horarios(linha.id),
      this.precos(linha.id),
      this.visitas(linha.id),
      this.midias(linha.id),
      this.referencias(linha.id),
    ]);
    return {
      ...paraBusca(linha, categorias.get(linha.id) ?? []),
      description: linha.description,
      latitude: numero(linha.latitude),
      longitude: numero(linha.longitude),
      websiteUrl: linha.website_url,
      phone: linha.phone,
      addresses,
      openingHours,
      prices,
      visitInformation,
      media,
      externalReferences,
    };
  }

  async chaveDeMidia(lugarId: string, midiaId: string): Promise<string | null> {
    const linhas = await this.dados.query<{ storage_key: string }[]>(
      `SELECT m.storage_key
       FROM catalog.place_media m
       JOIN catalog.places p ON p.id = m.place_id
       WHERE p.id = $1 AND p.status = 'active' AND m.id = $2 AND m.storage_key IS NOT NULL`,
      [lugarId, midiaId],
    );
    return linhas[0]?.storage_key ?? null;
  }

  private async enderecos(lugarId: string): Promise<EnderecoLido[]> {
    const linhas = await this.dados.query<LinhaEndereco[]>(
      `SELECT id, line1, neighborhood, postal_code, city_id
       FROM catalog.place_addresses WHERE place_id = $1 ORDER BY id`,
      [lugarId],
    );
    return linhas.map((linha) => ({
      id: linha.id,
      line1: linha.line1,
      neighborhood: linha.neighborhood,
      postalCode: linha.postal_code,
      cityId: linha.city_id,
    }));
  }

  private async horarios(lugarId: string): Promise<HorarioLido[]> {
    const linhas = await this.dados.query<LinhaHorario[]>(
      `SELECT id, weekday, opening_time, closing_time, is_closed
       FROM catalog.place_opening_hours WHERE place_id = $1 ORDER BY weekday, opening_time NULLS LAST, id`,
      [lugarId],
    );
    return linhas.map((linha) => ({
      id: linha.id,
      weekday: Number(linha.weekday),
      openingTime: linha.opening_time,
      closingTime: linha.closing_time,
      isClosed: linha.is_closed,
    }));
  }

  private async precos(lugarId: string): Promise<PrecoLido[]> {
    const linhas = await this.dados.query<LinhaPreco[]>(
      `SELECT id, currency, price_level, minimum_price, maximum_price
       FROM catalog.place_price_information WHERE place_id = $1 ORDER BY id`,
      [lugarId],
    );
    return linhas.map((linha) => ({
      id: linha.id,
      currency: moeda(linha.currency),
      priceLevel: inteiro(linha.price_level),
      minimumPrice: numero(linha.minimum_price),
      maximumPrice: numero(linha.maximum_price),
    }));
  }

  private async visitas(lugarId: string): Promise<VisitaLida[]> {
    const linhas = await this.dados.query<LinhaVisita[]>(
      `SELECT id, recommended_duration_minutes, best_time_to_visit, accessibility_information
       FROM catalog.place_visit_information WHERE place_id = $1 ORDER BY id`,
      [lugarId],
    );
    return linhas.map((linha) => ({
      id: linha.id,
      recommendedDurationMinutes: inteiro(linha.recommended_duration_minutes),
      bestTimeToVisit: linha.best_time_to_visit,
      accessibilityInformation: linha.accessibility_information,
    }));
  }

  private async midias(lugarId: string): Promise<MidiaLida[]> {
    const linhas = await this.dados.query<LinhaMidia[]>(
      `SELECT id, media_type, attribution, sort_order
       FROM catalog.place_media
       WHERE place_id = $1 AND storage_key IS NOT NULL
       ORDER BY sort_order NULLS LAST, id`,
      [lugarId],
    );
    return linhas.map((linha) => ({
      id: linha.id,
      mediaType: linha.media_type,
      attribution: linha.attribution,
      sortOrder: inteiro(linha.sort_order),
    }));
  }

  private async referencias(lugarId: string): Promise<ReferenciaLida[]> {
    const linhas = await this.dados.query<LinhaReferencia[]>(
      `SELECT id, provider, external_id, external_url, provider_metadata, last_synced_at
       FROM catalog.place_external_references WHERE place_id = $1 ORDER BY id`,
      [lugarId],
    );
    return linhas.map((linha) => ({
      id: linha.id,
      provider: linha.provider,
      externalId: linha.external_id,
      externalUrl: linha.external_url,
      providerMetadata: objeto(linha.provider_metadata),
      lastSyncedAt: instante(linha.last_synced_at),
    }));
  }

  private async categorias(ids: string[], idioma: IdiomaCatalogo): Promise<Map<string, CategoriaLida[]>> {
    const mapa = new Map<string, CategoriaLida[]>();
    if (ids.length === 0) return mapa;
    const linhas = await this.dados.query<LinhaCategoria[]>(
      `SELECT r.place_id, cat.id, cat.slug, cat.parent_id,
              COALESCE(ct.name, cat.slug) AS name
       FROM catalog.place_category_relations r
       JOIN catalog.place_categories cat ON cat.id = r.category_id
       LEFT JOIN catalog.place_category_translations ct
         ON ct.category_id = cat.id AND ct.locale = $1
       WHERE r.place_id = ANY($2::uuid[])
       ORDER BY COALESCE(ct.name, cat.slug), cat.id`,
      [idioma, ids],
    );
    for (const linha of linhas) {
      const lista = mapa.get(linha.place_id) ?? [];
      lista.push({ id: linha.id, slug: linha.slug, name: linha.name, parentId: linha.parent_id });
      mapa.set(linha.place_id, lista);
    }
    return mapa;
  }
}

const baseLugar = `
  SELECT p.id, p.slug,
         COALESCE(t.name, p.name) AS name,
         COALESCE(t.description, p.description) AS description,
         p.latitude, p.longitude, p.website_url, p.phone,
         c.id AS city_id,
         COALESCE(tc.translated_name, c.name) AS city_name
  FROM catalog.places p
  LEFT JOIN catalog.place_translations t ON t.place_id = p.id AND t.locale = $1
  LEFT JOIN geography.cities c ON c.id = p.city_id
  LEFT JOIN geography.geographic_translations tc
    ON tc.entity_type = 'city' AND tc.entity_id = c.id AND tc.locale = $1
`;

interface LinhaLugar {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  latitude: string | null;
  longitude: string | null;
  website_url: string | null;
  phone: string | null;
  city_id: string | null;
  city_name: string | null;
}

interface LinhaCategoria {
  place_id: string;
  id: string;
  slug: string;
  parent_id: string | null;
  name: string;
}

interface LinhaEndereco {
  id: string;
  line1: string | null;
  neighborhood: string | null;
  postal_code: string | null;
  city_id: string | null;
}

interface LinhaHorario {
  id: string;
  weekday: number;
  opening_time: string | null;
  closing_time: string | null;
  is_closed: boolean;
}

interface LinhaPreco {
  id: string;
  currency: string | null;
  price_level: number | string | null;
  minimum_price: string | null;
  maximum_price: string | null;
}

interface LinhaVisita {
  id: string;
  recommended_duration_minutes: number | string | null;
  best_time_to_visit: string | null;
  accessibility_information: string | null;
}

interface LinhaMidia {
  id: string;
  media_type: string;
  attribution: string | null;
  sort_order: number | string | null;
}

interface LinhaReferencia {
  id: string;
  provider: string;
  external_id: string;
  external_url: string | null;
  provider_metadata: unknown;
  last_synced_at: Date | string | null;
}

function paraBusca(linha: LinhaLugar, categories: CategoriaLida[]): LugarBuscado {
  return {
    id: linha.id,
    slug: linha.slug,
    name: linha.name,
    cityId: linha.city_id,
    cityName: linha.city_name,
    categories,
  };
}

function numero(valor: string | number | null): number | null {
  if (valor === null) return null;
  const lido = Number(valor);
  return Number.isFinite(lido) ? lido : null;
}

function inteiro(valor: string | number | null): number | null {
  return numero(valor);
}

function moeda(valor: string | null): string | null {
  if (valor === null) return null;
  const limpa = valor.trim();
  return limpa.length === 0 ? null : limpa;
}

function objeto(valor: unknown): Record<string, unknown> | null {
  if (valor === null || valor === undefined) return null;
  if (typeof valor === 'string') return JSON.parse(valor) as Record<string, unknown>;
  if (typeof valor === 'object') return valor as Record<string, unknown>;
  return null;
}

function instante(valor: Date | string | null): string | null {
  if (valor === null) return null;
  if (valor instanceof Date) return valor.toISOString();
  const lido = new Date(valor);
  return Number.isNaN(lido.getTime()) ? null : lido.toISOString();
}

function comoBusca(valor: string): string {
  return `%${valor.replace(/[\\%_]/g, (trecho) => `\\${trecho}`)}%`;
}
