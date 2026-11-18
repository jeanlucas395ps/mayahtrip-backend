import { Body, Controller, Delete, Get, HttpCode, HttpException, HttpStatus, Inject, Param, Patch, Post, Query, Req, UseGuards, ValidationPipe } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AdministradoresUseCase, AdministradorAusenteError, AdministradorUnicoError, EmailDeAdministradorEmUsoError } from '../../../application/administradores.use-case';
import { FiltroInvalidoError, UsuarioAusenteError, UsuarioExcluidoError, UsuariosUseCase } from '../../../application/usuarios.use-case';
import { AdministradorGravado } from '../../../domain/ports/administradores.port';
import { UsuarioDoApp } from '../../../domain/ports/usuarios.port';
import { PlanoGravado, PlanosUseCase, SalvarPlano } from '../../../application/planos.use-case';
import { SessaoAdminUseCase } from '../../../application/sessao-admin.use-case';
import { CriarAdministradorDto, EditarAdministradorDto, EntrarAdminDto, SalvarPlanoDto } from '../dto/plano.dto';
import { AdminGuard, RequestComAdmin, tokenDe } from '../guards/admin.guard';

@ApiTags('admin')
@Controller('admin')
export class AdminController {
  constructor(
    @Inject(PlanosUseCase) private readonly planos: PlanosUseCase,
    @Inject(SessaoAdminUseCase) private readonly sessoes: SessaoAdminUseCase,
    @Inject(AdministradoresUseCase) private readonly administradores: AdministradoresUseCase,
    @Inject(UsuariosUseCase) private readonly usuarios: UsuariosUseCase,
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

  @Get('administrators')
  @UseGuards(AdminGuard)
  listarAdministradores(): Promise<AdministradorGravado[]> {
    return this.administradores.listar();
  }

  @Post('administrators')
  @UseGuards(AdminGuard)
  async criarAdministrador(@Req() request: RequestComAdmin, @Body(corpo(CriarAdministradorDto)) dto: CriarAdministradorDto) {
    const administrador = await executarAdmin(() => this.administradores.criar(dto));
    await this.sessoes.auditar({
      adminId: request.adminId,
      action: 'admin.create',
      entityType: 'admin_user',
      entityId: administrador.id,
      oldValues: null,
      newValues: ficha(administrador),
      ip: ipDe(request),
    });
    return administrador;
  }

  @Patch('administrators/:id')
  @UseGuards(AdminGuard)
  async editarAdministrador(
    @Req() request: RequestComAdmin,
    @Param('id') id: string,
    @Body(corpo(EditarAdministradorDto)) dto: EditarAdministradorDto,
  ) {
    const resultado = await executarAdmin(() => this.administradores.editar(id, dto));
    await this.sessoes.auditar({
      adminId: request.adminId,
      action: 'admin.update',
      entityType: 'admin_user',
      entityId: resultado.administrador.id,
      oldValues: ficha(resultado.anterior),
      newValues: { ...ficha(resultado.administrador), senhaTrocada: resultado.senhaTrocada },
      ip: ipDe(request),
    });
    return resultado.administrador;
  }

  @Post('administrators/:id/activate')
  @UseGuards(AdminGuard)
  @HttpCode(HttpStatus.OK)
  async ativarAdministrador(@Req() request: RequestComAdmin, @Param('id') id: string): Promise<AdministradorGravado> {
    const resultado = await executarAdmin(() => this.administradores.definirAtivo(id, true));
    await this.sessoes.auditar({
      adminId: request.adminId,
      action: 'admin.activate',
      entityType: 'admin_user',
      entityId: id,
      oldValues: { isActive: resultado.anterior },
      newValues: { isActive: true },
      ip: ipDe(request),
    });
    return resultado.administrador;
  }

  @Post('administrators/:id/deactivate')
  @UseGuards(AdminGuard)
  @HttpCode(HttpStatus.OK)
  async desativarAdministrador(@Req() request: RequestComAdmin, @Param('id') id: string): Promise<AdministradorGravado> {
    const resultado = await executarAdmin(() => this.administradores.definirAtivo(id, false));
    await this.sessoes.auditar({
      adminId: request.adminId,
      action: 'admin.deactivate',
      entityType: 'admin_user',
      entityId: id,
      oldValues: { isActive: resultado.anterior },
      newValues: { isActive: false },
      ip: ipDe(request),
    });
    return resultado.administrador;
  }

  @Delete('administrators/:id')
  @UseGuards(AdminGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async excluirAdministrador(@Req() request: RequestComAdmin, @Param('id') id: string): Promise<void> {
    const administrador = await executarAdmin(() => this.administradores.excluir(id, request.adminId));
    await this.sessoes.auditar({
      adminId: request.adminId,
      action: 'admin.delete',
      entityType: 'admin_user',
      entityId: id,
      oldValues: ficha(administrador),
      newValues: { deleted: true },
      ip: ipDe(request),
    });
  }

  @Get('users')
  @UseGuards(AdminGuard)
  listarUsuarios(@Query() query: Record<string, string | undefined>): Promise<UsuarioDoApp[]> {
    return executarUsuario(() => this.usuarios.listar(query));
  }

  @Get('users/:id')
  @UseGuards(AdminGuard)
  abrirUsuario(@Param('id') id: string): Promise<UsuarioDoApp> {
    return executarUsuario(() => this.usuarios.porId(id));
  }

  @Post('users/:id/activate')
  @UseGuards(AdminGuard)
  @HttpCode(HttpStatus.OK)
  async ativarUsuario(@Req() request: RequestComAdmin, @Param('id') id: string): Promise<UsuarioDoApp> {
    const usuario = await executarUsuario(() => this.usuarios.definirAtivo(id, true));
    await this.auditarUsuario(request, 'user.activate', id, { status: usuario.status, deleted: usuario.deleted });
    return usuario;
  }

  @Post('users/:id/deactivate')
  @UseGuards(AdminGuard)
  @HttpCode(HttpStatus.OK)
  async desativarUsuario(@Req() request: RequestComAdmin, @Param('id') id: string): Promise<UsuarioDoApp> {
    const usuario = await executarUsuario(() => this.usuarios.definirAtivo(id, false));
    await this.auditarUsuario(request, 'user.deactivate', id, { status: usuario.status, deleted: usuario.deleted });
    return usuario;
  }

  @Delete('users/:id')
  @UseGuards(AdminGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async excluirUsuario(@Req() request: RequestComAdmin, @Param('id') id: string): Promise<void> {
    const usuario = await executarUsuario(() => this.usuarios.excluir(id));
    await this.auditarUsuario(request, 'user.delete', id, { email: usuario.email, deleted: true });
  }

  @Post('users/:id/restore')
  @UseGuards(AdminGuard)
  @HttpCode(HttpStatus.OK)
  async restaurarUsuario(@Req() request: RequestComAdmin, @Param('id') id: string): Promise<UsuarioDoApp> {
    const usuario = await executarUsuario(() => this.usuarios.restaurar(id));
    await this.auditarUsuario(request, 'user.restore', id, { email: usuario.email, deleted: false, status: usuario.status });
    return usuario;
  }

  private auditarUsuario(request: RequestComAdmin, action: string, id: string, novo: Record<string, unknown>): Promise<void> {
    return this.sessoes.auditar({
      adminId: request.adminId,
      action,
      entityType: 'user',
      entityId: id,
      oldValues: null,
      newValues: novo,
      ip: ipDe(request),
    });
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

function ficha(administrador: AdministradorGravado): Record<string, unknown> {
  return { name: administrador.name, email: administrador.email, isActive: administrador.isActive };
}

async function executarAdmin<T>(acao: () => Promise<T>): Promise<T> {
  try {
    return await acao();
  } catch (erro) {
    if (erro instanceof EmailDeAdministradorEmUsoError) {
      throw new HttpException({ message: 'Já existe um administrador com esse e-mail.' }, HttpStatus.CONFLICT);
    }
    if (erro instanceof AdministradorUnicoError) {
      throw new HttpException({ message: 'Você é o único administrador ativo.' }, HttpStatus.CONFLICT);
    }
    if (erro instanceof AdministradorAusenteError) {
      throw new HttpException({ message: 'Administrador não encontrado.' }, HttpStatus.NOT_FOUND);
    }
    throw erro;
  }
}

async function executarUsuario<T>(acao: () => Promise<T>): Promise<T> {
  try {
    return await acao();
  } catch (erro) {
    if (erro instanceof UsuarioExcluidoError) {
      throw new HttpException({ message: 'Restaure a conta antes de ativar ou desativar.' }, HttpStatus.CONFLICT);
    }
    if (erro instanceof UsuarioAusenteError) {
      throw new HttpException({ message: 'Usuário não encontrado.' }, HttpStatus.NOT_FOUND);
    }
    if (erro instanceof FiltroInvalidoError) {
      throw new HttpException({ message: 'Filtro inválido.' }, HttpStatus.BAD_REQUEST);
    }
    throw erro;
  }
}
