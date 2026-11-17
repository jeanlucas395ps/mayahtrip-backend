import i18next, { type i18n } from 'i18next';
import en from './locales/en.json';
import es from './locales/es.json';
import ptBR from './locales/pt-BR.json';
import ptPT from './locales/pt-PT.json';

let instancia: i18n | null = null;

/**
 * DEVELOPMENT.md §1: "Texto de interface nunca fica fixo no widget...
 * i18next nas mensagens da API voltadas ao usuário." Instância isolada do
 * módulo de e-mail — não é o i18n de erro HTTP (fora de escopo aqui).
 */
export async function obterI18nDeEmail(): Promise<i18n> {
  if (instancia) {
    return instancia;
  }

  instancia = i18next.createInstance();
  await instancia.init({
    lng: 'pt-BR',
    fallbackLng: 'pt-BR',
    resources: {
      'pt-BR': { translation: ptBR },
      'pt-PT': { translation: ptPT },
      en: { translation: en },
      es: { translation: es },
    },
    interpolation: { escapeValue: false },
  });

  return instancia;
}
