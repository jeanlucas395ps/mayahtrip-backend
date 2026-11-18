import { LocaleOficial } from '../../domain/value-objects/idioma.vo';

const MENSAGENS = {
  username: {
    'pt-BR': 'Use letras, números, ponto, underline ou hífen.',
    'pt-PT': 'Use letras, números, ponto, underline ou hífen.',
    en: 'Use letters, numbers, dot, underscore or hyphen.',
    es: 'Usa letras, números, punto, guion bajo o guion.',
  },
  usernameEmUso: {
    'pt-BR': 'Esse usuário já está em uso.',
    'pt-PT': 'Este utilizador já está a ser usado.',
    en: 'This username is already in use.',
    es: 'Este usuario ya está en uso.',
  },
  bio: {
    'pt-BR': 'A bio pode ter no máximo 150 caracteres.',
    'pt-PT': 'A bio pode ter no máximo 150 caracteres.',
    en: 'The bio can have at most 150 characters.',
    es: 'La bio puede tener como máximo 150 caracteres.',
  },
  nome: {
    'pt-BR': 'O nome pode ter no máximo 120 caracteres.',
    'pt-PT': 'O nome pode ter no máximo 120 caracteres.',
    en: 'The name can have at most 120 characters.',
    es: 'El nombre puede tener como máximo 120 caracteres.',
  },
  cidade: {
    'pt-BR': 'A cidade pode ter no máximo 150 caracteres.',
    'pt-PT': 'A cidade pode ter no máximo 150 caracteres.',
    en: 'The city can have at most 150 characters.',
    es: 'La ciudad puede tener como máximo 150 caracteres.',
  },
  avatarTipo: {
    'pt-BR': 'Envie uma imagem JPG ou PNG.',
    'pt-PT': 'Envie uma imagem JPG ou PNG.',
    en: 'Send a JPG or PNG image.',
    es: 'Envía una imagen JPG o PNG.',
  },
  avatarGrande: {
    'pt-BR': 'A imagem pode ter no máximo 10 MB.',
    'pt-PT': 'A imagem pode ter no máximo 10 MB.',
    en: 'The image can be at most 10 MB.',
    es: 'La imagen puede tener como máximo 10 MB.',
  },
  fotoAtualizada: {
    'pt-BR': 'Foto atualizada.',
    'pt-PT': 'Foto atualizada.',
    en: 'Photo updated.',
    es: 'Foto actualizada.',
  },
  ausente: {
    'pt-BR': 'Perfil não encontrado.',
    'pt-PT': 'Perfil não encontrado.',
    en: 'Profile not found.',
    es: 'Perfil no encontrado.',
  },
} as const;

export type ChaveMensagemPerfil = keyof typeof MENSAGENS;

export function mensagemPerfil(chave: ChaveMensagemPerfil, locale: LocaleOficial): string {
  return MENSAGENS[chave][locale];
}
