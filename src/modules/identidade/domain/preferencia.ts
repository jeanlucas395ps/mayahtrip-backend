import { LocaleOficial } from './value-objects/idioma.vo';

export type ModoDePreferencia = 'localizacao' | 'personalizado';

export class PreferenciaInvalidaError extends Error {
  constructor(readonly motivo: 'idioma' | 'moeda') {
    super(motivo);
    this.name = 'PreferenciaInvalidaError';
  }
}

export interface PreferenciaGravada {
  userId: string;
  segueIdioma: boolean;
  idioma: LocaleOficial;
  segueMoeda: boolean;
  moeda: string;
  fuso: string | null;
}

export interface Lugar {
  pais: string | null;
  paisNome: string | null;
  cidade: string | null;
  moeda: string | null;
  fuso: string | null;
}

export interface EscolhaDePreferencia {
  idioma?: string;
  moeda?: string;
}

const IDIOMAS = new Set<LocaleOficial>(['pt-BR', 'pt-PT', 'en', 'es']);

const IDIOMA_POR_PAIS: Record<string, LocaleOficial> = {
  BR: 'pt-BR',
  PT: 'pt-PT',
  US: 'en',
  GB: 'en',
  CA: 'en',
  AU: 'en',
  ES: 'es',
  MX: 'es',
  AR: 'es',
  CO: 'es',
};

/** BUSINESS/35: país fora da tabela, ou sem lugar, fica em pt-BR. */
export function idiomaDoPais(pais: string | null): LocaleOficial {
  if (!pais) return 'pt-BR';
  return IDIOMA_POR_PAIS[pais.toUpperCase()] ?? 'pt-BR';
}

/** A moeda local só entra se for uma das de exibição. Senão, BRL. */
export function moedaDoLugar(moeda: string | null, exibicao: ReadonlySet<string>): string {
  const codigo = moeda?.trim().toUpperCase() ?? '';
  return exibicao.has(codigo) ? codigo : 'BRL';
}

export function aplicarEscolha(
  atual: PreferenciaGravada,
  escolha: EscolhaDePreferencia,
  exibicao: ReadonlySet<string>,
): PreferenciaGravada {
  return {
    ...atual,
    ...idiomaEscolhido(atual, escolha.idioma),
    ...moedaEscolhida(atual, escolha.moeda, exibicao),
  };
}

export function refletir(escolhida: PreferenciaGravada, lugar: Lugar | null, exibicao: ReadonlySet<string>): PreferenciaGravada {
  return {
    ...escolhida,
    idioma: escolhida.segueIdioma ? idiomaDoPais(lugar?.pais ?? null) : escolhida.idioma,
    moeda: escolhida.segueMoeda ? moedaDoLugar(lugar?.moeda ?? null, exibicao) : escolhida.moeda,
    fuso: lugar?.fuso ?? escolhida.fuso,
  };
}

export function modoDe(preferencia: PreferenciaGravada): ModoDePreferencia {
  return preferencia.segueIdioma && preferencia.segueMoeda ? 'localizacao' : 'personalizado';
}

function idiomaEscolhido(atual: PreferenciaGravada, valor: string | undefined): Pick<PreferenciaGravada, 'segueIdioma' | 'idioma'> {
  if (valor === undefined || valor.trim() === '') {
    return { segueIdioma: atual.segueIdioma, idioma: atual.idioma };
  }
  if (valor === 'localizacao') {
    return { segueIdioma: true, idioma: atual.idioma };
  }
  if (!IDIOMAS.has(valor as LocaleOficial)) {
    throw new PreferenciaInvalidaError('idioma');
  }
  return { segueIdioma: false, idioma: valor as LocaleOficial };
}

function moedaEscolhida(
  atual: PreferenciaGravada,
  valor: string | undefined,
  exibicao: ReadonlySet<string>,
): Pick<PreferenciaGravada, 'segueMoeda' | 'moeda'> {
  if (valor === undefined || valor.trim() === '') {
    return { segueMoeda: atual.segueMoeda, moeda: atual.moeda };
  }
  if (valor === 'localizacao') {
    return { segueMoeda: true, moeda: atual.moeda };
  }
  const codigo = valor.trim().toUpperCase();
  if (!exibicao.has(codigo)) {
    throw new PreferenciaInvalidaError('moeda');
  }
  return { segueMoeda: false, moeda: codigo };
}
