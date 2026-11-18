import { Inject, Injectable } from '@nestjs/common';
import { UsuariosUseCase } from './usuarios.use-case';
import {
  DenunciaLida,
  FalhaModeracao,
  Julgamento,
  MODERACAO,
  ModeracaoRepositorio,
  PublicacaoDoPainel,
  TarefaEditorial,
} from '../domain/ports/moderacao.port';

@Injectable()
export class ModeracaoUseCase {
  constructor(
    @Inject(MODERACAO) private readonly moderacao: ModeracaoRepositorio,
    @Inject(UsuariosUseCase) private readonly usuarios: UsuariosUseCase,
  ) {}

  denuncias(status: string | null): Promise<DenunciaLida[]> {
    return this.moderacao.denuncias(status);
  }

  assumir(reportId: string): Promise<'ok' | FalhaModeracao> {
    return this.moderacao.assumir(reportId);
  }

  async julgar(reportId: string, adminId: string, julgamento: Julgamento): Promise<{ actionId: string } | FalhaModeracao> {
    const resultado = await this.moderacao.julgar(reportId, adminId, julgamento);
    if (typeof resultado === 'string') return resultado;
    if (resultado.accountId) await this.usuarios.definirAtivo(resultado.accountId, false);
    return { actionId: resultado.actionId };
  }

  registrarRecurso(adminId: string, actionId: string, email: string, reason: string | null): Promise<{ id: string } | FalhaModeracao> {
    return this.moderacao.registrarRecurso(adminId, actionId, email, reason);
  }

  lerRecurso(id: string): Promise<{ id: string; channel: string; email: string; actionId: string } | 'ausente'> {
    return this.moderacao.lerRecurso(id);
  }

  publicacoes(filtro: { q: string | null; from: string | null; to: string | null; status: string | null }): Promise<PublicacaoDoPainel[]> {
    return this.moderacao.publicacoes(filtro);
  }

  definirPublicacao(postId: string, removida: boolean): Promise<'ok' | 'ausente'> {
    return this.moderacao.definirPublicacao(postId, removida);
  }

  definirComentario(commentId: string, removido: boolean): Promise<'ok' | 'ausente'> {
    return this.moderacao.definirComentario(commentId, removido);
  }

  abrirEditorial(adminId: string, ingestionItemId: string): Promise<{ id: string } | 'ausente'> {
    return this.moderacao.abrirEditorial(adminId, ingestionItemId);
  }

  decidir(adminId: string, taskId: string, decision: 'approved' | 'rejected' | 'edited' | 'escalated', reason: string | null): Promise<TarefaEditorial | FalhaModeracao> {
    return this.moderacao.decidir(adminId, taskId, decision, reason);
  }

  pedirRemocao(publicationId: string, email: string | null, reason: string | null): Promise<{ id: string } | 'ausente'> {
    return this.moderacao.pedirRemocao(publicationId, email, reason);
  }

  lerTarefa(taskId: string): Promise<TarefaEditorial | 'ausente'> {
    return this.moderacao.lerTarefa(taskId);
  }
}
