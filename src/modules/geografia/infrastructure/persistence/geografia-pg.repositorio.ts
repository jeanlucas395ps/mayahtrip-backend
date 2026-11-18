import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  CidadeLida,
  ContinenteLido,
  DestinoLido,
  GeografiaRepositorio,
  IdiomaGeografia,
  PaisLido,
} from '../../domain/ports/geografia.port';

const LIMITE_DESTINOS = 20;

@Injectable()
export class GeografiaPgRepositorio implements GeografiaRepositorio {
  constructor(@Inject(DataSource) private readonly dados: DataSource) {}

  async buscarDestinos(texto: string, idioma: IdiomaGeografia): Promise<DestinoLido[]> {
    const busca = comoBusca(texto);
    const linhas = await this.dados.query<LinhaDestino[]>(
      `${baseCidade}
       WHERE c.name ILIKE $2 ESCAPE '\\'
          OR p.name ILIKE $2 ESCAPE '\\'
          OR COALESCE(tc.translated_name, '') ILIKE $2 ESCAPE '\\'
          OR COALESCE(tp.translated_name, '') ILIKE $2 ESCAPE '\\'
          OR EXISTS (
            SELECT 1 FROM geography.geographic_aliases a
            WHERE a.entity_type = 'city' AND a.entity_id = c.id
              AND (a.locale IS NULL OR a.locale = $1)
              AND a.alias ILIKE $2 ESCAPE '\\'
          )
          OR EXISTS (
            SELECT 1 FROM geography.geographic_aliases a
            WHERE a.entity_type = 'country' AND a.entity_id = p.id
              AND (a.locale IS NULL OR a.locale = $1)
              AND a.alias ILIKE $2 ESCAPE '\\'
          )
       ORDER BY city_name, country_name
       LIMIT ${LIMITE_DESTINOS}`,
      [idioma, busca],
    );
    return linhas.map(paraDestino);
  }

  async cidade(id: string, idioma: IdiomaGeografia): Promise<CidadeLida | null> {
    const linhas = await this.dados.query<LinhaCidade[]>(`${baseCidade} WHERE c.id = $2`, [idioma, id]);
    const linha = linhas[0];
    if (!linha) return null;
    return {
      ...paraDestino(linha),
      latitude: numero(linha.latitude),
      longitude: numero(linha.longitude),
      timezone: linha.timezone,
    };
  }

  async paises(idioma: IdiomaGeografia): Promise<PaisLido[]> {
    const linhas = await this.dados.query<LinhaPais[]>(
      `SELECT p.id, p.iso2,
              COALESCE(tp.translated_name, p.name) AS name,
              cont.id AS continent_id,
              COALESCE(tcont.translated_name, cont.name) AS continent_name
       FROM geography.countries p
       LEFT JOIN geography.continents cont ON cont.id = p.continent_id
       LEFT JOIN geography.geographic_translations tp
         ON tp.entity_type = 'country' AND tp.entity_id = p.id AND tp.locale = $1
       LEFT JOIN geography.geographic_translations tcont
         ON tcont.entity_type = 'continent' AND tcont.entity_id = cont.id AND tcont.locale = $1
       ORDER BY name, p.id`,
      [idioma],
    );
    return linhas.map((linha) => ({
      id: linha.id,
      iso2: linha.iso2,
      name: linha.name,
      continentId: linha.continent_id,
      continentName: linha.continent_name,
    }));
  }

  async continentes(idioma: IdiomaGeografia): Promise<ContinenteLido[]> {
    const linhas = await this.dados.query<LinhaContinente[]>(
      `SELECT cont.id, cont.code,
              COALESCE(t.translated_name, cont.name) AS name,
              count(p.id)::text AS country_count
       FROM geography.continents cont
       LEFT JOIN geography.countries p ON p.continent_id = cont.id
       LEFT JOIN geography.geographic_translations t
         ON t.entity_type = 'continent' AND t.entity_id = cont.id AND t.locale = $1
       GROUP BY cont.id, cont.code, COALESCE(t.translated_name, cont.name)
       ORDER BY name, cont.id`,
      [idioma],
    );
    return linhas.map((linha) => ({
      id: linha.id,
      code: linha.code,
      name: linha.name,
      countryCount: Number(linha.country_count),
    }));
  }
}

const baseCidade = `
  SELECT c.id AS city_id,
         COALESCE(tc.translated_name, c.name) AS city_name,
         p.id AS country_id,
         COALESCE(tp.translated_name, p.name) AS country_name,
         COALESCE(tcont.translated_name, cont.name) AS continent_name,
         COALESCE(tr.translated_name, r.name) AS region_name,
         c.latitude, c.longitude, c.timezone
  FROM geography.cities c
  JOIN geography.countries p ON p.id = c.country_id
  LEFT JOIN geography.continents cont ON cont.id = p.continent_id
  LEFT JOIN geography.regions r ON r.id = c.region_id
  LEFT JOIN geography.geographic_translations tc
    ON tc.entity_type = 'city' AND tc.entity_id = c.id AND tc.locale = $1
  LEFT JOIN geography.geographic_translations tp
    ON tp.entity_type = 'country' AND tp.entity_id = p.id AND tp.locale = $1
  LEFT JOIN geography.geographic_translations tcont
    ON tcont.entity_type = 'continent' AND tcont.entity_id = cont.id AND tcont.locale = $1
  LEFT JOIN geography.geographic_translations tr
    ON tr.entity_type = 'region' AND tr.entity_id = r.id AND tr.locale = $1
`;

interface LinhaDestino {
  city_id: string;
  city_name: string;
  country_id: string;
  country_name: string;
  continent_name: string | null;
  region_name: string | null;
}

interface LinhaCidade extends LinhaDestino {
  latitude: string | null;
  longitude: string | null;
  timezone: string | null;
}

interface LinhaPais {
  id: string;
  iso2: string | null;
  name: string;
  continent_id: string | null;
  continent_name: string | null;
}

interface LinhaContinente {
  id: string;
  code: string | null;
  name: string;
  country_count: string;
}

function paraDestino(linha: LinhaDestino): DestinoLido {
  return {
    cityId: linha.city_id,
    cityName: linha.city_name,
    countryId: linha.country_id,
    countryName: linha.country_name,
    continentName: linha.continent_name,
    regionName: linha.region_name,
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
