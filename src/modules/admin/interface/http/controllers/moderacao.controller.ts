import { Body, Controller, Get, HttpCode, HttpException, HttpStatus, Inject, Param, Post, Query, Req, UseGuards, ValidationPipe } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ModeracaoUseCase } from '../../../application/moderacao.use-case';
import { SessaoAdminUseCase } from '../../../application/sessao-admin.use-case';
import { DenunciaLida, FalhaModeracao, PublicacaoDoPainel, TarefaEditorial } from '../../../domain/ports/moderacao.port';
import { DecisaoEditorialDto, JulgamentoDto, RecursoDto, RemocaoEditorialDto, TarefaEditorialDto } from '../dto/moderacao.dto';
import { AdminGuard, RequestComAdmin } from '../guards/admin.guard';

const STATUS = new Set(['pending', 'reviewing', 'resolved', 'dismissed']);

@ApiTags('admin')
@Controller('admin')
@UseGuards(AdminGuard)
export class ModeracaoController {
  constructor(
    @Inject(ModeracaoUseCase) private readonly moderacao: ModeracaoUseCase,
    @Inject(SessaoAdminUseCase) private readonly sessoes: SessaoAdminUseCase,
  ) {}

  @Get('reports')
  denuncias(@Query('status') status?: string): Promise<DenunciaLida[]> {
    if (status && !STATUS.has(status)) throw new HttpException({ message: 'Status inválido.' }, HttpStatus.BAD_REQUEST);
    return this.moderacao.denuncias(status ?? null);
  }

  @Post('reports/:id/claim')
  @HttpCode(HttpStatus.NO_CONTENT)
  async assumir(@Req() request: RequestComAdmin, @Param('id') id: string): Promise<void> {
    const resultado = await this.moderacao.assumir(id);
    if (resultado !== 'ok') throw httpDe(resultado);
    await this.sessoes.auditar({ adminId: request.adminId, action: 'report.claim', entityType: 'user_report', entityId: id, oldValues: null, newValues: { status: 'reviewing' }, ip: ipDe(request) });
  }

  @Post('reports/:id/resolve')
  async julgar(@Req() request: RequestComAdmin, @Param('id') id: string, @Body(corpo(JulgamentoDto)) dto: JulgamentoDto): Promise<{ actionId: string }> {
    const resultado = await this.moderacao.julgar(id, request.adminId, {
      decision: dto.decision,
      removeContent: dto.removeContent,
      deactivateAccount: dto.deactivateAccount,
      reason: dto.reason?.trim() || null,
    });
    if (typeof resultado === 'string') throw httpDe(resultado);
    await this.sessoes.auditar({
      adminId: request.adminId,
      action: dto.decision === 'resolved' ? 'report.resolve' : 'report.dismiss',
      entityType: 'user_report',
      entityId: id,
      oldValues: null,
      newValues: { decision: dto.decision, removeContent: dto.removeContent, deactivateAccount: dto.deactivateAccount },
      ip: ipDe(request),
    });
    return resultado;
  }

  @Get('publications')
  publicacoes(@Query('q') q?: string, @Query('from') from?: string, @Query('to') to?: string, @Query('status') status?: string): Promise<PublicacaoDoPainel[]> {
    return this.moderacao.publicacoes({ q: q?.trim() || null, from: from || null, to: to || null, status: status || null });
  }

  @Post('publications/:id/remove')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removerPublicacao(@Req() request: RequestComAdmin, @Param('id') id: string): Promise<void> {
    const resultado = await this.moderacao.definirPublicacao(id, true);
    if (resultado !== 'ok') throw httpDe(resultado);
    await this.sessoes.auditar({ adminId: request.adminId, action: 'publication.remove', entityType: 'post', entityId: id, oldValues: null, newValues: { status: 'removed' }, ip: ipDe(request) });
  }

  @Post('publications/:id/restore')
  @HttpCode(HttpStatus.NO_CONTENT)
  async restaurarPublicacao(@Req() request: RequestComAdmin, @Param('id') id: string): Promise<void> {
    const resultado = await this.moderacao.definirPublicacao(id, false);
    if (resultado !== 'ok') throw httpDe(resultado);
    await this.sessoes.auditar({ adminId: request.adminId, action: 'publication.restore', entityType: 'post', entityId: id, oldValues: null, newValues: { status: 'published' }, ip: ipDe(request) });
  }

  @Post('comments/:id/remove')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removerComentario(@Req() request: RequestComAdmin, @Param('id') id: string): Promise<void> {
    const resultado = await this.moderacao.definirComentario(id, true);
    if (resultado !== 'ok') throw httpDe(resultado);
    await this.sessoes.auditar({ adminId: request.adminId, action: 'comment.remove', entityType: 'comment', entityId: id, oldValues: null, newValues: { removed: true }, ip: ipDe(request) });
  }

