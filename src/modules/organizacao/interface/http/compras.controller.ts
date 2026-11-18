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
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AccessTokenGuard, RequestComConta } from '../../../identidade/interface/http/guards/access-token.guard';
import { FalhaGasto } from '../../../financeiro/domain/gasto.port';
import { GastoDto } from '../../../financeiro/interface/http/dto/gasto.dto';
import { ComprasUseCase } from '../../application/compras.use-case';
import { CompraNova, FalhaCompra, ListaDeCompras } from '../../domain/compras.port';
import { CompraDto } from './dto/compra.dto';

@ApiTags('trips')
@Controller('trips/:id/shopping')
@UseGuards(AccessTokenGuard)
export class ComprasController {
  constructor(@Inject(ComprasUseCase) private readonly compras: ComprasUseCase) {}

  @Get()
  listar(@Req() request: RequestComConta, @Param('id') id: string): Promise<ListaDeCompras> {
    return responder(this.compras.listar(request.contaId, id));
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  criar(@Req() request: RequestComConta, @Param('id') id: string, @Body(corpo(CompraDto)) dto: CompraDto): Promise<ListaDeCompras> {
    return responder(this.compras.criar(request.contaId, id, compraDe(dto)));
  }

  @Patch(':itemId')
  editar(
    @Req() request: RequestComConta,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body(corpo(CompraDto)) dto: CompraDto,
  ): Promise<ListaDeCompras> {
    return responder(this.compras.editar(request.contaId, id, itemId, compraDe(dto)));
  }

  @Delete(':itemId')
  remover(@Req() request: RequestComConta, @Param('id') id: string, @Param('itemId') itemId: string): Promise<ListaDeCompras> {
    return responder(this.compras.remover(request.contaId, id, itemId));
  }

  @Post(':itemId/expense')
  @HttpCode(HttpStatus.CREATED)
  abrirGasto(
    @Req() request: RequestComConta,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body(corpo(GastoDto)) dto: GastoDto,
  ): Promise<ListaDeCompras> {
    return responder(this.compras.abrirGasto(request.contaId, id, itemId, dto));
  }
}

function compraDe(dto: CompraDto): CompraNova {
  return {
    name: dto.name,
    quantity: dto.quantity ?? 1,
    estimatedPrice: dto.estimatedPrice ?? null,
    storeName: dto.storeName?.trim() || null,
    url: dto.url?.trim() || null,
    isPurchased: dto.isPurchased ?? false,
  };
}

async function responder(pedido: Promise<ListaDeCompras | FalhaCompra | FalhaGasto>): Promise<ListaDeCompras> {
  const resultado = await pedido;
  if (typeof resultado === 'string') throw httpDe(resultado);
  return resultado;
}

function httpDe(falha: FalhaCompra | FalhaGasto): HttpException {
  if (falha === 'ausente') return new HttpException({ message: 'Viagem não encontrada.' }, HttpStatus.NOT_FOUND);
  if (falha === 'proibido') return new HttpException({ message: 'Você não vê as compras desta viagem.' }, HttpStatus.FORBIDDEN);
  if (falha === 'ligado') return new HttpException({ message: 'Este item já abriu um gasto.' }, HttpStatus.CONFLICT);
  if (falha === 'sumido') return new HttpException({ message: 'Item não encontrado.' }, HttpStatus.NOT_FOUND);
  if (falha === 'divisao') return new HttpException({ message: 'A divisão não fecha o valor.' }, HttpStatus.BAD_REQUEST);
  if (falha === 'moeda') return new HttpException({ message: 'Escolha uma moeda ativa.' }, HttpStatus.BAD_REQUEST);
  if (falha === 'categoria') return new HttpException({ message: 'Escolha uma categoria.' }, HttpStatus.BAD_REQUEST);
  if (falha === 'pessoa') return new HttpException({ message: 'Escolha alguém desta viagem.' }, HttpStatus.BAD_REQUEST);
  if (falha === 'data') return new HttpException({ message: 'Escolha um dia da viagem.' }, HttpStatus.BAD_REQUEST);
  if (falha === 'cambio') return new HttpException({ message: 'Não foi possível obter a taxa do dia.' }, HttpStatus.BAD_GATEWAY);
  if (falha === 'semGasto') return new HttpException({ message: 'Você não vê as compras desta viagem.' }, HttpStatus.FORBIDDEN);
  return new HttpException({ message: 'Não foi possível abrir o gasto.' }, HttpStatus.BAD_REQUEST);
}

function corpo<T>(tipo: new () => T): ValidationPipe {
  return new ValidationPipe({ expectedType: tipo, whitelist: true, transform: true, forbidNonWhitelisted: true });
}
