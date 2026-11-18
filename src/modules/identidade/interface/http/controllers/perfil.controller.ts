import {
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  ValidationPipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  AvatarInvalidoError,
  PerfilAusenteError,
  PerfilUseCase,
  PerfilVisivel,
  visibilidadeDe,
} from '../../../application/use-cases/perfil.use-case';
import { PerfilInvalidoError } from '../../../domain/perfil';
import { UsernameEmUsoError } from '../../../domain/ports/perfil-repositorio.port';
import { LocaleOficial } from '../../../domain/value-objects/idioma.vo';
import { EditarPerfilDto } from '../dto/perfil.dto';
import { AccessTokenGuard, AccessTokenOpcionalGuard, RequestComConta, RequestComContaOpcional } from '../guards/access-token.guard';
import { ChaveMensagemPerfil, mensagemPerfil } from '../mensagens-perfil';

const LIMITE_MULTER = 10 * 1024 * 1024;

@Controller('me/profile')
@UseGuards(AccessTokenGuard)
export class MeuPerfilController {
  constructor(@Inject(PerfilUseCase) private readonly perfil: PerfilUseCase) {}

  @Get()
  async ver(@Req() request: RequestComConta, @Query('idioma') idioma?: string): Promise<PerfilVisivel> {
    return executar(() => this.perfil.meu(request.contaId), localeDe(idioma));
  }

  @Patch()
  async editar(
    @Req() request: RequestComConta,
    @Body(corpo(EditarPerfilDto)) dto: EditarPerfilDto,
    @Query('idioma') idioma?: string,
  ): Promise<PerfilVisivel> {
    return executar(
      () =>
        this.perfil.editar(request.contaId, {
          displayName: dto.nome,
          username: dto.usuario,
          homeCity: dto.cidade,
          websiteUrl: dto.link,
          bio: dto.bio,
          visibility: visibilidadeDe(dto.visibilidade),
        }),
      localeDe(idioma),
    );
  }

  @Post('avatar')
  @UseInterceptors(FileInterceptor('arquivo', { limits: { fileSize: LIMITE_MULTER } }))
  async avatar(
    @Req() request: RequestComConta,
    @UploadedFile() arquivo: { buffer?: Buffer; mimetype?: string; size?: number } | undefined,
    @Query('idioma') idioma?: string,
  ): Promise<{ mensagem: string }> {
    const locale = localeDe(idioma);
    if (!arquivo?.buffer || !arquivo.mimetype) {
      throw new HttpException({ message: mensagemPerfil('avatarTipo', locale) }, HttpStatus.BAD_REQUEST);
    }
    await executar(() => this.perfil.definirAvatar(request.contaId, arquivo.buffer as Buffer, arquivo.mimetype as string), locale);
    return { mensagem: mensagemPerfil('fotoAtualizada', locale) };
  }

  @Get('avatar')
  async baixarMeu(@Req() request: RequestComConta, @Query('idioma') idioma?: string): Promise<StreamableFile> {
    const meu = await executar(() => this.perfil.meu(request.contaId), localeDe(idioma));
    return this.enviar(meu.usuario, request.contaId, localeDe(idioma));
  }

  private async enviar(username: string, espectadorId: string | null, locale: LocaleOficial): Promise<StreamableFile> {
    const arquivo = await executar(() => this.perfil.lerAvatar(username, espectadorId), locale);
    return new StreamableFile(arquivo.bytes, { type: arquivo.mime });
  }
}

@Controller('profiles')
@UseGuards(AccessTokenOpcionalGuard)
export class PerfilPublicoController {
  constructor(@Inject(PerfilUseCase) private readonly perfil: PerfilUseCase) {}

  @Get(':username')
  async ver(
    @Param('username') username: string,
    @Req() request: RequestComContaOpcional,
    @Query('idioma') idioma?: string,
  ): Promise<PerfilVisivel> {
    return executar(() => this.perfil.publicar(username, request.contaId), localeDe(idioma));
  }

  @Get(':username/avatar')
  async avatar(
    @Param('username') username: string,
    @Req() request: RequestComContaOpcional,
    @Query('idioma') idioma?: string,
  ): Promise<StreamableFile> {
    const arquivo = await executar(() => this.perfil.lerAvatar(username, request.contaId), localeDe(idioma));
    return new StreamableFile(arquivo.bytes, { type: arquivo.mime });
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
    throw httpDe(erro, locale);
  }
}

function httpDe(erro: unknown, locale: LocaleOficial): unknown {
  if (erro instanceof UsernameEmUsoError) {
    return new HttpException({ message: mensagemPerfil('usernameEmUso', locale) }, HttpStatus.CONFLICT);
  }
  if (erro instanceof PerfilInvalidoError) {
    return new HttpException({ message: mensagemPerfil(erro.motivo, locale) }, HttpStatus.BAD_REQUEST);
  }
  if (erro instanceof AvatarInvalidoError) {
    const chave: ChaveMensagemPerfil = erro.motivo === 'tamanho' ? 'avatarGrande' : 'avatarTipo';
    return new HttpException({ message: mensagemPerfil(chave, locale) }, HttpStatus.BAD_REQUEST);
  }
  if (erro instanceof PerfilAusenteError) {
    return new HttpException({ message: mensagemPerfil('ausente', locale) }, HttpStatus.NOT_FOUND);
  }
  return erro;
}

function localeDe(valor: string | undefined): LocaleOficial {
  if (valor === 'pt-BR' || valor === 'pt-PT' || valor === 'en' || valor === 'es') return valor;
  return 'pt-BR';
}
