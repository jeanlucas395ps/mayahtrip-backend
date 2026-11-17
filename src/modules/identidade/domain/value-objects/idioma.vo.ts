/** ARCHITECTURE.md §3 / AGENTS.md §3: só estes quatro locales existem. */
const LOCALES_OFICIAIS = ['pt-BR', 'pt-PT', 'en', 'es'] as const;

export type LocaleOficial = (typeof LOCALES_OFICIAIS)[number];

export class IdiomaInvalidoError extends Error {
  constructor(valor: string) {
    super(`"${valor}" não é um dos quatro locales oficiais (pt-BR, pt-PT, en, es).`);
    this.name = 'IdiomaInvalidoError';
  }
}

export class Idioma {
  readonly valor: LocaleOficial;

  constructor(valor: string) {
    if (!LOCALES_OFICIAIS.includes(valor as LocaleOficial)) {
      throw new IdiomaInvalidoError(valor);
    }

    this.valor = valor as LocaleOficial;
  }

  static padrao(): Idioma {
    return new Idioma('pt-BR');
  }
}
