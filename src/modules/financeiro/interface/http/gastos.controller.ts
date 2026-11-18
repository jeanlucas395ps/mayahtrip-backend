import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Inject,
  Param,
  Patch,
  Post,
  Req,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  ValidationPipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags } from '@nestjs/swagger';
import { AccessTokenGuard, RequestComConta } from '../../../identidade/interface/http/guards/access-token.guard';
import { GastosUseCase } from '../../application/gastos.use-case';
import { FalhaGasto, PainelDeGastos } from '../../domain/gasto.port';
import { AcertoDto, GastoDto } from './dto/gasto.dto';

const LIMITE_MULTER = 10 * 1024 * 1024;

@ApiTags('trips')
@Controller('trips/:id')
@UseGuards(AccessTokenGuard)
export class GastosController {
  constructor(@Inject(GastosUseCase) private readonly gastos: GastosUseCase) {}

  @Get('expenses')
  painel(@Req() request: RequestComConta, @Param('id') id: string): Promise<PainelDeGastos> {
    return responder(this.gastos.painel(request.contaId, id));
  }

  @Post('expenses')
  @HttpCode(HttpStatus.CREATED)
  criar(@Req() request: RequestComConta, @Param('id') id: string, @Body(corpo(GastoDto)) dto: GastoDto): Promise<PainelDeGastos> {
    return responder(this.gastos.criar(request.contaId, id, dto));
  }

  @Patch('expenses/:expenseId')
  editar(
    @Req() request: RequestComConta,
    @Param('id') id: string,
    @Param('expenseId') expenseId: string,
    @Body(corpo(GastoDto)) dto: GastoDto,
  ): Promise<PainelDeGastos> {
    return responder(this.gastos.editar(request.contaId, id, expenseId, dto));
  }

  @Delete('expenses/:expenseId')
  excluir(@Req() request: RequestComConta, @Param('id') id: string, @Param('expenseId') expenseId: string): Promise<PainelDeGastos> {
    return responder(this.gastos.excluir(request.contaId, id, expenseId));
  }

  @Post('expenses/:expenseId/receipt')
  @UseInterceptors(FileInterceptor('arquivo', { limits: { fileSize: LIMITE_MULTER } }))
  guardarRecibo(
    @Req() request: RequestComConta,
    @Param('id') id: string,
    @Param('expenseId') expenseId: string,
    @UploadedFile() arquivo: { buffer?: Buffer; mimetype?: string } | undefined,
  ): Promise<PainelDeGastos> {
    if (!arquivo?.buffer || !arquivo.mimetype) {
      throw new HttpException({ message: 'Envie uma imagem JPG, PNG ou WebP.' }, HttpStatus.BAD_REQUEST);
    }
    return responder(this.gastos.guardarRecibo(request.contaId, id, expenseId, arquivo.buffer, arquivo.mimetype));
  }

  @Get('expenses/:expenseId/receipt')
  async recibo(@Req() request: RequestComConta, @Param('id') id: string, @Param('expenseId') expenseId: string): Promise<StreamableFile> {
    const arquivo = await this.gastos.recibo(request.contaId, id, expenseId);
    if (arquivo === 'ausente') throw new HttpException({ message: 'Viagem não encontrada.' }, HttpStatus.NOT_FOUND);
    if (arquivo === 'semGasto') throw new HttpException({ message: 'Você não vê os gastos desta viagem.' }, HttpStatus.FORBIDDEN);
    if (typeof arquivo === 'string') throw new HttpException({ message: 'O gasto não tem recibo.' }, HttpStatus.NOT_FOUND);
    return new StreamableFile(arquivo.bytes, { type: arquivo.mime });
  }

  @Post('settlements')
  @HttpCode(HttpStatus.CREATED)
  acertar(@Req() request: RequestComConta, @Param('id') id: string, @Body(corpo(AcertoDto)) dto: AcertoDto): Promise<PainelDeGastos> {
    return responder(this.gastos.acertar(request.contaId, id, dto.payerParticipantId, dto.receiverParticipantId, dto.amount, dto.currency));
  }

  @Post('settlements/:settlementId/undo')
  desfazer(@Req() request: RequestComConta, @Param('id') id: string, @Param('settlementId') settlementId: string): Promise<PainelDeGastos> {
    return responder(this.gastos.desfazerAcerto(request.contaId, id, settlementId));
  }
}

async function responder(pedido: Promise<PainelDeGastos | FalhaGasto>): Promise<PainelDeGastos> {
  const resultado = await pedido;
  if (typeof resultado === 'string') throw httpDe(resultado);
  return resultado;
}

function httpDe(falha: FalhaGasto): HttpException {
  if (falha === 'ausente') return new HttpException({ message: 'Viagem não encontrada.' }, HttpStatus.NOT_FOUND);
  if (falha === 'semGasto') return new HttpException({ message: 'Você não vê os gastos desta viagem.' }, HttpStatus.FORBIDDEN);
  if (falha === 'divisao') return new HttpException({ message: 'A divisão não fecha o valor.' }, HttpStatus.BAD_REQUEST);
  if (falha === 'moeda') return new HttpException({ message: 'Escolha uma moeda ativa.' }, HttpStatus.BAD_REQUEST);
  if (falha === 'categoria') return new HttpException({ message: 'Escolha uma categoria.' }, HttpStatus.BAD_REQUEST);
  if (falha === 'pessoa') return new HttpException({ message: 'Escolha alguém desta viagem.' }, HttpStatus.BAD_REQUEST);
  if (falha === 'data') return new HttpException({ message: 'Escolha um dia da viagem.' }, HttpStatus.BAD_REQUEST);
  if (falha === 'cambio') return new HttpException({ message: 'Não foi possível obter a taxa do dia.' }, HttpStatus.BAD_GATEWAY);
  if (falha === 'recibo') return new HttpException({ message: 'Envie uma imagem JPG, PNG ou WebP.' }, HttpStatus.BAD_REQUEST);
  return new HttpException({ message: 'Este acerto já foi desfeito.' }, HttpStatus.CONFLICT);
}

function corpo<T>(tipo: new () => T): ValidationPipe {
  return new ValidationPipe({ expectedType: tipo, whitelist: true, transform: true, forbidNonWhitelisted: true });
}