  @Post('comments/:id/restore')
  @HttpCode(HttpStatus.NO_CONTENT)
  async restaurarComentario(@Req() request: RequestComAdmin, @Param('id') id: string): Promise<void> {
    const resultado = await this.moderacao.definirComentario(id, false);
    if (resultado !== 'ok') throw httpDe(resultado);
    await this.sessoes.auditar({ adminId: request.adminId, action: 'comment.restore', entityType: 'comment', entityId: id, oldValues: null, newValues: { removed: false }, ip: ipDe(request) });
  }

  @Post('appeals')
  @HttpCode(HttpStatus.CREATED)
  async recurso(@Req() request: RequestComAdmin, @Body(corpo(RecursoDto)) dto: RecursoDto): Promise<{ id: string }> {
    const resultado = await this.moderacao.registrarRecurso(request.adminId, dto.moderationActionId, dto.requesterEmail, dto.reason?.trim() || null);
    if (typeof resultado === 'string') throw httpDe(resultado);
    await this.sessoes.auditar({ adminId: request.adminId, action: 'appeal.create', entityType: 'moderation_appeal', entityId: resultado.id, oldValues: null, newValues: { channel: 'email' }, ip: ipDe(request) });
    return resultado;
  }

  @Get('appeals/:id')
  async lerRecurso(@Param('id') id: string): Promise<{ id: string; channel: string; email: string; actionId: string }> {
    const resultado = await this.moderacao.lerRecurso(id);
    if (resultado === 'ausente') throw httpDe(resultado);
    return resultado;
  }

  @Post('content-reviews')
  @HttpCode(HttpStatus.CREATED)
  async abrir(@Req() request: RequestComAdmin, @Body(corpo(TarefaEditorialDto)) dto: TarefaEditorialDto): Promise<{ id: string }> {
    const resultado = await this.moderacao.abrirEditorial(request.adminId, dto.ingestionItemId);
    if (resultado === 'ausente') throw httpDe(resultado);
    await this.sessoes.auditar({ adminId: request.adminId, action: 'content_review.create', entityType: 'content_review_task', entityId: resultado.id, oldValues: null, newValues: { ingestionItemId: dto.ingestionItemId }, ip: ipDe(request) });
    return resultado;
  }

  @Get('content-reviews/:id')
  async tarefa(@Param('id') id: string): Promise<TarefaEditorial> {
    const resultado = await this.moderacao.lerTarefa(id);
    if (resultado === 'ausente') throw httpDe(resultado);
    return resultado;
  }

  @Post('content-reviews/:id/decisions')
  async decidir(@Req() request: RequestComAdmin, @Param('id') id: string, @Body(corpo(DecisaoEditorialDto)) dto: DecisaoEditorialDto): Promise<TarefaEditorial> {
    const resultado = await this.moderacao.decidir(request.adminId, id, dto.decision, dto.reason?.trim() || null);
    if (typeof resultado === 'string') throw httpDe(resultado);
    await this.sessoes.auditar({ adminId: request.adminId, action: 'content_review.decide', entityType: 'content_review_task', entityId: id, oldValues: null, newValues: { decision: dto.decision }, ip: ipDe(request) });
    return resultado;
  }

  @Post('content-publications/:id/removals')
  @HttpCode(HttpStatus.CREATED)
  async remover(@Req() request: RequestComAdmin, @Param('id') id: string, @Body(corpo(RemocaoEditorialDto)) dto: RemocaoEditorialDto): Promise<{ id: string }> {
    const resultado = await this.moderacao.pedirRemocao(id, dto.requesterEmail ?? null, dto.reason?.trim() || null);
    if (resultado === 'ausente') throw httpDe(resultado);
    await this.sessoes.auditar({ adminId: request.adminId, action: 'content_publication.remove', entityType: 'content_publication', entityId: id, oldValues: null, newValues: { removed: true }, ip: ipDe(request) });
    return resultado;
  }
}

function httpDe(falha: FalhaModeracao): HttpException {
  if (falha === 'fechada') return new HttpException({ message: 'Esta denúncia já foi julgada.' }, HttpStatus.CONFLICT);
  return new HttpException({ message: 'Registro não encontrado.' }, HttpStatus.NOT_FOUND);
}

function corpo<T>(tipo: new () => T): ValidationPipe {
  return new ValidationPipe({ expectedType: tipo, whitelist: true, forbidNonWhitelisted: true, transform: true });
}

function ipDe(request: RequestComAdmin): string | null {
  const direto = (request.ip || request.socket?.remoteAddress || '').replace(/^::ffff:/, '').slice(0, 45);
  return direto || null;
}
