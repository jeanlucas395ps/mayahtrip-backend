import {
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
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { DocumentoAusenteError, DocumentoUseCase, DocumentoVisivel } from '../../../application/use-cases/documento.use-case';
import { DocumentoInvalidoError, LIMITE_DOCUMENTO_BYTES } from '../../../domain/documento';
import { LocaleOficial } from '../../../domain/value-objects/idioma.vo';
import { AccessTokenGuard, RequestComConta } from '../guards/access-token.guard';
import { mensagemDocumento } from '../mensagens-documento';

@Controller('me/documents')
@UseGuards(AccessTokenGuard)
export class DocumentoController {
  constructor(@Inject(DocumentoUseCase) private readonly documentos: DocumentoUseCase) {}

  @Get()
  async listar(@Req() request: RequestComConta): Promise<DocumentoVisivel[]> {
    return this.documentos.listar(request.contaId);
  }

  @Post()
  @UseInterceptors(FileInterceptor('arquivo', { limits: { fileSize: LIMITE_DOCUMENTO_BYTES } }))
  async criar(
    @Req() request: RequestComConta,
    @UploadedFile() arquivo: { buffer?: Buffer; mimetype?: string; originalname?: string } | undefined,
    @Query('idioma') idioma?: string,
  ): Promise<DocumentoVisivel> {
    const locale = localeDe(idioma);
    const campos = (request.body ?? {}) as { tipo?: string; codigo?: string; carteira?: string };
    if (!arquivo?.buffer || !arquivo.mimetype) {
      throw new HttpException({ message: mensagemDocumento('arquivo', locale) }, HttpStatus.BAD_REQUEST);
    }
    return executar(
      () =>
        this.documentos.criar(request.contaId, {
          tipo: campos.tipo,
          codigo: campos.codigo,
          carteira: campos.carteira,
          nomeArquivo: arquivo.originalname,
          mime: arquivo.mimetype,
          bytes: arquivo.buffer as Buffer,
        }),
      locale,
    );
  }

  @Get(':id/arquivo')
  async baixar(@Req() request: RequestComConta, @Param('id') id: string, @Query('idioma') idioma?: string): Promise<StreamableFile> {
    const arquivo = await executar(() => this.documentos.baixar(request.contaId, id), localeDe(idioma));
    const nome = arquivo.nome.replace(/["\r\n]/g, '');
    return new StreamableFile(arquivo.bytes, { type: arquivo.mime, disposition: `attachment; filename="${nome}"` });
  }

  @Get(':id')
  async ver(@Req() request: RequestComConta, @Param('id') id: string, @Query('idioma') idioma?: string): Promise<DocumentoVisivel> {
    return executar(() => this.documentos.ver(request.contaId, id), localeDe(idioma));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async excluir(@Req() request: RequestComConta, @Param('id') id: string, @Query('idioma') idioma?: string): Promise<void> {
    await executar(() => this.documentos.excluir(request.contaId, id), localeDe(idioma));
  }
}

async function executar<T>(acao: () => Promise<T>, locale: LocaleOficial): Promise<T> {
  try {
    return await acao();
  } catch (erro) {
    if (erro instanceof DocumentoInvalidoError) {
      throw new HttpException({ message: mensagemDocumento(erro.motivo, locale) }, HttpStatus.BAD_REQUEST);
    }
    if (erro instanceof DocumentoAusenteError) {
      throw new HttpException({ message: mensagemDocumento('ausente', locale) }, HttpStatus.NOT_FOUND);
    }
    throw erro;
  }
}

function localeDe(valor: string | undefined): LocaleOficial {
  if (valor === 'pt-BR' || valor === 'pt-PT' || valor === 'en' || valor === 'es') return valor;
  return 'pt-BR';
}
