import { LocaleOficial } from '../../domain/value-objects/idioma.vo';
import { MotivoDocumento } from '../../domain/documento';

const MENSAGENS = {
  tipo: {
    'pt-BR': 'Escolha CPF, CNH, passagem de ônibus ou de avião.',
    'pt-PT': 'Escolha CPF, CNH, passagem de autocarro ou de avião.',
    en: 'Choose CPF, CNH, a bus ticket or a flight ticket.',
    es: 'Elige CPF, CNH, un billete de autobús o de avión.',
  },
  arquivo: {
    'pt-BR': 'Envie uma imagem JPG, PNG, WebP ou um PDF.',
    'pt-PT': 'Envie uma imagem JPG, PNG, WebP ou um PDF.',
    en: 'Send a JPG, PNG, WebP image or a PDF.',
    es: 'Envía una imagen JPG, PNG, WebP o un PDF.',
  },
  tamanho: {
    'pt-BR': 'O arquivo pode ter no máximo 10 MB.',
    'pt-PT': 'O ficheiro pode ter no máximo 10 MB.',
    en: 'The file can be at most 10 MB.',
    es: 'El archivo puede tener como máximo 10 MB.',
  },
  carteira: {
    'pt-BR': 'A carteira só fica disponível quando o documento tem um código legível.',
    'pt-PT': 'A carteira só fica disponível quando o documento tem um código legível.',
    en: 'The wallet is only available when the document has a readable code.',
    es: 'La cartera solo está disponible cuando el documento tiene un código legible.',
  },
  codigo: {
    'pt-BR': 'O código legível é longo demais.',
    'pt-PT': 'O código legível é demasiado longo.',
    en: 'The readable code is too long.',
    es: 'El código legible es demasiado largo.',
  },
  ausente: {
    'pt-BR': 'Documento não encontrado.',
    'pt-PT': 'Documento não encontrado.',
    en: 'Document not found.',
    es: 'Documento no encontrado.',
  },
} as const;

export function mensagemDocumento(chave: MotivoDocumento | 'ausente', locale: LocaleOficial): string {
  return MENSAGENS[chave][locale];
}
