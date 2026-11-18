import { LocaleOficial } from '../../domain/value-objects/idioma.vo';

const MENSAGENS = {
  ausente: {
    'pt-BR': 'Lugar não encontrado.',
    'pt-PT': 'Lugar não encontrado.',
    en: 'Place not found.',
    es: 'Lugar no encontrado.',
  },
  viagem: {
    'pt-BR': 'Vem de uma viagem. Para remover, edite a viagem.',
    'pt-PT': 'Vem de uma viagem. Para remover, edite a viagem.',
    en: 'This comes from a trip. To remove it, edit the trip.',
    es: 'Viene de un viaje. Para quitarlo, edita el viaje.',
  },
  data: {
    'pt-BR': 'Informe a data como AAAA-MM-DD.',
    'pt-PT': 'Indique a data como AAAA-MM-DD.',
    en: 'Enter the date as YYYY-MM-DD.',
    es: 'Indica la fecha como AAAA-MM-DD.',
  },
} as const;

export function mensagemVisita(chave: keyof typeof MENSAGENS, locale: LocaleOficial): string {
  return MENSAGENS[chave][locale];
}
