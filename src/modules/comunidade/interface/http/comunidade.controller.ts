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
  UploadedFile,
  UseGuards,
  UseInterceptors,
  ValidationPipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags } from '@nestjs/swagger';
import { AccessTokenGuard, RequestComConta } from '../../../identidade/interface/http/guards/access-token.guard';
import { ComunidadeUseCase } from '../../application/comunidade.use-case';
import { AbaDoFeed, ComentarioLido, FalhaComunidade, PublicacaoLida } from '../../domain/comunidade.port';
import { ComentarioDto, DenunciaDto, PublicacaoDto } from './dto/comunidade.dto';

const LIMITE_MULTER = 10 * 1024 * 1024;
const ABAS = new Set<AbaDoFeed>(['para-voce', 'seguindo', 'salvos']);

@ApiTags('community')
@Controller()
@UseGuards(AccessTokenGuard)
export class ComunidadeController {
  constructor(@Inject(ComunidadeUseCase) private readonly comunidade: ComunidadeUseCase) {}

  @Get('feed')
  feed(@Req() request: RequestComConta, @Query('aba') aba = 'para-voce'): Promise<PublicacaoLida[]> {
    if (!ABAS.has(aba as AbaDoFeed)) throw new HttpException({ message: 'Escolha Para você, Seguindo ou Salvos.' }, HttpStatus.BAD_REQUEST);
    return this.comunidade.feed(request.contaId, aba as AbaDoFeed);
  }

  @Post('posts')
  @HttpCode(HttpStatus.CREATED)
  criar(@Req() request: RequestComConta, @Body(corpo(PublicacaoDto)) dto: PublicacaoDto): Promise<PublicacaoLida> {
    return responder(
      this.comunidade.criar(request.contaId, {
        content: dto.content?.trim() || null,
        visibility: dto.visibility,
        placeIds: dto.placeIds,
        mentionIds: dto.mentionIds ?? [],
      }),
    );
  }

