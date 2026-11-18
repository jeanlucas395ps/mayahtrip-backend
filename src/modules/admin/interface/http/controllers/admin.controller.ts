import { Body, Controller, Get, HttpCode, HttpException, HttpStatus, Inject, Param, Patch, Post, Req, UseGuards, ValidationPipe } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PlanoGravado, PlanosUseCase, SalvarPlano } from '../../../application/planos.use-case';
import { SessaoAdminUseCase } from '../../../application/sessao-admin.use-case';
import { EntrarAdminDto, SalvarPlanoDto } from '../dto/plano.dto';
import { AdminGuard, RequestComAdmin, tokenDe } from '../guards/admin.guard';

@ApiTags('admin')
@Controller('admin')
export class AdminController {
  constructor(
    @Inject(PlanosUseCase) private readonly planos: PlanosUseCase,
    @Inject(SessaoAdminUseCase) private readonly sessoes: SessaoAdminUseCase,
  ) {}

  @Post('sign-in')
  @HttpCode(HttpStatus.OK)
  async entrar(@Req() request: RequestComAdmin, @Body(corpo(EntrarAdminDto)) dto: EntrarAdminDto): Promise<{ accessToken: string }> {
    const accessToken = await this.sessoes.entrar(dto.email, dto.senha, ipDe(request));
    if (!accessToken) throw new HttpException({ message: 'Não foi possível entrar.' }, HttpStatus.UNAUTHORIZED);
    return { accessToken };
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(AdminGuard)
  async sair(@Req() request: RequestComAdmin): Promise<void> {
    const saiu = await this.sessoes.sair(tokenDe(request), ipDe(request), request.adminId);
    if (!saiu) throw new HttpException({ message: 'Não foi possível entrar.' }, HttpStatus.UNAUTHORIZED);
  }

  @Get('plans')
  @UseGuards(AdminGuard)
  listar() {
    return this.planos.listar();
  }

  @Post('plans')
  @UseGuards(AdminGuard)
  async criar(@Req() request: RequestComAdmin, @Body(corpo(SalvarPlanoDto)) dto: SalvarPlanoDto) {
    const resultado = await this.planos.criar(paraEntrada(dto));
    if (resultado.tipo === 'codigo_repetido') {
      throw new HttpException({ message: 'Já existe um plano com esse código.' }, HttpStatus.CONFLICT);
    }
    await this.sessoes.auditar({
      adminId: request.adminId,
      action: 'plan.create',
      entityType: 'plan',
      entityId: resultado.plano.id,
      oldValues: null,
      newValues: resumo(resultado.plano),
      ip: ipDe(request),
    });
    return resultado.plano;
  }

  @Patch('plans/:id')
  @UseGuards(AdminGuard)
  async editar(@Req() request: RequestComAdmin, @Param('id') id: string, @Body(corpo(SalvarPlanoDto)) dto: SalvarPlanoDto) {
    const resultado = await this.planos.editar(id, paraEntrada(dto));
    if (resultado.tipo === 'nao_encontrado') {
      throw new HttpException({ message: 'Plano não encontrado.' }, HttpStatus.NOT_FOUND);
    }
    if (resultado.tipo === 'recusado') {
      throw new HttpException({ message: mensagemRecusa(resultado.motivo) }, HttpStatus.CONFLICT);
    }
    await this.sessoes.auditar({
      adminId: request.adminId,
      action: 'plan.update',
      entityType: 'plan',
      entityId: resultado.plano.id,
      oldValues: resumo(resultado.anterior),
      newValues: resumo(resultado.plano),
      ip: ipDe(request),
    });
    return resultado.plano;
  }

  @Post('plans/:id/activate')
  @UseGuards(AdminGuard)
  @HttpCode(HttpStatus.OK)
  async ativar(@Req() request: RequestComAdmin, @Param('id') id: string): Promise<{ mensagem: string }> {
    const resultado = await this.planos.ativar(id);
    if (resultado.tipo === 'nao_encontrado') {
      throw new HttpException({ message: 'Plano não encontrado.' }, HttpStatus.NOT_FOUND);
    }
    if (resultado.tipo === 'recusado') {
      throw new HttpException({ message: mensagemRecusa(resultado.motivo) }, HttpStatus.CONFLICT);
    }
    await this.sessoes.auditar({
      adminId: request.adminId,
      action: 'plan.activate',
      entityType: 'plan',
      entityId: id,
      oldValues: { isActive: resultado.isActiveAntes },
      newValues: { isActive: true },
      ip: ipDe(request),
    });
    return { mensagem: 'Plano ativado.' };
  }

  @Post('plans/:id/deactivate')
  @UseGuards(AdminGuard)
  @HttpCode(HttpStatus.OK)
  async desativar(@Req() request: RequestComAdmin, @Param('id') id: string): Promise<{ mensagem: string }> {
    const resultado = await this.planos.desativar(id);
    if (resultado.tipo === 'nao_encontrado') {
      throw new HttpException({ message: 'Plano não encontrado.' }, HttpStatus.NOT_FOUND);
    }
    if (resultado.tipo === 'recusado') {
      throw new HttpException({ message: mensagemRecusa(resultado.motivo) }, HttpStatus.CONFLICT);
    }
    await this.sessoes.auditar({
      adminId: request.adminId,
      action: 'plan.deactivate',
      entityType: 'plan',
      entityId: id,
      oldValues: { isActive: resultado.isActiveAntes },
      newValues: { isActive: false },
      ip: ipDe(request),
    });
    return { mensagem: 'Plano desativado. Quem já assinou permanece até o fim do ciclo.' };
  }
}

function paraEntrada(dto: SalvarPlanoDto): SalvarPlano {
  return {
    code: dto.code.trim().toLowerCase(),
    name: dto.name.trim(),
    description: dto.description?.trim() || null,
    isFree: dto.isFree,
    currency: dto.currency?.trim().toUpperCase() || null,
    billingPeriod: dto.billingPeriod ?? null,
    amount: dto.amount ?? null,
    durationDays: dto.durationDays ?? null,
    features: dto.features.map((feature) => ({ key: feature.key.trim(), value: feature.value })),
  };
}

function corpo<T>(tipo: new () => T): ValidationPipe {
  return new ValidationPipe({
    expectedType: tipo,
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });
}

function mensagemRecusa(motivo: 'free_imutavel' | 'sem_preco'): string {
  if (motivo === 'free_imutavel') return 'O plano Free não pode ser desativado nem deixar de ser gratuito.';
  return 'Plano sem preço não pode ser ativado.';
}

function resumo(plano: PlanoGravado): Record<string, unknown> {
  return {
    code: plano.code,
    name: plano.name,
    isFree: plano.isFree,
    isActive: plano.isActive,
    preco: plano.preco
      ? { currency: plano.preco.currency, amount: plano.preco.amount, billingPeriod: plano.preco.billingPeriod }
      : null,
  };
}

function ipDe(request: RequestComAdmin): string | null {
  const direto = (request.ip || request.socket?.remoteAddress || '').replace(/^::ffff:/, '').slice(0, 45);
  return direto || null;
}
