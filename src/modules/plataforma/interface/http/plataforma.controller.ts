import { Body, Controller, Get, HttpCode, HttpException, HttpStatus, Inject, Param, Patch, Post, Query, Req, UseGuards, ValidationPipe, Headers } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SessaoAdminUseCase } from '../../../admin/application/sessao-admin.use-case';
import { AdminGuard, RequestComAdmin } from '../../../admin/interface/http/guards/admin.guard';
import { FalhaPlataforma, PlataformaUseCase } from '../../application/plataforma.use-case';
import { AjusteDto, AtivarFonteDto, BandeiraDto, ColetaDto, EventoProcessadoDto, LicencaDto, LimparFilaDto, LugarItemDto, MidiaDto, PoliticaFonteDto, RemocaoItemDto, StatusItemDto } from './dto/plataforma.dto';

@ApiTags('admin')
@Controller('admin')
@UseGuards(AdminGuard)
export class PlataformaController {
  constructor(
    @Inject(PlataformaUseCase) private readonly plataforma: PlataformaUseCase,
    @Inject(SessaoAdminUseCase) private readonly sessoes: SessaoAdminUseCase,
  ) {}

  @Get('ingestion/sources')
  fontes() {
    return this.plataforma.fontes();
  }

  @Post('ingestion/sources/:id/active')
  async ativar(@Req() request: RequestComAdmin, @Param('id') id: string, @Body(corpo(AtivarFonteDto)) dto: AtivarFonteDto) {
    const resultado = await this.plataforma.ativarFonte(id, request.adminId, dto.isActive);
    if (typeof resultado === 'string') throw httpDe(resultado);
    await this.auditar(request, 'content_source.active', id, { isActive: dto.isActive });
    return resultado;
  }

  @Patch('ingestion/sources/:id/policy')
  async politica(@Req() request: RequestComAdmin, @Param('id') id: string, @Body(corpo(PoliticaFonteDto)) dto: PoliticaFonteDto) {
    const resultado = await this.plataforma.atualizarPolitica(id, request.adminId, dto.rateLimitPerMinute ?? null, dto.termsUrl ?? null, dto.notes ?? null);
    if (typeof resultado === 'string') throw httpDe(resultado);
    await this.auditar(request, 'content_source.policy', id, { rateLimitPerMinute: dto.rateLimitPerMinute ?? null });
    return resultado;
  }

  @Post('ingestion/jobs')
  @HttpCode(HttpStatus.CREATED)
  async coletar(@Req() request: RequestComAdmin, @Body(corpo(ColetaDto)) dto: ColetaDto, @Headers('idempotency-key') chave?: string) {
    const normalizada = normalizarChave(chave);
    if (normalizada === 'invalida') throw new HttpException({ message: 'A chave de idempotência é inválida.' }, HttpStatus.BAD_REQUEST);
    const resultado = await this.plataforma.coletar(dto, normalizada);
    if (typeof resultado === 'string') throw httpDe(resultado);
    if (!resultado.reused) await this.auditar(request, 'ingestion_job.create', resultado.jobId, { itemId: resultado.itemId });
    return resultado;
  }

  @Post('ingestion/jobs/:id/run')
  async executar(@Param('id') id: string) {
    return this.transitar(id, 'run');
  }

  @Post('ingestion/jobs/:id/pause')
  async pausar(@Param('id') id: string) {
    return this.transitar(id, 'pause');
  }

  @Post('ingestion/jobs/:id/cancel')
  async cancelar(@Param('id') id: string) {
    return this.transitar(id, 'cancel');
  }

  @Post('ingestion/jobs/:id/finish')
  async concluir(@Param('id') id: string) {
    return this.transitar(id, 'finish');
  }

  @Get('ingestion/items')
  itens() {
    return this.plataforma.itens();
  }

  @Patch('ingestion/items/:id/status')
  async status(@Param('id') id: string, @Body(corpo(StatusItemDto)) dto: StatusItemDto) {
    const resultado = await this.plataforma.avancarItem(id, dto.status, dto);
    if (typeof resultado === 'string') throw httpDe(resultado);
    return resultado;
  }

  @Post('ingestion/items/:id/media')
  @HttpCode(HttpStatus.CREATED)
  async midia(@Param('id') id: string, @Body(corpo(MidiaDto)) dto: MidiaDto) {
    const resultado = await this.plataforma.gravarMidia(id, dto.mediaType, dto.originalUrl ?? null, dto.storageKey ?? null);
    if (typeof resultado === 'string') throw httpDe(resultado);
    return resultado;
  }

