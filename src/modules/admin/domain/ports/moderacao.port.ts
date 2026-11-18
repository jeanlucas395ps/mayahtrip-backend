export const MODERACAO = Symbol('MODERACAO');

export interface DenunciaLida {
  id: string;
  status: 'pending' | 'reviewing' | 'resolved' | 'dismissed';
  category: string;
  description: string | null;
  reporterId: string;
  reporterName: string;
  target: 'post' | 'comment' | 'review' | 'profile';
  targetId: string;
  createdAt: string;
}

export interface Julgamento {
  decision: 'resolved' | 'dismissed';
  removeContent: boolean;
  deactivateAccount: boolean;
  reason: string | null;
}

export interface PublicacaoDoPainel {
  id: string;
  status: string;
  origin: string;
  content: string | null;
  authorName: string;
  placeName: string | null;
  rating: number | null;
  likeCount: number;
  commentCount: number;
  createdAt: string;
  comments: { id: string; content: string; authorName: string; likeCount: number; removed: boolean }[];
}

export interface TarefaEditorial {
  id: string;
  status: string;
  ingestionItemId: string;
  decision: string | null;
  publicationId: string | null;
}

export type FalhaModeracao = 'ausente' | 'fechada' | 'alvo';

export interface ModeracaoRepositorio {
  denuncias(status: string | null): Promise<DenunciaLida[]>;
  assumir(reportId: string): Promise<'ok' | FalhaModeracao>;
  julgar(reportId: string, adminId: string, julgamento: Julgamento): Promise<{ actionId: string; accountId: string | null; reporterId: string; decision: 'resolved' | 'dismissed' } | FalhaModeracao>;
  registrarRecurso(adminId: string, actionId: string, email: string, reason: string | null): Promise<{ id: string } | FalhaModeracao>;
  lerRecurso(id: string): Promise<{ id: string; channel: string; email: string; actionId: string } | 'ausente'>;
  publicacoes(filtro: { q: string | null; from: string | null; to: string | null; status: string | null }): Promise<PublicacaoDoPainel[]>;
  definirPublicacao(postId: string, removida: boolean): Promise<'ok' | 'ausente'>;
  definirComentario(commentId: string, removido: boolean): Promise<'ok' | 'ausente'>;
  abrirEditorial(adminId: string, ingestionItemId: string): Promise<{ id: string } | 'ausente'>;
  decidir(adminId: string, taskId: string, decision: 'approved' | 'rejected' | 'edited' | 'escalated', reason: string | null): Promise<TarefaEditorial | FalhaModeracao>;
  pedirRemocao(publicationId: string, email: string | null, reason: string | null): Promise<{ id: string } | 'ausente'>;
  lerTarefa(taskId: string): Promise<TarefaEditorial | 'ausente'>;
}
