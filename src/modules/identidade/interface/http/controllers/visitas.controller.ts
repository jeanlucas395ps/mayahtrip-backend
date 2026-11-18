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
  Post,
  Query,
  Req,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { MapaVisivel, VisitaAusenteError, VisitaDeViagemError, VisitasUseCase } from '../../../application/use-cases/visitas.use-case';
import { VisitaInvalidaError } from '../../../domain/visita';
import { LocaleOficial } from '../../../domain/value-objects/idioma.vo';
import { MarcarCidadeDto, MarcarPaisDto } from '../dto/visita.dto';
import { AccessTokenGuard, RequestComConta } from '../guards/access-token.guard';
import { mensagemVisita } from '../mensagens-visita';

@Controller('me/visits')
@UseGuards(AccessTokenGuard)
export class VisitasController {
  constructor(@Inject(VisitasUseCase) private readonly visitas: VisitasUseCase) {}

  @Get()
  async ver(@Req() request: RequestComConta, @Query('idioma') idioma?: string): Promise<MapaVisivel> {
    return this.visitas.ver(request.contaId, localeDe(idioma));
  }

  @Post('countries')
  @HttpCode(HttpStatus.OK)
  async marcarPais(
    @Req() request: RequestComConta,
    @Body(corpo(MarcarPaisDto)) dto: MarcarPaisDto,
    @Query('idioma') idioma?: string,
  ): Promise<MapaVisivel> {
    const locale = localeDe(idioma);
    await executar(() => this.visitas.marcarPais(request.contaId, dto.paisId, dto.quando), locale);
    return this.visitas.ver(request.contaId, locale);
  }

  @Delete('countries/:paisId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removerPais(@Req() request: RequestComConta, @Param('paisId') paisId: string, @Query('idioma') idioma?: string): Promise<void> {
    await executar(() => this.visitas.removerPais(request.contaId, paisId), localeDe(idioma));
  }

  @Post('cities')
  @HttpCode(HttpStatus.OK)
  async marcarCidade(
    @Req() request: RequestComConta,
    @Body(corpo(MarcarCidadeDto)) dto: MarcarCidadeDto,
    @Query('idioma') idioma?: string,
  ): Promise<MapaVisivel> {
    const locale = localeDe(idioma);
    await executar(() => this.visitas.marcarCidade(request.contaId, dto.cidadeId, dto.quando), locale);
    return this.visitas.ver(request.contaId, locale);
  }

  @Delete('cities/:cidadeId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removerCidade(
    @Req() request: RequestComConta,
    @Param('cidadeId') cidadeId: string,
    @Query('idioma') idioma?: string,
  ): Promise<void> {
    await executar(() => this.visitas.removerCidade(request.contaId, cidadeId), localeDe(idioma));
  }
}

function corpo<T>(tipo: new () => T): ValidationPipe {
  return new ValidationPipe({
    expectedType: tipo,
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });
}

async function executar(acao: () => Promise<void>, locale: LocaleOficial): Promise<void> {
  try {
    await acao();
  } catch (erro) {
    if (erro instanceof VisitaInvalidaError) {
      throw new HttpException({ message: mensagemVisita(erro.motivo, locale) }, HttpStatus.BAD_REQUEST);
    }
    if (erro instanceof VisitaAusenteError) {
      throw new HttpException({ message: mensagemVisita('ausente', locale) }, HttpStatus.NOT_FOUND);
    }
    if (erro instanceof VisitaDeViagemError) {
      throw new HttpException({ message: mensagemVisita('viagem', locale) }, HttpStatus.CONFLICT);
    }
    throw erro;
  }
}

function localeDe(valor: string | undefined): LocaleOficial {
  if (valor === 'pt-BR' || valor === 'pt-PT' || valor === 'en' || valor === 'es') return valor;
  return 'pt-BR';
}