  @Post('ingestion/items/:id/place')
  async lugar(@Req() request: RequestComAdmin, @Param('id') id: string, @Body(corpo(LugarItemDto)) dto: LugarItemDto) {
    const resultado = await this.plataforma.associarLugar(id, dto.placeId);
    if (typeof resultado === 'string') throw httpDe(resultado);
    await this.auditar(request, 'ingestion_item.place', id, { placeId: dto.placeId });
    return resultado;
  }

  @Post('ingestion/items/:id/license')
  @HttpCode(HttpStatus.CREATED)
  async licenca(@Param('id') id: string, @Body(corpo(LicencaDto)) dto: LicencaDto) {
    const resultado = await this.plataforma.reavaliarLicenca(id, dto.licenseName, dto.licenseUrl ?? null, dto.attribution ?? null);
    if (typeof resultado === 'string') throw httpDe(resultado);
    return resultado;
  }

  @Post('ingestion/items/:id/removal-requests')
  @HttpCode(HttpStatus.CREATED)
  async remocao(@Param('id') id: string, @Body(corpo(RemocaoItemDto)) dto: RemocaoItemDto) {
    const resultado = await this.plataforma.pedirRemocao(id, dto.requesterEmail ?? null, dto.reason ?? null);
    if (typeof resultado === 'string') throw httpDe(resultado);
    return resultado;
  }

  @Get('platform/settings')
  ajustes() {
    return this.plataforma.ajustes();
  }

  @Patch('platform/settings')
  async salvarAjuste(@Req() request: RequestComAdmin, @Body(corpo(AjusteDto)) dto: AjusteDto) {
    const resultado = await this.plataforma.salvarAjuste(request.adminId, dto.key, dto.value);
    if (typeof resultado === 'string') throw httpDe(resultado);
    await this.auditar(request, 'system_setting.update', null, { key: dto.key, value: dto.value });
    return resultado;
  }

  @Get('platform/flags')
  bandeiras() {
    return this.plataforma.bandeiras();
  }

  @Post('platform/flags')
  @HttpCode(HttpStatus.CREATED)
  async criarBandeira(@Req() request: RequestComAdmin, @Body(corpo(BandeiraDto)) dto: BandeiraDto) {
    const resultado = await this.plataforma.criarBandeira(request.adminId, dto.flagKey.trim(), dto.description?.trim() || null);
    if (resultado === 'chave') throw httpDe(resultado);
    await this.auditar(request, 'feature_flag.create', resultado.id, { flagKey: resultado.flagKey });
    return resultado;
  }

  @Post('platform/flags/:id/toggle')
  async alternar(@Req() request: RequestComAdmin, @Param('id') id: string) {
    const resultado = await this.plataforma.alternarBandeira(request.adminId, id);
    if (resultado === 'ausente') throw httpDe(resultado);
    await this.auditar(request, 'feature_flag.toggle', id, { isEnabled: resultado.isEnabled });
    return resultado;
  }

  @Post('platform/events/:id/processed')
  async processado(@Param('id') id: string, @Body(corpo(EventoProcessadoDto)) dto: EventoProcessadoDto) {
    const resultado = await this.plataforma.confirmarEvento(dto.consumer.trim(), id);
    if (typeof resultado === 'string') throw httpDe(resultado);
    return resultado;
  }

  @Post('platform/subscription-expiry')
  async expirar(@Req() request: RequestComAdmin) {
    const resultado = await this.plataforma.expirar();
    await this.auditar(request, 'subscription.expiry', resultado.runId, { expired: resultado.expired });
    return resultado;
  }

  @Get('platform/subscription-expiry')
  corridas() {
    return this.plataforma.corridas();
  }

  @Get('platform/queues')
  filas() {
    return this.plataforma.filas();
  }

  @Post('platform/queues/:queue/clear')
  async limpar(@Param('queue') queue: string, @Body(corpo(LimparFilaDto)) dto: LimparFilaDto) {
    const resultado = await this.plataforma.limparFila(queue, dto.scope);
    if (typeof resultado === 'string') throw httpDe(resultado);
    return resultado;
  }

  @Post('platform/queues/:queue/requeue-failed')
  async recolocarFila(@Param('queue') queue: string) {
    const resultado = await this.plataforma.recolocar(queue, null);
    if (typeof resultado === 'string') throw httpDe(resultado);
    return resultado;
  }

