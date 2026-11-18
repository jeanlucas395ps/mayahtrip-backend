import { Body, Controller, Delete, Get, HttpCode, HttpException, HttpStatus, Inject, Param, Post, Req, UseGuards, ValidationPipe } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AccessTokenGuard, RequestComConta } from '../../../identidade/interface/http/guards/access-token.guard';
import { RoteiroUseCase } from '../../application/roteiro.use-case';
import { FalhaRoteiro, RoteiroLido } from '../../domain/roteiro.port';
import { DeslocamentoDto, DiaDto, ParadaDto } from './dto/roteiro.dto';

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

  @Post('stops/:stopId/done')
  async marcar(@Req() request: RequestComConta, @Param('id') id: string, @Param('stopId') stopId: string): Promise<RoteiroLido> {
    return responder(this.roteiros.marcarFeito(request.contaId, id, stopId, true));
  }

  @Delete('stops/:stopId/done')
  async desfazer(@Req() request: RequestComConta, @Param('id') id: string, @Param('stopId') stopId: string): Promise<RoteiroLido> {
    return responder(this.roteiros.marcarFeito(request.contaId, id, stopId, false));
  }
}

async function responder(pedido: Promise<RoteiroLido | FalhaRoteiro>): Promise<RoteiroLido> {
  const resultado = await pedido;
  if (resultado === 'ausente') throw new HttpException({ message: 'Viagem não encontrada.' }, HttpStatus.NOT_FOUND);
  if (resultado === 'semEdicao') throw new HttpException({ message: 'Você não pode editar o roteiro.' }, HttpStatus.FORBIDDEN);
  if (resultado === 'dia') throw new HttpException({ message: 'Dia não encontrado.' }, HttpStatus.NOT_FOUND);
  if (resultado === 'parada') throw new HttpException({ message: 'Parada não encontrada.' }, HttpStatus.NOT_FOUND);
  if (resultado === 'destino') throw new HttpException({ message: 'Destino não encontrado.' }, HttpStatus.NOT_FOUND);
  return resultado;
}

function corpo<T>(tipo: new () => T): ValidationPipe {
  return new ValidationPipe({ expectedType: tipo, whitelist: true, transform: true, forbidNonWhitelisted: true });
}