  @Post('posts/:id/media')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor('arquivo', { limits: { fileSize: LIMITE_MULTER } }))
  anexar(
    @Req() request: RequestComConta,
    @Param('id') id: string,
    @UploadedFile() arquivo: { buffer?: Buffer; mimetype?: string } | undefined,
    @Body() corpoBruto: { width?: string; height?: string },
  ): Promise<PublicacaoLida> {
    const foto = fotoDe(arquivo, corpoBruto.width, corpoBruto.height);
    return responder(this.comunidade.anexar(request.contaId, id, foto));
  }

  @Post('posts/:id/save')
  salvar(@Req() request: RequestComConta, @Param('id') id: string): Promise<PublicacaoLida> {
    return responder(this.comunidade.salvar(request.contaId, id, true));
  }

  @Delete('posts/:id/save')
  esquecer(@Req() request: RequestComConta, @Param('id') id: string): Promise<PublicacaoLida> {
    return responder(this.comunidade.salvar(request.contaId, id, false));
  }

  @Post('posts/:id/likes')
  curtir(@Req() request: RequestComConta, @Param('id') id: string): Promise<PublicacaoLida> {
    return responder(this.comunidade.curtir(request.contaId, id, true));
  }

  @Delete('posts/:id/likes')
  descurtir(@Req() request: RequestComConta, @Param('id') id: string): Promise<PublicacaoLida> {
    return responder(this.comunidade.curtir(request.contaId, id, false));
  }

  @Get('posts/:id/comments')
  comentarios(@Req() request: RequestComConta, @Param('id') id: string): Promise<ComentarioLido[]> {
    return responder(this.comunidade.comentarios(request.contaId, id));
  }

  @Post('posts/:id/comments')
  @HttpCode(HttpStatus.CREATED)
  comentar(@Req() request: RequestComConta, @Param('id') id: string, @Body(corpo(ComentarioDto)) dto: ComentarioDto): Promise<ComentarioLido[]> {
    return responder(this.comunidade.comentar(request.contaId, id, dto.content, dto.parentId ?? null));
  }

  @Delete('comments/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async apagarComentario(@Req() request: RequestComConta, @Param('id') id: string): Promise<void> {
    const resultado = await this.comunidade.apagarComentario(request.contaId, id);
    if (resultado !== 'ok') throw httpDe(resultado);
  }

  @Post('comments/:id/likes')
  @HttpCode(HttpStatus.NO_CONTENT)
  async curtirComentario(@Req() request: RequestComConta, @Param('id') id: string): Promise<void> {
    const resultado = await this.comunidade.curtirComentario(request.contaId, id, true);
    if (resultado !== 'ok') throw httpDe(resultado);
  }

  @Delete('comments/:id/likes')
  @HttpCode(HttpStatus.NO_CONTENT)
  async descurtirComentario(@Req() request: RequestComConta, @Param('id') id: string): Promise<void> {
    const resultado = await this.comunidade.curtirComentario(request.contaId, id, false);
    if (resultado !== 'ok') throw httpDe(resultado);
  }

  @Post('people/:id/follow')
  async seguir(@Req() request: RequestComConta, @Param('id') id: string): Promise<{ status: 'segue' | 'pedido' }> {
    const resultado = await this.comunidade.seguir(request.contaId, id);
    if (resultado !== 'segue' && resultado !== 'pedido') throw httpDe(resultado);
    return { status: resultado };
  }

  @Delete('people/:id/follow')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deixar(@Req() request: RequestComConta, @Param('id') id: string): Promise<void> {
    const resultado = await this.comunidade.deixarDeSeguir(request.contaId, id);
    if (resultado !== 'ok') throw httpDe(resultado);
  }

  @Post('people/:id/follow-request/accept')
  @HttpCode(HttpStatus.NO_CONTENT)
  async aceitar(@Req() request: RequestComConta, @Param('id') id: string): Promise<void> {
    const resultado = await this.comunidade.responderPedido(request.contaId, id, true);
    if (resultado !== 'ok') throw httpDe(resultado);
  }

  @Post('people/:id/follow-request/reject')
  @HttpCode(HttpStatus.NO_CONTENT)
  async recusar(@Req() request: RequestComConta, @Param('id') id: string): Promise<void> {
    const resultado = await this.comunidade.responderPedido(request.contaId, id, false);
    if (resultado !== 'ok') throw httpDe(resultado);
  }

  @Post('people/:id/block')
  @HttpCode(HttpStatus.NO_CONTENT)
  async bloquear(@Req() request: RequestComConta, @Param('id') id: string): Promise<void> {
    const resultado = await this.comunidade.bloquear(request.contaId, id, true);
    if (resultado !== 'ok') throw httpDe(resultado);
  }

  @Delete('people/:id/block')
  @HttpCode(HttpStatus.NO_CONTENT)
  async desbloquear(@Req() request: RequestComConta, @Param('id') id: string): Promise<void> {
    const resultado = await this.comunidade.bloquear(request.contaId, id, false);
    if (resultado !== 'ok') throw httpDe(resultado);
  }

  @Post('people/:id/mute')
  @HttpCode(HttpStatus.NO_CONTENT)
  async silenciar(@Req() request: RequestComConta, @Param('id') id: string): Promise<void> {
    const resultado = await this.comunidade.silenciar(request.contaId, id, true);
    if (resultado !== 'ok') throw httpDe(resultado);
  }

  @Delete('people/:id/mute')
  @HttpCode(HttpStatus.NO_CONTENT)
  async reativar(@Req() request: RequestComConta, @Param('id') id: string): Promise<void> {
    const resultado = await this.comunidade.silenciar(request.contaId, id, false);
    if (resultado !== 'ok') throw httpDe(resultado);
  }

  @Post('places/:id/reviews')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor('arquivo', { limits: { fileSize: LIMITE_MULTER } }))
  avaliar(
    @Req() request: RequestComConta,
    @Param('id') id: string,
    @UploadedFile() arquivo: { buffer?: Buffer; mimetype?: string } | undefined,
    @Body() corpoBruto: { rating?: string; reviewText?: string; width?: string; height?: string },
  ): Promise<PublicacaoLida> {
    const nota = Number(corpoBruto.rating);
    return responder(this.comunidade.avaliar(request.contaId, id, nota, corpoBruto.reviewText?.trim() || null, fotoDe(arquivo, corpoBruto.width, corpoBruto.height)));
  }

  @Get('report-categories')
  categorias(): Promise<{ id: string; name: string }[]> {
    return this.comunidade.categorias();
  }

  @Post('reports')
  @HttpCode(HttpStatus.CREATED)
  denunciar(@Req() request: RequestComConta, @Body(corpo(DenunciaDto)) dto: DenunciaDto): Promise<{ id: string }> {
    return responder(
      this.comunidade.denunciar(request.contaId, {
        categoryId: dto.categoryId,
        description: dto.description?.trim() || null,
        postId: dto.postId ?? null,
        commentId: dto.commentId ?? null,
        reviewId: dto.reviewId ?? null,
        reportedUserId: dto.reportedUserId ?? null,
      }),
    );
  }
}

