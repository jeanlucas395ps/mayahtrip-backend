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
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  ValidationPipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags } from '@nestjs/swagger';
import { CatalogoAdminUseCase } from '../../../application/catalogo-admin.use-case';
import { FalhaCatalogo, LugarAdmin, SalvarCategoria, SalvarLugar } from '../../../domain/ports/catalogo-admin.port';
import { SessaoAdminUseCase } from '../../../application/sessao-admin.use-case';
import { SalvarCategoriaDto, SalvarLugarDto, UnificarLugarDto } from '../dto/catalogo.dto';
import { AdminGuard, RequestComAdmin } from '../guards/admin.guard';

const LIMITE_MULTER = 10 * 1024 * 1024;

@ApiTags('admin')
@Controller('admin')
@UseGuards(AdminGuard)
export class CatalogoAdminController {
  constructor(
    @Inject(CatalogoAdminUseCase) private readonly catalogo: CatalogoAdminUseCase,
    @Inject(SessaoAdminUseCase) private readonly sessoes: SessaoAdminUseCase,
  ) {}

  @Get('places')
  async listar(@Query('q') q?: string, @Query('status') status?: string) {
    const lista = await this.catalogo.listar(q, status);
    if (lista === 'invalido') throw new HttpException({ message: 'Filtro inválido.' }, HttpStatus.BAD_REQUEST);
    return lista;
  }

  @Post('places')
  async criar(@Req() request: RequestComAdmin, @Body(corpo(SalvarLugarDto)) dto: SalvarLugarDto) {
    const lugar = await responder(this.catalogo.salvar(null, paraLugar(dto)));
    await this.auditar(request, 'place.create', lugar.id, { slug: lugar.slug, status: lugar.status });
    return lugar;
  }

  @Get('places/:id')
  ficha(@Param('id') id: string) {
    return responder(this.catalogo.ficha(id));
  }

  @Patch('places/:id')
  async editar(@Req() request: RequestComAdmin, @Param('id') id: string, @Body(corpo(SalvarLugarDto)) dto: SalvarLugarDto) {
    const lugar = await responder(this.catalogo.salvar(id, paraLugar(dto)));
    await this.auditar(request, 'place.update', lugar.id, { slug: lugar.slug, status: lugar.status });
    return lugar;
  }

  @Post('places/:id/archive')
  async arquivar(@Req() request: RequestComAdmin, @Param('id') id: string) {
    const lugar = await responder(this.catalogo.arquivar(id));
    await this.auditar(request, 'place.archive', lugar.id, { status: lugar.status });
    return lugar;
  }

  @Post('places/:id/merge')
  async unificar(@Req() request: RequestComAdmin, @Param('id') id: string, @Body(corpo(UnificarLugarDto)) dto: UnificarLugarDto) {
    const lugar = await responder(this.catalogo.unificar(id, dto.origemId));
    await this.auditar(request, 'place.merge', lugar.id, { origemId: dto.origemId, status: lugar.status });
    return lugar;
  }

  @Post('places/:id/media')
  @UseInterceptors(FileInterceptor('arquivo', { limits: { fileSize: LIMITE_MULTER } }))
  async midia(
    @Req() request: RequestComAdmin,
    @Param('id') id: string,
    @UploadedFile() arquivo: { buffer?: Buffer; mimetype?: string } | undefined,
    @Query('atribuicao') atribuicao?: string,
    @Query('ordem') ordem?: string,
  ) {
    if (!arquivo?.buffer || !arquivo.mimetype) {
      throw new HttpException({ message: 'Envie uma imagem JPG, PNG, WebP ou um vídeo MP4.' }, HttpStatus.BAD_REQUEST);
    }
    const ordemNumero = ordem === undefined || ordem === '' ? null : Number(ordem);
    if (ordemNumero !== null && !Number.isInteger(ordemNumero)) {
      throw new HttpException({ message: 'Filtro inválido.' }, HttpStatus.BAD_REQUEST);
    }
    const gravada = await this.catalogo.adicionarMidia(id, arquivo.buffer, arquivo.mimetype, atribuicao ?? null, ordemNumero);
    if (gravada === 'ausente') throw new HttpException({ message: 'Lugar não encontrado.' }, HttpStatus.NOT_FOUND);
    if (gravada === 'invalido') {
      throw new HttpException({ message: 'Envie uma imagem JPG, PNG, WebP ou um vídeo MP4.' }, HttpStatus.BAD_REQUEST);
    }
    await this.auditar(request, 'place_media.create', id, { mediaId: gravada.id, mediaType: gravada.mediaType });
    return gravada;
  }

