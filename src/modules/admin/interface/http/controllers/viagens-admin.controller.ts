import { Body, Controller, Delete, Get, HttpCode, HttpException, HttpStatus, Inject, Param, Patch, Post, Query, Req, UseGuards, ValidationPipe } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ViagensAdminUseCase } from '../../../application/viagens-admin.use-case';
import { FiltroDeViagem } from '../../../domain/ports/viagens-admin.port';
import { SessaoAdminUseCase } from '../../../application/sessao-admin.use-case';
import { VisibilidadeAdminDto } from '../dto/viagem-admin.dto';
import { AdminGuard, RequestComAdmin } from '../guards/admin.guard';

@ApiTags('admin')
@Controller('admin/trips')
@UseGuards(AdminGuard)
export class ViagensAdminController {
  constructor(
    @Inject(ViagensAdminUseCase) private readonly viagens: ViagensAdminUseCase,
    @Inject(SessaoAdminUseCase) private readonly sessoes: SessaoAdminUseCase,
  ) {}

  @Get()
  async listar(@Query() filtro: FiltroDeViagem) {
    const lista = await this.viagens.listar(filtro);
    if (lista === 'filtro') throw new HttpException({ message: 'Filtro inválido.' }, HttpStatus.BAD_REQUEST);
    return lista;
  }

  @Get(':id')
  async ficha(@Param('id') id: string) {
    const viagem = await this.viagens.ficha(id);
    if (!viagem) throw new HttpException({ message: 'Viagem não encontrada.' }, HttpStatus.NOT_FOUND);
    return viagem;
  }

  @Post(':id/activate')
  @HttpCode(HttpStatus.OK)
  async ativar(@Req() request: RequestComAdmin, @Param('id') id: string): Promise<{ mensagem: string }> {
    await this.aplicar(request, id, 'trip.activate', { isActive: true }, () => this.viagens.ativar(id, true));
    return { mensagem: 'Viagem ativada.' };
  }

  @Post(':id/deactivate')
  @HttpCode(HttpStatus.OK)
  async desativar(@Req() request: RequestComAdmin, @Param('id') id: string): Promise<{ mensagem: string }> {
    await this.aplicar(request, id, 'trip.deactivate', { isActive: false }, () => this.viagens.ativar(id, false));
    return { mensagem: 'Viagem desativada.' };
  }

  @Patch(':id/visibility')
  async publicar(@Req() request: RequestComAdmin, @Param('id') id: string, @Body(corpo(VisibilidadeAdminDto)) dto: VisibilidadeAdminDto) {
    await this.aplicar(request, id, 'trip.visibility', { visibility: dto.visibility }, () => this.viagens.visibilidade(id, dto.visibility));
    return this.ficha(id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async excluir(@Req() request: RequestComAdmin, @Param('id') id: string): Promise<{ mensagem: string }> {
    await this.aplicar(request, id, 'trip.delete', { deleted: true }, () => this.viagens.excluir(id));
    return { mensagem: 'Viagem excluída.' };
  }

  private async aplicar(
    request: RequestComAdmin,
    id: string,
    action: string,
    newValues: Record<string, unknown>,
    acao: () => Promise<'ok' | 'ausente'>,
  ): Promise<void> {
    const resultado = await acao();
    if (resultado === 'ausente') throw new HttpException({ message: 'Viagem não encontrada.' }, HttpStatus.NOT_FOUND);
    await this.sessoes.auditar({ adminId: request.adminId, action, entityType: 'trip', entityId: id, oldValues: null, newValues, ip: ipDe(request) });
  }
}

function corpo<T>(tipo: new () => T): ValidationPipe {
  return new ValidationPipe({ expectedType: tipo, whitelist: true, forbidNonWhitelisted: true, transform: true });
}

function ipDe(request: RequestComAdmin): string | null {
  const direto = (request.ip || request.socket?.remoteAddress || '').replace(/^::ffff:/, '').slice(0, 45);
  return direto || null;
}
