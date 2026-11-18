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
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  ValidationPipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags } from '@nestjs/swagger';
import { AccessTokenGuard, RequestComConta } from '../../../identidade/interface/http/guards/access-token.guard';
import { DocumentosUseCase } from '../../application/documentos.use-case';
import { DocumentosLidos, FalhaDocumento, LinkNovo } from '../../domain/documentos.port';
import { LinkDto } from './dto/documento.dto';

const LIMITE_MULTER = 10 * 1024 * 1024;

@ApiTags('trips')
@Controller('trips/:id')
@UseGuards(AccessTokenGuard)
export class DocumentosController {
  constructor(@Inject(DocumentosUseCase) private readonly documentos: DocumentosUseCase) {}

  @Get('documents')
  listar(@Req() request: RequestComConta, @Param('id') id: string): Promise<DocumentosLidos> {
    return responder(this.documentos.listar(request.contaId, id));
  }

  @Post('documents')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor('arquivo', { limits: { fileSize: LIMITE_MULTER } }))
  guardar(
    @Req() request: RequestComConta,
    @Param('id') id: string,
    @UploadedFile() arquivo: { buffer?: Buffer; mimetype?: string } | undefined,
    @Body() corpoBruto: { name?: string; documentType?: string },
  ): Promise<DocumentosLidos> {
    if (!arquivo?.buffer || !arquivo.mimetype || typeof corpoBruto.name !== 'string') {
      throw new HttpException({ message: 'Envie uma foto JPG, PNG, WebP ou um PDF.' }, HttpStatus.BAD_REQUEST);
    }
    return responder(this.documentos.guardar(request.contaId, id, corpoBruto.name, corpoBruto.documentType, arquivo.buffer, arquivo.mimetype));
  }

  @Get('documents/:documentId')
  async abrir(@Req() request: RequestComConta, @Param('id') id: string, @Param('documentId') documentId: string): Promise<StreamableFile> {
    const arquivo = await this.documentos.ler(request.contaId, id, documentId);
    if (arquivo === 'ausente') throw new HttpException({ message: 'Viagem não encontrada.' }, HttpStatus.NOT_FOUND);
    if (arquivo === 'proibido') throw new HttpException({ message: 'Você não vê os documentos desta viagem.' }, HttpStatus.FORBIDDEN);
    if (typeof arquivo === 'string') throw new HttpException({ message: 'Documento não encontrado.' }, HttpStatus.NOT_FOUND);
    return new StreamableFile(arquivo.bytes, { type: arquivo.mime });
  }

  @Delete('documents/:documentId')
  excluir(@Req() request: RequestComConta, @Param('id') id: string, @Param('documentId') documentId: string): Promise<DocumentosLidos> {
    return responder(this.documentos.excluir(request.contaId, id, documentId));
  }

  @Post('links')
  @HttpCode(HttpStatus.CREATED)
  criarLink(@Req() request: RequestComConta, @Param('id') id: string, @Body(corpo(LinkDto)) dto: LinkDto): Promise<DocumentosLidos> {
    return responder(this.documentos.criarLink(request.contaId, id, linkDe(dto)));
  }

  @Patch('links/:linkId')
  editarLink(
    @Req() request: RequestComConta,
    @Param('id') id: string,
    @Param('linkId') linkId: string,
    @Body(corpo(LinkDto)) dto: LinkDto,
  ): Promise<DocumentosLidos> {
    return responder(this.documentos.editarLink(request.contaId, id, linkId, linkDe(dto)));
  }

  @Delete('links/:linkId')
  excluirLink(@Req() request: RequestComConta, @Param('id') id: string, @Param('linkId') linkId: string): Promise<DocumentosLidos> {
    return responder(this.documentos.excluirLink(request.contaId, id, linkId));
  }
}

function linkDe(dto: LinkDto): LinkNovo {
  return { title: dto.title, url: dto.url, description: dto.description?.trim() || null };
}

async function responder(pedido: Promise<DocumentosLidos | FalhaDocumento>): Promise<DocumentosLidos> {
  const resultado = await pedido;
  if (typeof resultado === 'string') throw httpDe(resultado);
  return resultado;
}

function httpDe(falha: FalhaDocumento): HttpException {
  if (falha === 'ausente') return new HttpException({ message: 'Viagem não encontrada.' }, HttpStatus.NOT_FOUND);
  if (falha === 'proibido') return new HttpException({ message: 'Você não vê os documentos desta viagem.' }, HttpStatus.FORBIDDEN);
  if (falha === 'arquivo') return new HttpException({ message: 'Envie uma foto JPG, PNG, WebP ou um PDF.' }, HttpStatus.BAD_REQUEST);
  return new HttpException({ message: 'Documento não encontrado.' }, HttpStatus.NOT_FOUND);
}

function corpo<T>(tipo: new () => T): ValidationPipe {
  return new ValidationPipe({ expectedType: tipo, whitelist: true, transform: true, forbidNonWhitelisted: true });
}
