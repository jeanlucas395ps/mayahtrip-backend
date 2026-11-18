export const COMUNIDADE = Symbol('COMUNIDADE');

export type AbaDoFeed = 'para-voce' | 'seguindo' | 'salvos';
export type Visibilidade = 'public' | 'private';

export interface PublicacaoLida {
  id: string;
  authorId: string;
  username: string;
  displayName: string;
  content: string | null;
  visibility: Visibilidade;
  origin: 'user' | 'review';
  liked: boolean;
  saved: boolean;
  likeCount: number;
  commentCount: number;
  places: { id: string; name: string }[];
  mentions: { userId: string; username: string }[];
  cover: { id: string; width: number; height: number } | null;
}

export interface ComentarioLido {
  id: string;
  authorId: string;
  username: string;
  content: string;
  parentId: string | null;
  likeCount: number;
  liked: boolean;
  replies: ComentarioLido[];
}

export interface PublicacaoNova {
  content: string | null;
  visibility: Visibilidade;
  placeIds: string[];
  mentionIds: string[];
}

export interface MidiaNova {
  storageKey: string;
  mime: string;
  width: number;
  height: number;
  byteSize: number;
}

export interface AvaliacaoNova extends MidiaNova {
  rating: number;
  reviewText: string | null;
}

export interface DenunciaNova {
  categoryId: string;
  description: string | null;
  postId: string | null;
  commentId: string | null;
  reviewId: string | null;
  reportedUserId: string | null;
}

export type FalhaComunidade =
  | 'ausente'
  | 'proibido'
  | 'lugar'
  | 'pessoa'
  | 'midia'
  | 'nota'
  | 'vazio'
  | 'nivel'
  | 'pedido'
  | 'categoria'
  | 'alvo';

export interface ComunidadeRepositorio {
  feed(userId: string, aba: AbaDoFeed): Promise<PublicacaoLida[]>;
  criar(userId: string, entrada: PublicacaoNova): Promise<PublicacaoLida | FalhaComunidade>;
  anexar(userId: string, postId: string, midia: MidiaNova): Promise<PublicacaoLida | FalhaComunidade>;
  salvar(userId: string, postId: string, salvo: boolean): Promise<PublicacaoLida | FalhaComunidade>;
  curtir(userId: string, postId: string, ativo: boolean): Promise<PublicacaoLida | FalhaComunidade>;
  comentarios(userId: string, postId: string): Promise<ComentarioLido[] | FalhaComunidade>;
  comentar(userId: string, postId: string, content: string, parentId: string | null): Promise<ComentarioLido[] | FalhaComunidade>;
  apagarComentario(userId: string, commentId: string): Promise<'ok' | FalhaComunidade>;
  curtirComentario(userId: string, commentId: string, ativo: boolean): Promise<'ok' | FalhaComunidade>;
  seguir(userId: string, alvoId: string): Promise<'segue' | 'pedido' | FalhaComunidade>;
  deixarDeSeguir(userId: string, alvoId: string): Promise<'ok' | FalhaComunidade>;
  responderPedido(userId: string, requesterId: string, aceitar: boolean): Promise<'ok' | FalhaComunidade>;
  bloquear(userId: string, alvoId: string, ativo: boolean): Promise<'ok' | FalhaComunidade>;
  silenciar(userId: string, alvoId: string, ativo: boolean): Promise<'ok' | FalhaComunidade>;
  avaliar(userId: string, placeId: string, entrada: AvaliacaoNova): Promise<PublicacaoLida | FalhaComunidade>;
  categorias(): Promise<{ id: string; name: string }[]>;
  denunciar(userId: string, entrada: DenunciaNova): Promise<{ id: string } | FalhaComunidade>;
}