  @Post('platform/queues/:queue/jobs/:id/requeue')
  async recolocar(@Param('queue') queue: string, @Param('id') id: string) {
    const resultado = await this.plataforma.recolocar(queue, id);
    if (typeof resultado === 'string') throw httpDe(resultado);
    return resultado;
  }

  @Post('platform/queues/:queue/empty-failed')
  async esvaziar(@Param('queue') queue: string) {
    const resultado = await this.plataforma.apagarFalhos(queue, null);
    if (typeof resultado === 'string') throw httpDe(resultado);
    return resultado;
  }

  @Post('platform/queues/:queue/jobs/:id/delete')
  async apagar(@Param('queue') queue: string, @Param('id') id: string) {
    const resultado = await this.plataforma.apagarFalhos(queue, id);
    if (typeof resultado === 'string') throw httpDe(resultado);
    return resultado;
  }

  @Post('platform/queues/itinerary/jobs/:id/fail')
  async falhar(@Param('id') id: string) {
    const resultado = await this.plataforma.falharGeracao(id);
    if (typeof resultado === 'string') throw httpDe(resultado);
    return resultado;
  }

  @Get('platform/dashboard')
  painel(@Query('from') from?: string, @Query('to') to?: string, @Query('year') year?: string) {
    const periodo = periodoDe(from, to, year);
    if (periodo === 'faixa') throw httpDe('faixa');
    return this.plataforma.painel(periodo.from, periodo.to, periodo.year);
  }

  @Get('platform/finance')
  financeiro(@Query('year') year?: string) {
    const ano = Number(year);
    if (!Number.isInteger(ano) || ano < 2000 || ano > 2100) throw httpDe('faixa');
    return this.plataforma.financeiro(ano);
  }

  @Get('platform/health')
  saude() {
    return this.plataforma.saude();
  }

  private transitar(id: string, acao: 'run' | 'pause' | 'cancel' | 'finish') {
    return this.plataforma.transitarJob(id, acao).then((resultado) => {
      if (typeof resultado === 'string') throw httpDe(resultado);
      return resultado;
    });
  }

  private auditar(request: RequestComAdmin, action: string, id: string | null, novo: Record<string, unknown>): Promise<void> {
    return this.sessoes.auditar({ adminId: request.adminId, action, entityType: action.split('.')[0], entityId: id, oldValues: null, newValues: novo, ip: ipDe(request) });
  }
}

function periodoDe(from?: string, to?: string, year?: string): { from: string; to: string; year: number } | 'faixa' {
  if (!from || !to || !/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || to < from) return 'faixa';
  const ano = Number(year);
  if (!Number.isInteger(ano) || ano < 2000 || ano > 2100) return 'faixa';
  return { from, to, year: ano };
}

function normalizarChave(chave?: string): string | null | 'invalida' {
  if (!chave || chave.trim() === '') return null;
  const valor = chave.trim();
  if (!/^[A-Za-z0-9._:-]{8,255}$/.test(chave.trim())) return 'invalida';
  return valor;
}

function httpDe(falha: FalhaPlataforma): HttpException {
  if (falha === 'ausente' || falha === 'fonte') return new HttpException({ message: 'Registro não encontrado.' }, HttpStatus.NOT_FOUND);
  if (falha === 'inativa') return new HttpException({ message: 'A fonte ainda está inativa.' }, HttpStatus.CONFLICT);
  if (falha === 'bloqueado') return new HttpException({ message: 'Guardar o arquivo continua bloqueado.' }, HttpStatus.CONFLICT);
  if (falha === 'estado') return new HttpException({ message: 'O estado não permite esta ação.' }, HttpStatus.CONFLICT);
  if (falha === 'chave') return new HttpException({ message: 'A chave informada não pode ser usada.' }, HttpStatus.CONFLICT);
  return new HttpException({ message: 'Valor fora da faixa.' }, HttpStatus.BAD_REQUEST);
}

function corpo<T>(tipo: new () => T): ValidationPipe {
  return new ValidationPipe({ expectedType: tipo, whitelist: true, forbidNonWhitelisted: true, transform: true });
}

function ipDe(request: RequestComAdmin): string | null {
  const direto = (request.ip || request.socket?.remoteAddress || '').replace(/^::ffff:/, '').slice(0, 45);
  return direto || null;
}
