import { Body, Controller, Delete, Get, HttpCode, HttpException, HttpStatus, Inject, Param, Patch, Post, Query, Req, UseGuards, ValidationPipe } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength } from 'class-validator';
import { SessaoAdminUseCase } from '../../../admin/application/sessao-admin.use-case';
import { AdminGuard, RequestComAdmin } from '../../../admin/interface/http/guards/admin.guard';
import { AssinaturaUseCase, FalhaAssinatura } from '../../application/assinatura.use-case';

class CupomAdminDto {
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  code!: string;

  @IsInt()
  @Min(1)
  @Max(3650)
  freeDays!: number;

  @IsOptional()
  @IsString()
  validUntil?: string;

  @IsBoolean()
  isActive!: boolean;
}

class PromoDto {
  @IsUUID('4')
  userId!: string;
}

class MetodoDto {
  @IsIn(['credit_card', 'boleto', 'pix'])
  method!: 'credit_card' | 'boleto' | 'pix';

  @IsBoolean()
  isEnabled!: boolean;
}

class JanelaDto {
  @IsInt()
  @Min(1)
  @Max(365)
  trialDays!: number;

  @IsInt()
  @Min(1)
  @Max(365)
  duplicateDays!: number;
}

class EstornoDto {
  @IsUUID('4')
  subscriptionId!: string;

  @IsIn(['trial', 'duplicate_charge'])
  reason!: 'trial' | 'duplicate_charge';
}

class ContaDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  provider!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(150)
  accountName!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(150)
  credentialsReference!: string;
}

class ReferenciaDto {
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  entityType!: string;

  @IsUUID('4')
  entityId!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(100)
  provider!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(255)
  externalId!: string;
}

@ApiTags('admin')
@Controller('admin')
@UseGuards(AdminGuard)
export class AssinaturaAdminController {
  constructor(
    @Inject(AssinaturaUseCase) private readonly assinatura: AssinaturaUseCase,
    @Inject(SessaoAdminUseCase) private readonly sessoes: SessaoAdminUseCase,
  ) {}

  @Get('coupons')
  cupons() {
    return this.assinatura.cupons();
  }

  @Post('coupons')
  @HttpCode(HttpStatus.CREATED)
  criarCupom(@Body(corpo(CupomAdminDto)) dto: CupomAdminDto) {
    return responder(this.assinatura.salvarCupom({ code: dto.code.trim(), freeDays: dto.freeDays, validUntil: dto.validUntil ?? null, isActive: dto.isActive }));
  }

  @Patch('coupons/:id')
  editarCupom(@Param('id') id: string, @Body(corpo(CupomAdminDto)) dto: CupomAdminDto) {
    return responder(this.assinatura.salvarCupom({ id, code: dto.code.trim(), freeDays: dto.freeDays, validUntil: dto.validUntil ?? null, isActive: dto.isActive }));
  }

  @Delete('coupons/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async excluirCupom(@Param('id') id: string): Promise<void> {
    const resultado = await this.assinatura.excluirCupom(id);
    if (resultado !== 'ok') throw httpDe(resultado === 'cupom' ? 'cupom' : 'ausente');
  }

  @Post('promo')
  @HttpCode(HttpStatus.CREATED)
  async promo(@Req() request: RequestComAdmin, @Body(corpo(PromoDto)) dto: PromoDto) {
    const resultado = await this.assinatura.concederPromo(request.adminId, dto.userId);
    if (resultado === 'conta' || resultado === 'plano') throw httpDe(resultado);
    await this.sessoes.auditar({ adminId: request.adminId, action: 'promo.grant', entityType: 'promo_grant', entityId: resultado.id, oldValues: null, newValues: { userId: dto.userId }, ip: null });
    return resultado;
  }

  @Post('promo/:id/revoke')
  @HttpCode(HttpStatus.NO_CONTENT)
  async revogar(@Req() request: RequestComAdmin, @Param('id') id: string): Promise<void> {
    const resultado = await this.assinatura.revogarPromo(id);
    if (resultado !== 'ok') throw httpDe(resultado);
    await this.sessoes.auditar({ adminId: request.adminId, action: 'promo.revoke', entityType: 'promo_grant', entityId: id, oldValues: null, newValues: { revoked: true }, ip: null });
  }

  @Get('payments')
  pagamentos(@Query('status') status?: string, @Query('email') email?: string, @Query('from') from?: string, @Query('to') to?: string) {
    return this.assinatura.pagamentos({ status: status || null, email: email || null, from: from || null, to: to || null });
  }

