import {
  Body,
  Controller,
  HttpCode,
  HttpException,
  HttpStatus,
  Inject,
  Post,
  Req,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { Request } from 'express';
import { ConfirmarContaUseCase, ReenviarCodigoUseCase } from '../../../application/use-cases/confirmar-conta.use-case';
import { EntrarComGoogleUseCase, EntrarComSenhaUseCase } from '../../../application/use-cases/entrar.use-case';
import { EmitirHandoffUseCase, TrocarHandoffUseCase } from '../../../application/use-cases/handoff.use-case';
import { CriarContaUseCase } from '../../../application/use-cases/criar-conta.use-case';
import { ParDeTokens, SessaoDeAcesso } from '../../../application/sessao-de-acesso';
import { Idioma, LocaleOficial } from '../../../domain/value-objects/idioma.vo';
import { CriarContaDto } from '../dto/criar-conta.dto';
import {
  ConfirmarContaDto,
  EntrarComGoogleDto,
  EntrarComSenhaDto,
  ReenviarCodigoDto,
  RenovarSessaoDto,
  TrocarHandoffDto,
} from '../dto/auth.dto';
import { AccessTokenGuard, RequestComConta } from '../guards/access-token.guard';
import { mensagem, mensagemCodigoIncorreto } from '../mensagens-identidade';

const MENSAGEM_CADASTRO =
  'Se o e-mail informado ainda não tiver conta, enviaremos um código de verificação para ele.';

@Controller('auth')
export class AuthController {
  constructor(
    @Inject(CriarContaUseCase) private readonly criarConta: CriarContaUseCase,
    @Inject(ConfirmarContaUseCase) private readonly confirmarConta: ConfirmarContaUseCase,
    @Inject(ReenviarCodigoUseCase) private readonly reenviarCodigo: ReenviarCodigoUseCase,
    @Inject(EntrarComSenhaUseCase) private readonly entrarComSenha: EntrarComSenhaUseCase,
    @Inject(EntrarComGoogleUseCase) private readonly entrarComGoogle: EntrarComGoogleUseCase,
    @Inject(SessaoDeAcesso) private readonly sessao: SessaoDeAcesso,
    @Inject(EmitirHandoffUseCase) private readonly emitirHandoff: EmitirHandoffUseCase,
    @Inject(TrocarHandoffUseCase) private readonly trocarHandoff: TrocarHandoffUseCase,
  ) {}

  @Post('sign-up')
  @HttpCode(HttpStatus.ACCEPTED)
  async criar(
    @Body(corpo(CriarContaDto))
    dto: CriarContaDto,
  ): Promise<{ mensagem: string }> {
    await this.criarConta.executar({
      nome: dto.nome,
      email: dto.email,
      senhaPlana: dto.senha,
      idioma: dto.idioma ?? 'pt-BR',
    });

    return { mensagem: MENSAGEM_CADASTRO };
  }

  @Post('confirm')
  @HttpCode(HttpStatus.OK)
  async confirmar(@Body(corpo(ConfirmarContaDto)) dto: ConfirmarContaDto): Promise<{ mensagem: string }> {
    const locale = localeDe(dto.idioma);
    const resultado = await this.confirmarConta.executar(dto.email, dto.codigo);

    if (resultado.tipo === 'confirmada') {
      return { mensagem: mensagem('confirmada', locale) };
    }

    if (resultado.tipo === 'bloqueada') {
      throw new HttpException({ message: mensagem('bloqueada', locale), tentativasRestantes: 0 }, HttpStatus.BAD_REQUEST);
    }

    throw new HttpException(
      {
        message: mensagemCodigoIncorreto(resultado.tentativasRestantes, locale),
        tentativasRestantes: resultado.tentativasRestantes,
      },
      HttpStatus.BAD_REQUEST,
    );
  }

  @Post('resend-code')
  @HttpCode(HttpStatus.ACCEPTED)
  async reenviar(@Body(corpo(ReenviarCodigoDto)) dto: ReenviarCodigoDto): Promise<{ mensagem: string }> {
    const locale = localeDe(dto.idioma);
    const resultado = await this.reenviarCodigo.executar(dto.email, locale);

    if (resultado.tipo === 'cedo') {
      throw new HttpException({ message: mensagem('reenvioCedo', locale) }, HttpStatus.BAD_REQUEST);
    }

    return { mensagem: mensagem('reenvioOk', locale) };
  }

  @Post('sign-in')
  @HttpCode(HttpStatus.OK)
  async entrar(@Body(corpo(EntrarComSenhaDto)) dto: EntrarComSenhaDto): Promise<ParDeTokens> {
    const resultado = await this.entrarComSenha.executar(dto.email, dto.senha, dto.manterConectado !== false);
    if (resultado.tipo === 'recusado') {
      throw new HttpException({ message: mensagem('entrarRecusado', 'pt-BR') }, HttpStatus.UNAUTHORIZED);
    }

    return resultado.tokens;
  }

  @Post('google')
  @HttpCode(HttpStatus.OK)
  async google(@Body(corpo(EntrarComGoogleDto)) dto: EntrarComGoogleDto): Promise<ParDeTokens> {
    const resultado = await this.entrarComGoogle.executar(dto.token, dto.manterConectado !== false);
    if (resultado.tipo === 'recusado') {
      throw new HttpException({ message: mensagem('entrarRecusado', 'pt-BR') }, HttpStatus.UNAUTHORIZED);
    }

    return resultado.tokens;
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async renovar(@Body(corpo(RenovarSessaoDto)) dto: RenovarSessaoDto): Promise<ParDeTokens> {
    const resultado = await this.sessao.renovar(dto.refreshToken);
    if (resultado.tipo === 'recusado') {
      throw new HttpException({ message: mensagem('entrarRecusado', 'pt-BR') }, HttpStatus.UNAUTHORIZED);
    }

    return resultado.tokens;
  }

  @Post('handoff')
  @UseGuards(AccessTokenGuard)
  @HttpCode(HttpStatus.CREATED)
  async handoff(@Req() request: Request): Promise<{ codigo: string }> {
    const contaId = (request as RequestComConta).contaId;
    return this.emitirHandoff.executar(contaId);
  }

  @Post('handoff/exchange')
  @HttpCode(HttpStatus.OK)
  async trocar(@Body(corpo(TrocarHandoffDto)) dto: TrocarHandoffDto): Promise<ParDeTokens> {
    const resultado = await this.trocarHandoff.executar(dto.codigo);
    if (resultado.tipo === 'recusado') {
      throw new HttpException({ message: mensagem('handoffRecusado', 'pt-BR') }, HttpStatus.UNAUTHORIZED);
    }

    return resultado.tokens;
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

function localeDe(valor: string | undefined): LocaleOficial {
  return new Idioma(valor ?? 'pt-BR').valor;
}
