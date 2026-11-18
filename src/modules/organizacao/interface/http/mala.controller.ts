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
  Put,
  Req,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AccessTokenGuard, RequestComConta } from '../../../identidade/interface/http/guards/access-token.guard';
import { MalaUseCase } from '../../application/mala.use-case';
import { FalhaMala, MalasLidas } from '../../domain/mala.port';
import { ItemMalaDto, NovoItemMalaDto, VistantesDto } from './dto/mala.dto';

@ApiTags('trips')
@Controller('trips/:id/packing')
@UseGuards(AccessTokenGuard)
export class MalaController {
  constructor(@Inject(MalaUseCase) private readonly malas: MalaUseCase) {}

  @Get()
  listar(@Req() request: RequestComConta, @Param('id') id: string): Promise<MalasLidas> {
    return responder(this.malas.listar(request.contaId, id));
  }

  @Post(':participantId/items')
  @HttpCode(HttpStatus.CREATED)
  adicionar(
    @Req() request: RequestComConta,
    @Param('id') id: string,
    @Param('participantId') participantId: string,
    @Body(corpo(NovoItemMalaDto)) dto: NovoItemMalaDto,
  ): Promise<MalasLidas> {
    return responder(this.malas.adicionar(request.contaId, id, participantId, dto));
  }

  @Patch('items/:itemId')
  editar(
    @Req() request: RequestComConta,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body(corpo(ItemMalaDto)) dto: ItemMalaDto,
  ): Promise<MalasLidas> {
    return responder(this.malas.editar(request.contaId, id, itemId, dto));
  }

  @Delete('items/:itemId')
  remover(@Req() request: RequestComConta, @Param('id') id: string, @Param('itemId') itemId: string): Promise<MalasLidas> {
    return responder(this.malas.remover(request.contaId, id, itemId));
  }

  @Delete(':participantId')
  esvaziar(@Req() request: RequestComConta, @Param('id') id: string, @Param('participantId') participantId: string): Promise<MalasLidas> {
    return responder(this.malas.esvaziar(request.contaId, id, participantId));
  }

  @Put(':participantId/viewers')
  vistantes(
    @Req() request: RequestComConta,
    @Param('id') id: string,
    @Param('participantId') participantId: string,
    @Body(corpo(VistantesDto)) dto: VistantesDto,
  ): Promise<MalasLidas> {
    return responder(this.malas.definirVistantes(request.contaId, id, participantId, dto.viewerParticipantIds));
  }
}

async function responder(pedido: Promise<MalasLidas | FalhaMala | 'ausente'>): Promise<MalasLidas> {
  const resultado = await pedido;
  if (typeof resultado === 'string') throw httpDe(resultado);
  return resultado;
}

function httpDe(falha: FalhaMala | 'ausente'): HttpException {
  if (falha === 'ausente') return new HttpException({ message: 'Viagem não encontrada.' }, HttpStatus.NOT_FOUND);
  if (falha === 'proibido') return new HttpException({ message: 'Você não mexe nesta mala.' }, HttpStatus.FORBIDDEN);
  if (falha === 'pessoa') return new HttpException({ message: 'Escolha alguém desta viagem.' }, HttpStatus.BAD_REQUEST);
  if (falha === 'categoria') return new HttpException({ message: 'A mala não tem grupo.' }, HttpStatus.BAD_REQUEST);
  return new HttpException({ message: 'Item não encontrado.' }, HttpStatus.NOT_FOUND);
}

function corpo<T>(tipo: new () => T): ValidationPipe {
  return new ValidationPipe({ expectedType: tipo, whitelist: true, transform: true, forbidNonWhitelisted: true });
}