  @Get('subscriptions')
  assinaturas(
    @Query('email') email?: string,
    @Query('status') status?: string,
    @Query('plan') plan?: string,
    @Query('cancelled') cancelled?: string,
    @Query('refunded') refunded?: string,
    @Query('provider') provider?: string,
  ) {
    return this.assinatura.assinaturas({
      email: email || null,
      status: status || null,
      plan: plan || null,
      cancelled: boleano(cancelled),
      refunded: boleano(refunded),
      provider: boleano(provider),
    });
  }

  @Get('promo')
  promocoes() {
    return this.assinatura.promocoes();
  }

  @Get('refunds/eligible')
  elegiveis() {
    return this.assinatura.elegiveis();
  }

  @Post('refunds')
  @HttpCode(HttpStatus.CREATED)
  estornar(@Req() request: RequestComAdmin, @Body(corpo(EstornoDto)) dto: EstornoDto) {
    return responder(this.assinatura.estornar(request.adminId, dto.subscriptionId, dto.reason));
  }

  @Get('refund-windows')
  janelas() {
    return this.assinatura.janelas();
  }

  @Patch('refund-windows')
  salvarJanelas(@Req() request: RequestComAdmin, @Body(corpo(JanelaDto)) dto: JanelaDto) {
    return this.assinatura.salvarJanelas(request.adminId, dto.trialDays, dto.duplicateDays);
  }

  @Get('payment-methods')
  metodos() {
    return this.assinatura.metodos();
  }

  @Patch('payment-methods')
  definirMetodo(@Body(corpo(MetodoDto)) dto: MetodoDto) {
    return responder(this.assinatura.definirMetodo(dto.method, dto.isEnabled));
  }

  @Post('providers')
  @HttpCode(HttpStatus.CREATED)
  criarConta(@Body(corpo(ContaDto)) dto: ContaDto) {
    return responder(this.assinatura.criarConta(dto.provider.trim(), dto.accountName.trim(), dto.credentialsReference.trim()));
  }

  @Post('providers/:id/sync')
  @HttpCode(HttpStatus.CREATED)
  sincronizar(@Param('id') id: string) {
    return responder(this.assinatura.sincronizar(id));
  }

  @Post('references')
  @HttpCode(HttpStatus.CREATED)
  referenciar(@Body(corpo(ReferenciaDto)) dto: ReferenciaDto) {
    return this.assinatura.referenciar(dto.entityType, dto.entityId, dto.provider, dto.externalId);
  }

  @Get('integration-logs')
  logs() {
    return this.assinatura.logs();
  }

  @Get('asaas-events')
  eventos() {
    return this.assinatura.eventos();
  }
}

async function responder<T>(pedido: Promise<T | FalhaAssinatura>): Promise<T> {
  const resultado = await pedido;
  if (ehFalha(resultado)) throw httpDe(resultado);
  return resultado;
}

function ehFalha(valor: unknown): valor is FalhaAssinatura {
  return valor === 'ausente' || valor === 'plano' || valor === 'metodo' || valor === 'cupom' || valor === 'conta' || valor === 'janela' || valor === 'cobranca' || valor === 'ultimo';
}

function httpDe(falha: FalhaAssinatura): HttpException {
  if (falha === 'cupom') return new HttpException({ message: 'Cupom inválido.' }, HttpStatus.CONFLICT);
  if (falha === 'conta') return new HttpException({ message: 'Conta não encontrada.' }, HttpStatus.NOT_FOUND);
  if (falha === 'plano') return new HttpException({ message: 'Plano não encontrado.' }, HttpStatus.NOT_FOUND);
  if (falha === 'janela') return new HttpException({ message: 'Esta assinatura não cabe no estorno.' }, HttpStatus.CONFLICT);
  if (falha === 'cobranca') return new HttpException({ message: 'A Asaas não confirmou.' }, HttpStatus.BAD_GATEWAY);
  if (falha === 'ultimo') return new HttpException({ message: 'Pelo menos um meio fica ligado.' }, HttpStatus.CONFLICT);
  return new HttpException({ message: 'Registro não encontrado.' }, HttpStatus.NOT_FOUND);
}

function boleano(valor: string | undefined): boolean | null {
  if (valor === 'true') return true;
  if (valor === 'false') return false;
  return null;
}

function corpo<T>(tipo: new () => T): ValidationPipe {
  return new ValidationPipe({ expectedType: tipo, whitelist: true, transform: true, forbidNonWhitelisted: true });
}
