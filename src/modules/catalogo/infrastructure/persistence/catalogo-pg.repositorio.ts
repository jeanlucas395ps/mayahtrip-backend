import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  CatalogoRepositorio,
  CategoriaLida,
  IdiomaCatalogo,
  LugarBuscado,
  LugarLido,
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
    const categorias = await this.categorias([linha.id], idioma);
    return {
      ...paraBusca(linha, categorias.get(linha.id) ?? []),
      description: linha.description,
      latitude: numero(linha.latitude),
      longitude: numero(linha.longitude),
      websiteUrl: linha.website_url,
      phone: linha.phone,
    };
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

function numero(valor: string | null): number | null {
  if (valor === null) return null;
  const lido = Number(valor);
  return Number.isFinite(lido) ? lido : null;
}

function comoBusca(valor: string): string {
  return `%${valor.replace(/[\\%_]/g, (trecho) => `\\${trecho}`)}%`;
}