function fotoDe(arquivo: { buffer?: Buffer; mimetype?: string } | undefined, width: string | undefined, height: string | undefined) {
  return {
    bytes: arquivo?.buffer ?? Buffer.alloc(0),
    mime: arquivo?.mimetype ?? '',
    width: Number(width),
    height: Number(height),
  };
}

async function responder<T>(pedido: Promise<T | FalhaComunidade>): Promise<T> {
  const resultado = await pedido;
  if (ehFalha(resultado)) throw httpDe(resultado);
  return resultado;
}

function ehFalha(valor: unknown): valor is FalhaComunidade {
  return (
    valor === 'ausente' ||
    valor === 'proibido' ||
    valor === 'lugar' ||
    valor === 'pessoa' ||
    valor === 'midia' ||
    valor === 'nota' ||
    valor === 'vazio' ||
    valor === 'nivel' ||
    valor === 'pedido' ||
    valor === 'categoria' ||
    valor === 'alvo'
  );
}

function httpDe(falha: FalhaComunidade): HttpException {
  if (falha === 'proibido') return new HttpException({ message: 'Você não pode fazer isso com esta pessoa.' }, HttpStatus.FORBIDDEN);
  if (falha === 'lugar') return new HttpException({ message: 'Lugar não encontrado.' }, HttpStatus.NOT_FOUND);
  if (falha === 'pessoa') return new HttpException({ message: 'Pessoa não encontrada.' }, HttpStatus.NOT_FOUND);
  if (falha === 'midia') return new HttpException({ message: 'Envie uma foto JPG, PNG ou WebP de até 1920 px.' }, HttpStatus.BAD_REQUEST);
  if (falha === 'nota') return new HttpException({ message: 'A nota vai de 1 a 5.' }, HttpStatus.BAD_REQUEST);
  if (falha === 'vazio') return new HttpException({ message: 'Escreva o comentário.' }, HttpStatus.BAD_REQUEST);
  if (falha === 'nivel') return new HttpException({ message: 'A resposta só tem um nível.' }, HttpStatus.BAD_REQUEST);
  if (falha === 'pedido') return new HttpException({ message: 'Pedido não encontrado.' }, HttpStatus.NOT_FOUND);
  if (falha === 'categoria') return new HttpException({ message: 'Categoria não encontrada.' }, HttpStatus.NOT_FOUND);
  if (falha === 'alvo') return new HttpException({ message: 'Escolha uma publicação, um comentário, uma avaliação ou um perfil.' }, HttpStatus.BAD_REQUEST);
  return new HttpException({ message: 'Publicação não encontrada.' }, HttpStatus.NOT_FOUND);
}

function corpo<T>(tipo: new () => T): ValidationPipe {
  return new ValidationPipe({ expectedType: tipo, whitelist: true, transform: true, forbidNonWhitelisted: true });
}
