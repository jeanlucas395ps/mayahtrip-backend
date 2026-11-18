import { LocaleOficial } from '../../domain/value-objects/idioma.vo';

const MENSAGENS = {
  idioma: {
    'pt-BR': 'Escolha um dos quatro idiomas.',
    'pt-PT': 'Escolha um dos quatro idiomas.',
    en: 'Choose one of the four languages.',
    es: 'Elige uno de los cuatro idiomas.',
  },
  moeda: {
    'pt-BR': 'Escolha uma moeda de exibição.',
    'pt-PT': 'Escolha uma moeda de apresentação.',
    en: 'Choose a display currency.',
    es: 'Elige una moneda de visualización.',
  },
} as const;

export function mensagemPreferencia(chave: keyof typeof MENSAGENS, locale: LocaleOficial): string {
  return MENSAGENS[chave][locale];
}