  @Delete('places/:id/media/:mediaId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async apagarMidia(@Req() request: RequestComAdmin, @Param('id') id: string, @Param('mediaId') mediaId: string) {
    const resultado = await this.catalogo.removerMidia(id, mediaId);
    if (resultado === 'ausente') throw new HttpException({ message: 'Mídia não encontrada.' }, HttpStatus.NOT_FOUND);
    await this.auditar(request, 'place_media.delete', id, { mediaId });
  }

  @Get('place-categories')
  categorias() {
    return this.catalogo.categorias();
  }

  @Post('place-categories')
  async criarCategoria(@Req() request: RequestComAdmin, @Body(corpo(SalvarCategoriaDto)) dto: SalvarCategoriaDto) {
    const categoria = await responderCategoria(this.catalogo.salvarCategoria(null, paraCategoria(dto)));
    await this.auditar(request, 'place_category.create', categoria.id, { slug: categoria.slug });
    return categoria;
  }

  @Patch('place-categories/:id')
  async editarCategoria(@Req() request: RequestComAdmin, @Param('id') id: string, @Body(corpo(SalvarCategoriaDto)) dto: SalvarCategoriaDto) {
    const categoria = await responderCategoria(this.catalogo.salvarCategoria(id, paraCategoria(dto)));
    await this.auditar(request, 'place_category.update', categoria.id, { slug: categoria.slug });
    return categoria;
  }

  @Delete('place-categories/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async excluirCategoria(@Req() request: RequestComAdmin, @Param('id') id: string) {
    const resultado = await this.catalogo.excluirCategoria(id);
    if (resultado === 'ausente') throw new HttpException({ message: 'Categoria não encontrada.' }, HttpStatus.NOT_FOUND);
    if (resultado === 'em_uso') throw new HttpException({ message: 'A categoria está em uso.' }, HttpStatus.CONFLICT);
    await this.auditar(request, 'place_category.delete', id, { deleted: true });
  }

  private auditar(request: RequestComAdmin, action: string, id: string, novo: Record<string, unknown>): Promise<void> {
    return this.sessoes.auditar({
      adminId: request.adminId,
      action,
      entityType: action.startsWith('place_category') ? 'place_category' : 'place',
      entityId: id,
      oldValues: null,
      newValues: novo,
      ip: ipDe(request),
    });
  }
}

