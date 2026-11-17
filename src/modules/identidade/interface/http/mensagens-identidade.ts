import { LocaleOficial } from '../../domain/value-objects/idioma.vo';

const MENSAGENS: Record<string, Record<LocaleOficial, string>> = {
  confirmada: {
    'pt-BR': 'Conta criada.',
    'pt-PT': 'Conta criada.',
    en: 'Account created.',
    es: 'Cuenta creada.',
  },
  bloqueada: {
    'pt-BR': 'Você errou 5 vezes. Por segurança, peça um novo código.',
    'pt-PT': 'Errou 5 vezes. Por segurança, peça um novo código.',
    en: 'You got it wrong 5 times. For security, request a new code.',
    es: 'Te equivocaste 5 veces. Por seguridad, pide un código nuevo.',
  },
  reenvioCedo: {
    'pt-BR': 'Aguarde para pedir um novo código.',
    'pt-PT': 'Aguarde para pedir um novo código.',
    en: 'Wait before requesting a new code.',
    es: 'Espera para pedir un código nuevo.',
  },
  reenvioOk: {
    'pt-BR': 'Se a conta ainda estiver pendente, enviaremos um novo código.',
    'pt-PT': 'Se a conta ainda estiver pendente, enviaremos um novo código.',
    en: 'If the account is still pending, we will send a new code.',
    es: 'Si la cuenta sigue pendiente, enviaremos un código nuevo.',
  },
  entrarRecusado: {
    'pt-BR': 'Não foi possível entrar.',
    'pt-PT': 'Não foi possível entrar.',
    en: 'Could not sign in.',
    es: 'No fue posible entrar.',
  },
  handoffRecusado: {
    'pt-BR': 'Código inválido.',
    'pt-PT': 'Código inválido.',
    en: 'Invalid code.',
    es: 'Código no válido.',
  },
};

export function mensagem(chave: keyof typeof MENSAGENS, locale: LocaleOficial): string {
  return MENSAGENS[chave][locale];
}

export function mensagemCodigoIncorreto(restantes: number, locale: LocaleOficial): string {
  if (restantes === 1) {
    return {
      'pt-BR': 'Código incorreto. Você ainda tem 1 tentativa.',
      'pt-PT': 'Código incorreto. Ainda tem 1 tentativa.',
      en: 'Incorrect code. You have 1 attempt left.',
      es: 'Código incorrecto. Te queda 1 intento.',
    }[locale];
  }

  return {
    'pt-BR': `Código incorreto. Você ainda tem ${restantes} tentativas.`,
    'pt-PT': `Código incorreto. Ainda tem ${restantes} tentativas.`,
    en: `Incorrect code. You have ${restantes} attempts left.`,
    es: `Código incorrecto. Te quedan ${restantes} intentos.`,
  }[locale];
}
