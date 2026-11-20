import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Inject,
  Post,
  Query,
  Req,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { Request } from 'express';
import { ConfirmarContaUseCase, ReenviarCodigoUseCase } from '../../../application/use-cases/confirmar-conta.use-case';
import { EntrarComGoogleUseCase, EntrarComSenhaUseCase } from '../../../application/use-cases/entrar.use-case';
import { EmitirHandoffUseCase, TrocarHandoffUseCase } from '../../../application/use-cases/handoff.use-case';
import { CriarContaUseCase } from '../../../application/use-cases/criar-conta.use-case';
import {
  ConferirCodigoDeSenhaUseCase,
  PedirCodigoDeSenhaUseCase,
  RedefinirSenhaUseCase,
  ResultadoCodigoSenha,
} from '../../../application/use-cases/recuperar-senha.use-case';
import { VerificarEmailDisponivelUseCase } from '../../../application/use-cases/verificar-email-disponivel.use-case';
import { VerificarUsernameDisponivelUseCase } from '../../../application/use-cases/verificar-username-disponivel.use-case';
import { ParDeTokens, SessaoDeAcesso } from '../../../application/sessao-de-acesso';
import { UsernameEmUsoError } from '../../../domain/ports/perfil-repositorio.port';
import { UsernameInvalidoError } from '../../../domain/value-objects/username.vo';
import { Idioma, LocaleOficial } from '../../../domain/value-objects/idioma.vo';
import { CriarContaDto } from '../dto/criar-conta.dto';
import {
  ConfirmarContaDto,
  EntrarComGoogleDto,
  EntrarComSenhaDto,
  PedirSenhaDto,
  RedefinirSenhaDto,
  ReenviarCodigoDto,
  RenovarSessaoDto,
  SairDto,
  TrocarHandoffDto,
  VerificarEmailQueryDto,
  VerificarUsernameQueryDto,
} from '../dto/auth.dto';
import { AccessTokenGuard, RequestComConta } from '../guards/access-token.guard';
import { mensagem, mensagemCodigoIncorreto } from '../mensagens-identidade';
import { mensagemPerfil } from '../mensagens-perfil';

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
    @Inject(PedirCodigoDeSenhaUseCase) private readonly pedirSenha: PedirCodigoDeSenhaUseCase,
    @Inject(ConferirCodigoDeSenhaUseCase) private readonly conferirSenha: ConferirCodigoDeSenhaUseCase,
    @Inject(RedefinirSenhaUseCase) private readonly redefinirSenha: RedefinirSenhaUseCase,
    @Inject(VerificarEmailDisponivelUseCase) private readonly verificarEmail: VerificarEmailDisponivelUseCase,
    @Inject(VerificarUsernameDisponivelUseCase) private readonly verificarUsername: VerificarUsernameDisponivelUseCase,
  ) {}

  @Get('email-availability')
  @HttpCode(HttpStatus.OK)
  async emailDisponivel(
    @Query(new ValidationPipe({ expectedType: VerificarEmailQueryDto, transform: true, whitelist: true }))
    query: VerificarEmailQueryDto,
  ): Promise<{ disponivel: boolean }> {
    return this.verificarEmail.executar(query.email);
  }

  @Get('username-availability')
  @HttpCode(HttpStatus.OK)
  async usernameDisponivel(
    @Query(new ValidationPipe({ expectedType: VerificarUsernameQueryDto, transform: true, whitelist: true }))
    query: VerificarUsernameQueryDto,
  ): Promise<{ disponivel: boolean }> {
    try {
      return await this.verificarUsername.executar(query.usuario);
    } catch (erro) {
      if (erro instanceof UsernameInvalidoError) {
        throw new HttpException({ message: mensagemPerfil('username', 'pt-BR') }, HttpStatus.BAD_REQUEST);
      }
      throw erro;
    }
  }

  @Post('sign-up')
  @HttpCode(HttpStatus.ACCEPTED)
  async criar(
    @Body(corpo(CriarContaDto))
    dto: CriarContaDto,
  ): Promise<{ mensagem: string; codigoDev?: string }> {
    try {
      const resultado = await this.criarConta.executar({
        nome: dto.nome,
        usuario: dto.usuario,
        email: dto.email,
        senhaPlana: dto.senha,
        idioma: dto.idioma ?? 'pt-BR',
      });
      return comCodigoDev({ mensagem: MENSAGEM_CADASTRO }, resultado.codigoDev);
    } catch (erro) {
      if (erro instanceof UsernameEmUsoError) {
        throw new HttpException({ message: mensagemPerfil('usernameEmUso', 'pt-BR') }, HttpStatus.CONFLICT);
      }
      if (erro instanceof UsernameInvalidoError) {
        throw new HttpException({ message: mensagemPerfil('username', 'pt-BR') }, HttpStatus.BAD_REQUEST);
      }
      throw erro;
    }
  }

  @Post('confirm')
  @HttpCode(HttpStatus.OK)
  async confirmar(@Body(corpo(ConfirmarContaDto)) dto: ConfirmarContaDto): Promise<{ mensagem: string }> {
    const locale = localeDe(dto.idioma);
    const resultado = await this.confirmarConta.executar(dto.email, dto.codigo);

    if (resultado.tipo === 'confirmada') {
      return { mensagem: mensagem('confirmada', locale) };
    }

    if (resultado.tipo === 'bloqueada' || resultado.tentativasRestantes === 0) {
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
  async reenviar(@Body(corpo(ReenviarCodigoDto)) dto: ReenviarCodigoDto): Promise<{ mensagem: string; codigoDev?: string }> {
    const locale = localeDe(dto.idioma);
    const resultado = await this.reenviarCodigo.executar(dto.email, locale);

    if (resultado.tipo === 'cedo') {
      throw new HttpException({ message: mensagem('reenvioCedo', locale) }, HttpStatus.BAD_REQUEST);
    }

    return comCodigoDev({ mensagem: mensagem('reenvioOk', locale) }, resultado.codigoDev);
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

  @Post('logout')
  @UseGuards(AccessTokenGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async sair(@Req() request: RequestComConta, @Body(corpo(SairDto)) dto: SairDto): Promise<void> {
    const encerrou = await this.sessao.encerrarLocal(request.contaId, dto.refreshToken, request.accessJti);
    if (!encerrou) {
      throw new HttpException({ message: mensagem('sairRecusado', 'pt-BR') }, HttpStatus.UNAUTHORIZED);
    }
  }

  @Post('forgot-password')
  @HttpCode(HttpStatus.ACCEPTED)
  async esqueci(@Body(corpo(PedirSenhaDto)) dto: PedirSenhaDto): Promise<{ mensagem: string; codigoDev?: string }> {
    const locale = localeDe(dto.idioma);
    const resultado = await this.pedirSenha.executar(dto.email, locale);
    return comCodigoDev({ mensagem: mensagem('pedidoSenha', locale) }, resultado.codigoDev);
  }

  @Post('forgot-password/resend')
  @HttpCode(HttpStatus.ACCEPTED)
  async reenviarSenha(@Body(corpo(PedirSenhaDto)) dto: PedirSenhaDto): Promise<{ mensagem: string; codigoDev?: string }> {
    const locale = localeDe(dto.idioma);
    const resultado = await this.pedirSenha.reenviar(dto.email, locale);
    if (resultado.tipo === 'cedo') {
      throw new HttpException({ message: mensagem('reenvioCedo', locale) }, HttpStatus.BAD_REQUEST);
    }
    return comCodigoDev({ mensagem: mensagem('pedidoSenha', locale) }, resultado.codigoDev);
  }

  @Post('forgot-password/confirm')
  @HttpCode(HttpStatus.NO_CONTENT)
  async conferirCodigo(@Body(corpo(ConfirmarContaDto)) dto: ConfirmarContaDto): Promise<void> {
    const resultado = await this.conferirSenha.executar(dto.email, dto.codigo);
    if (resultado.tipo !== 'aceito') {
      recusarCodigo(resultado, localeDe(dto.idioma));
    }
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  async redefinir(@Body(corpo(RedefinirSenhaDto)) dto: RedefinirSenhaDto): Promise<{ mensagem: string }> {
    const locale = localeDe(dto.idioma);
    const resultado = await this.redefinirSenha.executar(dto.email, dto.codigo, dto.senha);
    if (resultado.tipo === 'senha_curta') {
      throw new HttpException({ message: mensagem('senhaCurta', locale) }, HttpStatus.BAD_REQUEST);
    }
    if (resultado.tipo === 'alterada') {
      return { mensagem: mensagem('senhaAlterada', locale) };
    }
    recusarCodigo(resultado, locale);
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

/** Em produção nunca devolve o código; em DEV só se o remetente falhou. */
function comCodigoDev<T extends { mensagem: string }>(
  base: T,
  codigoDev: string | undefined,
): T & { codigoDev?: string } {
  if (!codigoDev || (process.env.NODE_ENV ?? 'development') === 'production') {
    return base;
  }
  return { ...base, codigoDev };
}

function recusarCodigo(resultado: ResultadoCodigoSenha, locale: LocaleOficial): never {
  if (resultado.tipo === 'bloqueada') {
    throw new HttpException({ message: mensagem('bloqueada', locale), tentativasRestantes: 0 }, HttpStatus.BAD_REQUEST);
  }
  if (resultado.tipo === 'incorreto') {
    throw new HttpException(
      {
        message: mensagemCodigoIncorreto(resultado.tentativasRestantes, locale),
        tentativasRestantes: resultado.tentativasRestantes,
      },
      HttpStatus.BAD_REQUEST,
    );
  }
  throw new HttpException({ message: mensagem('bloqueada', locale), tentativasRestantes: 0 }, HttpStatus.BAD_REQUEST);
}
