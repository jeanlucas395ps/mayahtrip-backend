import { Body, Controller, Delete, Get, Headers, HttpCode, HttpException, HttpStatus, Inject, Param, Post, Req, UseGuards, ValidationPipe } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AccessTokenGuard, RequestComConta } from '../../../identidade/interface/http/guards/access-token.guard';
import { RoteiroUseCase } from '../../application/roteiro.use-case';
import { FalhaRoteiro, GeracaoLida, RoteiroLido } from '../../domain/roteiro.port';
import { DeslocamentoDto, DiaDto, GerarDto, ParadaDto } from './dto/roteiro.dto';

@ApiTags('trips')
@Controller('trips/:id/itinerary')
@UseGuards(AccessTokenGuard)
export class RoteiroController {
  constructor(@Inject(RoteiroUseCase) private readonly roteiros: RoteiroUseCase) {}

  @Get()
  async ler(@Req() request: RequestComConta, @Param('id') id: string): Promise<RoteiroLido> {
    return responder(this.roteiros.ler(request.contaId, id));
  }

  @Post('days')
  @HttpCode(HttpStatus.CREATED)
  async criarDia(@Req() request: RequestComConta, @Param('id') id: string, @Body(corpo(DiaDto)) dto: DiaDto): Promise<RoteiroLido> {
    return responder(this.roteiros.criarDia(request.contaId, id, dto));
  }

  @Post('days/:dayId/stops')
  @HttpCode(HttpStatus.CREATED)
  async criarParada(
    @Req() request: RequestComConta,
    @Param('id') id: string,
    @Param('dayId') dayId: string,
    @Body(corpo(ParadaDto)) dto: ParadaDto,
  ): Promise<RoteiroLido> {
    return responder(this.roteiros.criarParada(request.contaId, id, dayId, dto));
  }

  @Post('days/:dayId/transfers')
  @HttpCode(HttpStatus.CREATED)
  async criarDeslocamento(
    @Req() request: RequestComConta,
    @Param('id') id: string,
    @Param('dayId') dayId: string,
    @Body(corpo(DeslocamentoDto)) dto: DeslocamentoDto,
  ): Promise<RoteiroLido> {
    return responder(this.roteiros.criarDeslocamento(request.contaId, id, dayId, dto));
  }

  @Post('generate')
  @HttpCode(HttpStatus.ACCEPTED)
  async gerar(
    @Req() request: RequestComConta,
    @Param('id') id: string,
    @Body(corpo(GerarDto)) dto: GerarDto,
    @Headers('idempotency-key') chave?: string,
  ): Promise<GeracaoLida> {
    const normalizada = normalizarChave(chave);
    if (normalizada === 'invalida') throw new HttpException({ message: 'A chave de idempotência é inválida.' }, HttpStatus.BAD_REQUEST);
    return responderGeracao(this.roteiros.gerar(request.contaId, id, dto ?? {}, normalizada));
  }

  @Post('optimize')
  async otimizar(@Req() request: RequestComConta, @Param('id') id: string): Promise<RoteiroLido> {
    return responder(this.roteiros.otimizar(request.contaId, id));
  }

  @Post('stops/:stopId/done')
  async marcar(@Req() request: RequestComConta, @Param('id') id: string, @Param('stopId') stopId: string): Promise<RoteiroLido> {
    return responder(this.roteiros.marcarFeito(request.contaId, id, stopId, true));
  }

  @Delete('stops/:stopId/done')
  async desfazer(@Req() request: RequestComConta, @Param('id') id: string, @Param('stopId') stopId: string): Promise<RoteiroLido> {
    return responder(this.roteiros.marcarFeito(request.contaId, id, stopId, false));
  }
}

async function responderGeracao(pedido: Promise<GeracaoLida | FalhaRoteiro>): Promise<GeracaoLida> {
  const resultado = await pedido;
  if (typeof resultado === 'string') throw httpDe(resultado);
  return resultado;
}

async function responder(pedido: Promise<RoteiroLido | FalhaRoteiro>): Promise<RoteiroLido> {
  const resultado = await pedido;
  if (typeof resultado === 'string') throw httpDe(resultado);
  return resultado;
}

function httpDe(falha: FalhaRoteiro): HttpException {
  if (falha === 'ausente') return new HttpException({ message: 'Viagem não encontrada.' }, HttpStatus.NOT_FOUND);
  if (falha === 'semEdicao') return new HttpException({ message: 'Você não pode editar o roteiro.' }, HttpStatus.FORBIDDEN);
  if (falha === 'dia') return new HttpException({ message: 'Dia não encontrado.' }, HttpStatus.NOT_FOUND);
  if (falha === 'parada') return new HttpException({ message: 'Parada não encontrada.' }, HttpStatus.NOT_FOUND);
  if (falha === 'destino') return new HttpException({ message: 'Destino não encontrado.' }, HttpStatus.NOT_FOUND);
  if (falha === 'roteiro') return new HttpException({ message: 'A viagem ainda não tem roteiro.' }, HttpStatus.NOT_FOUND);
  return new HttpException({ message: 'Viagens com mais de 14 dias não geram roteiro automático.' }, HttpStatus.CONFLICT);
}

function normalizarChave(chave?: string): string | null | 'invalida' {
  if (!chave || chave.trim() === '') return null;
  const valor = chave.trim();
  if (!/^[A-Za-z0-9._:-]{8,255}$/.test(valor)) return 'invalida';
  return valor;
}

function corpo<T>(tipo: new () => T): ValidationPipe {
  return new ValidationPipe({ expectedType: tipo, whitelist: true, transform: true, forbidNonWhitelisted: true });
}
