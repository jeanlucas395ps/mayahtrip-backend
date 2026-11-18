import { Body, Controller, Get, HttpCode, HttpException, HttpStatus, Inject, Param, Patch, Post, UseGuards, ValidationPipe } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import * as argon2 from 'argon2';
import { JwtService } from '@nestjs/jwt';
import { DataSource } from 'typeorm';
import { PlanosUseCase, SalvarPlano } from '../../../application/planos.use-case';
import { EntrarAdminDto, SalvarPlanoDto } from '../dto/plano.dto';
import { AdminGuard } from '../guards/admin.guard';

@ApiTags('admin')
@Controller('admin')
export class AdminController {
  constructor(
    @Inject(PlanosUseCase) private readonly planos: PlanosUseCase,
    @Inject(JwtService) private readonly jwt: JwtService,
    @Inject(DataSource) private readonly dados: DataSource,
  ) {}

  @Post('sign-in')
  @HttpCode(HttpStatus.OK)
  async entrar(@Body(corpo(EntrarAdminDto)) dto: EntrarAdminDto): Promise<{ accessToken: string }> {
    const linhas = await this.dados.query<{ id: string; password_hash: string }[]>(
      `SELECT id, password_hash FROM admin.admin_users
       WHERE lower(email) = lower($1) AND is_active AND deleted_at IS NULL`,
      [dto.email],
    );
    const admin = linhas[0];
    const senhaConfere = admin ? await argon2.verify(admin.password_hash, dto.senha).catch(() => false) : false;
    if (!admin || !senhaConfere) {
      throw new HttpException({ message: 'Não foi possível entrar.' }, HttpStatus.UNAUTHORIZED);
    }
    await this.dados.query(`UPDATE admin.admin_users SET last_login_at = now() WHERE id = $1`, [admin.id]);
    const accessToken = await this.jwt.signAsync({ sub: admin.id, tipo: 'admin' });
    return { accessToken };
  }

  @Get('plans')
  @UseGuards(AdminGuard)
  listar() {
    return this.planos.listar();
  }

  @Post('plans')
  @UseGuards(AdminGuard)
  async criar(@Body(corpo(SalvarPlanoDto)) dto: SalvarPlanoDto) {
    const resultado = await this.planos.criar(paraEntrada(dto));
    if (resultado.tipo === 'codigo_repetido') {
      throw new HttpException({ message: 'Já existe um plano com esse código.' }, HttpStatus.CONFLICT);
    }
    return resultado.plano;
  }

  @Patch('plans/:id')
  @UseGuards(AdminGuard)
  async editar(@Param('id') id: string, @Body(corpo(SalvarPlanoDto)) dto: SalvarPlanoDto) {
    const resultado = await this.planos.editar(id, paraEntrada(dto));
    if (resultado.tipo === 'nao_encontrado') {
      throw new HttpException({ message: 'Plano não encontrado.' }, HttpStatus.NOT_FOUND);
    }
    if (resultado.tipo === 'recusado') {
      throw new HttpException({ message: mensagemRecusa(resultado.motivo) }, HttpStatus.CONFLICT);
    }
    return resultado.plano;
  }

  @Post('plans/:id/activate')
  @UseGuards(AdminGuard)
  @HttpCode(HttpStatus.OK)
  async ativar(@Param('id') id: string): Promise<{ mensagem: string }> {
    const resultado = await this.planos.ativar(id);
    if (resultado.tipo === 'nao_encontrado') {
      throw new HttpException({ message: 'Plano não encontrado.' }, HttpStatus.NOT_FOUND);
    }
    if (resultado.tipo === 'recusado') {
      throw new HttpException({ message: mensagemRecusa(resultado.motivo) }, HttpStatus.CONFLICT);
    }
    return { mensagem: 'Plano ativado.' };
  }

  @Post('plans/:id/deactivate')
  @UseGuards(AdminGuard)
  @HttpCode(HttpStatus.OK)
  async desativar(@Param('id') id: string): Promise<{ mensagem: string }> {
    const resultado = await this.planos.desativar(id);
    if (resultado.tipo === 'nao_encontrado') {
      throw new HttpException({ message: 'Plano não encontrado.' }, HttpStatus.NOT_FOUND);
    }
    if (resultado.tipo === 'recusado') {
      throw new HttpException({ message: mensagemRecusa(resultado.motivo) }, HttpStatus.CONFLICT);
    }
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
