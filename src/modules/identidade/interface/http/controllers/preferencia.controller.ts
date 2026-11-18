import { Body, Controller, Get, HttpException, HttpStatus, Inject, Patch, Query, Req, UseGuards, ValidationPipe } from '@nestjs/common';
import { PreferenciaUseCase, PreferenciaVisivel } from '../../../application/use-cases/preferencia.use-case';
import { PreferenciaInvalidaError } from '../../../domain/preferencia';
import { LocaleOficial } from '../../../domain/value-objects/idioma.vo';
import { EditarPreferenciaDto } from '../dto/preferencia.dto';
import { AccessTokenGuard, RequestComConta } from '../guards/access-token.guard';
import { mensagemPreferencia } from '../mensagens-preferencia';

@Controller('me/preferences')
@UseGuards(AccessTokenGuard)
export class PreferenciaController {
  constructor(@Inject(PreferenciaUseCase) private readonly preferencias: PreferenciaUseCase) {}

  @Get()
  async ver(@Req() request: RequestComConta, @Query('idioma') idioma?: string): Promise<PreferenciaVisivel> {
    return executar(() => this.preferencias.ver(request.contaId, ipDe(request)), localeDe(idioma));
  }

  @Patch()
  async editar(
    @Req() request: RequestComConta,
    @Body(corpo(EditarPreferenciaDto)) dto: EditarPreferenciaDto,
    @Query('idioma') idioma?: string,
  ): Promise<PreferenciaVisivel> {
    return executar(() => this.preferencias.editar(request.contaId, dto, ipDe(request)), localeDe(idioma));
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

async function executar<T>(acao: () => Promise<T>, locale: LocaleOficial): Promise<T> {
  try {
    return await acao();
  } catch (erro) {
    if (erro instanceof PreferenciaInvalidaError) {
      throw new HttpException({ message: mensagemPreferencia(erro.motivo, locale) }, HttpStatus.BAD_REQUEST);
    }
    throw erro;
  }
}

function localeDe(valor: string | undefined): LocaleOficial {
  if (valor === 'pt-BR' || valor === 'pt-PT' || valor === 'en' || valor === 'es') return valor;
  return 'pt-BR';
}

function ipDe(request: RequestComConta): string {
  const direto = request.ip || request.socket?.remoteAddress || '';
  return direto.replace(/^::ffff:/, '');
}
