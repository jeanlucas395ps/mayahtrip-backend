export const GEOGRAFIA = Symbol('GEOGRAFIA');

export type IdiomaGeografia = 'pt-BR' | 'pt-PT' | 'en' | 'es';

export interface DestinoLido {
  cityId: string;
  cityName: string;
  countryId: string;
  countryName: string;
  continentName: string | null;
  regionName: string | null;
}

export interface CidadeLida extends DestinoLido {
  latitude: number | null;
  longitude: number | null;
  timezone: string | null;
}

export interface PaisLido {
  id: string;
  iso2: string | null;
  name: string;
  continentId: string | null;
  continentName: string | null;
}

export interface ContinenteLido {
  id: string;
  code: string | null;
  name: string;
  countryCount: number;
}

export interface GeografiaRepositorio {
  buscarDestinos(texto: string, idioma: IdiomaGeografia): Promise<DestinoLido[]>;
  cidade(id: string, idioma: IdiomaGeografia): Promise<CidadeLida | null>;
  paises(idioma: IdiomaGeografia): Promise<PaisLido[]>;
  continentes(idioma: IdiomaGeografia): Promise<ContinenteLido[]>;
}
