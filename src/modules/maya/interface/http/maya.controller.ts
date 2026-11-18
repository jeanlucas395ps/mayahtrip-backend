import { Body, Controller, Get, HttpCode, HttpException, HttpStatus, Inject, Param, Post, Req, UseGuards, ValidationPipe } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { AccessTokenGuard, RequestComConta } from '../../../identidade/interface/http/guards/access-token.guard';
import { MayaUseCase } from '../../application/maya.use-case';

class MensagemDto {
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  content!: string;
}

class OpiniaoDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  rating?: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  feedbackText?: string;
}

@ApiTags('maya')
@Controller('maya')
@UseGuards(AccessTokenGuard)
export class MayaController {
  constructor(@Inject(MayaUseCase) private readonly maya: MayaUseCase) {}

  @Post('conversations')
  @HttpCode(HttpStatus.CREATED)
  async abrir(@Req() request: RequestComConta, @Body(corpo(MensagemDto)) dto: MensagemDto) {
    return responder(this.maya.conversar(request.contaId, null, dto.content.trim()));
  }

  @Post('conversations/:id/messages')
  @HttpCode(HttpStatus.CREATED)
  continuar(@Req() request: RequestComConta, @Param('id') id: string, @Body(corpo(MensagemDto)) dto: MensagemDto) {
    return responder(this.maya.conversar(request.contaId, id, dto.content.trim()));
  }

  @Get('conversations/:id')
  ler(@Req() request: RequestComConta, @Param('id') id: string) {
    return responder(this.maya.ler(request.contaId, id));
  }

  @Post('messages/:id/feedback')
  @HttpCode(HttpStatus.CREATED)
  opinar(@Req() request: RequestComConta, @Param('id') id: string, @Body(corpo(OpiniaoDto)) dto: OpiniaoDto) {
    return responder(this.maya.opinar(request.contaId, id, dto.rating ?? null, dto.feedbackText?.trim() || null));
  }
}

async function responder<T>(pedido: Promise<T | 'ausente' | 'sem-agente'>): Promise<T> {
  const resultado = await pedido;
  if (resultado === 'ausente') throw new HttpException({ message: 'Conversa não encontrada.' }, HttpStatus.NOT_FOUND);
  if (resultado === 'sem-agente') throw new HttpException({ message: 'Nenhum agente ativo.' }, HttpStatus.CONFLICT);
  return resultado;
}

function corpo<T>(tipo: new () => T): ValidationPipe {
  return new ValidationPipe({ expectedType: tipo, whitelist: true, transform: true, forbidNonWhitelisted: true });
}
