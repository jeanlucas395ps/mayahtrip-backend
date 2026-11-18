import { Body, Controller, Get, HttpCode, HttpException, HttpStatus, Inject, Param, Post, Req, UseGuards, ValidationPipe } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsIn, IsString, MaxLength, MinLength } from 'class-validator';
import { AccessTokenGuard, RequestComConta } from '../../../identidade/interface/http/guards/access-token.guard';
import { AssinaturaUseCase, FalhaAssinatura } from '../../application/assinatura.use-case';

class AssinarDto {
  @IsString()
  planPriceId!: string;

  @IsIn(['credit_card', 'boleto', 'pix'])
  method!: 'credit_card' | 'boleto' | 'pix';
}

class TrocarDto {
  @IsString()
  planPriceId!: string;
}

class CupomDto {
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  code!: string;
}

@ApiTags('billing')
@Controller('billing')
@UseGuards(AccessTokenGuard)
export class AssinaturaController {
  constructor(@Inject(AssinaturaUseCase) private readonly assinatura: AssinaturaUseCase) {}

  @Get()
  atual(@Req() request: RequestComConta) {
    return this.assinatura.atual(request.contaId);
  }

  @Get('plans')
  planos() {
    return this.assinatura.planos();
  }

  @Get('methods')
  metodos() {
    return this.assinatura.metodos();
  }

  @Get('invoices')
  faturas(@Req() request: RequestComConta) {
    return this.assinatura.faturas(request.contaId);
  }

  @Post('subscriptions')
  @HttpCode(HttpStatus.CREATED)
  assinar(@Req() request: RequestComConta, @Body(corpo(AssinarDto)) dto: AssinarDto) {
    return responder(this.assinatura.assinar(request.contaId, dto.planPriceId, dto.method));
  }

  @Post('subscriptions/:id/plan')
  trocar(@Req() request: RequestComConta, @Param('id') id: string, @Body(corpo(TrocarDto)) dto: TrocarDto) {
    return responder(this.assinatura.trocar(request.contaId, id, dto.planPriceId));
  }

  @Post('subscriptions/:id/cancel')
  cancelar(@Req() request: RequestComConta, @Param('id') id: string) {
    return responder(this.assinatura.cancelar(request.contaId, id));
  }

  @Post('coupons')
  resgatar(@Req() request: RequestComConta, @Body(corpo(CupomDto)) dto: CupomDto) {
    return responder(this.assinatura.resgatarCupom(request.contaId, dto.code.trim()));
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
  if (falha === 'plano') return new HttpException({ message: 'Plano não encontrado.' }, HttpStatus.NOT_FOUND);
  if (falha === 'metodo') return new HttpException({ message: 'Este meio de pagamento está desligado.' }, HttpStatus.CONFLICT);
  if (falha === 'cupom') return new HttpException({ message: 'Cupom inválido.' }, HttpStatus.NOT_FOUND);
  if (falha === 'cobranca') return new HttpException({ message: 'A cobrança não foi confirmada.' }, HttpStatus.CONFLICT);
  return new HttpException({ message: 'Assinatura não encontrada.' }, HttpStatus.NOT_FOUND);
}

function corpo<T>(tipo: new () => T): ValidationPipe {
  return new ValidationPipe({ expectedType: tipo, whitelist: true, transform: true, forbidNonWhitelisted: true });
}