function paraLugar(dto: SalvarLugarDto): SalvarLugar {
  return {
    slug: dto.slug,
    name: dto.name,
    description: dto.description ?? null,
    cityId: dto.cityId ?? null,
    latitude: dto.latitude ?? null,
    longitude: dto.longitude ?? null,
    websiteUrl: dto.websiteUrl ?? null,
    phone: dto.phone ?? null,
    status: dto.status,
    translations: dto.translations.map((item) => ({ locale: item.locale, name: item.name ?? null, description: item.description ?? null })),
    categoryIds: dto.categoryIds,
    addresses: dto.addresses.map((item) => ({
      line1: item.line1 ?? null,
      neighborhood: item.neighborhood ?? null,
      postalCode: item.postalCode ?? null,
      cityId: item.cityId ?? null,
    })),
    openingHours: dto.openingHours.map((item) => ({
      weekday: item.weekday,
      openingTime: item.openingTime ?? null,
      closingTime: item.closingTime ?? null,
      isClosed: item.isClosed,
    })),
    prices: dto.prices.map((item) => ({
      currency: item.currency?.toUpperCase() ?? null,
      priceLevel: item.priceLevel ?? null,
      minimumPrice: item.minimumPrice ?? null,
      maximumPrice: item.maximumPrice ?? null,
    })),
    visitInformation: dto.visitInformation.map((item) => ({
      recommendedDurationMinutes: item.recommendedDurationMinutes ?? null,
      bestTimeToVisit: item.bestTimeToVisit ?? null,
      accessibilityInformation: item.accessibilityInformation ?? null,
    })),
    externalReferences: dto.externalReferences.map((item) => ({
      provider: item.provider,
      externalId: item.externalId,
      externalUrl: item.externalUrl ?? null,
      providerMetadata: item.providerMetadata ?? null,
    })),
  };
}

function paraCategoria(dto: SalvarCategoriaDto): SalvarCategoria {
  return {
    slug: dto.slug,
    parentId: dto.parentId ?? null,
    translations: dto.translations.map((item) => ({ locale: item.locale, name: item.name })),
  };
}

async function responder(pedido: Promise<LugarAdmin | FalhaCatalogo | null>): Promise<LugarAdmin> {
  const resultado = await pedido;
  if (resultado === null) throw new HttpException({ message: 'Lugar não encontrado.' }, HttpStatus.NOT_FOUND);
  if (typeof resultado === 'string') throw httpDe(resultado);
  return resultado;
}

async function responderCategoria<T extends object>(pedido: Promise<T | FalhaCatalogo>): Promise<T> {
  const resultado = await pedido;
  if (typeof resultado !== 'string') return resultado;
  if (resultado === 'ausente') throw new HttpException({ message: 'Categoria não encontrada.' }, HttpStatus.NOT_FOUND);
  if (resultado === 'slug') throw new HttpException({ message: 'Já existe uma categoria com esse slug.' }, HttpStatus.CONFLICT);
  if (resultado === 'categoria') throw new HttpException({ message: 'Categoria não encontrada.' }, HttpStatus.BAD_REQUEST);
  if (resultado === 'invalido') {
    throw new HttpException({ message: 'A categoria não pode ficar abaixo dela mesma.' }, HttpStatus.BAD_REQUEST);
  }
  throw httpDe(resultado);
}

function httpDe(falha: FalhaCatalogo): HttpException {
  if (falha === 'ausente') return new HttpException({ message: 'Lugar não encontrado.' }, HttpStatus.NOT_FOUND);
  if (falha === 'slug') return new HttpException({ message: 'Já existe um lugar com esse slug.' }, HttpStatus.CONFLICT);
  if (falha === 'cidade') return new HttpException({ message: 'Cidade não encontrada.' }, HttpStatus.BAD_REQUEST);
  if (falha === 'categoria') return new HttpException({ message: 'Categoria não encontrada.' }, HttpStatus.BAD_REQUEST);
  if (falha === 'referencia') return new HttpException({ message: 'Já existe essa referência externa.' }, HttpStatus.CONFLICT);
  if (falha === 'em_uso') return new HttpException({ message: 'A categoria está em uso.' }, HttpStatus.CONFLICT);
  if (falha === 'mesmo') return new HttpException({ message: 'Escolha outro lugar.' }, HttpStatus.CONFLICT);
  return new HttpException({ message: 'Dados inválidos.' }, HttpStatus.BAD_REQUEST);
}

function corpo<T>(tipo: new () => T): ValidationPipe {
  return new ValidationPipe({
    expectedType: tipo,
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });
}

function ipDe(request: RequestComAdmin): string | null {
  const direto = (request.ip || request.socket?.remoteAddress || '').replace(/^::ffff:/, '').slice(0, 45);
  return direto || null;
}
