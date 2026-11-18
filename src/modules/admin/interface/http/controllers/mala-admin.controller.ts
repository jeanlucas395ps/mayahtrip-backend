import { Body, Controller, Get, HttpException, HttpStatus, Inject, Param, Patch, Req, UseGuards, ValidationPipe } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { MalaAdminUseCase } from '../../../application/mala-admin.use-case';
import { SessaoAdminUseCase } from '../../../application/sessao-admin.use-case';
import { CategoriaDaMala } from '../../../domain/ports/mala-admin.port';
import { CategoriaMalaDto, ItemMalaDto } from '../dto/mala.dto';
import { AdminGuard, RequestComAdmin } from '../guards/admin.guard';

@ApiTags('admin')
@Controller('admin/packing')
@UseGuards(AdminGuard)
export class MalaAdminController {
  constructor(
    @Inject(MalaAdminUseCase) private readonly mala: MalaAdminUseCase,
    @Inject(SessaoAdminUseCase) private readonly sessoes: SessaoAdminUseCase,
  ) {}

  @Get()
  listar(): Promise<CategoriaDaMala[]> {
    return this.mala.listar();
  }

  @Patch('categories/:id')
  async editarCategoria(@Req() request: RequestComAdmin, @Param('id') id: string, @Body(corpo(CategoriaMalaDto)) dto: CategoriaMalaDto): Promise<CategoriaDaMala[]> {
    const lista = await this.mala.editarCategoria(id, dto);
    if (lista === 'ausente') throw new HttpException({ message: 'Categoria não encontrada.' }, HttpStatus.NOT_FOUND);
    await this.sessoes.auditar({
      adminId: request.adminId,
      action: 'packing.category.update',
      entityType: 'packing_category',
      entityId: id,
      oldValues: null,
      newValues: { name: dto.name, isActive: dto.isActive },
      ip: ipDe(request),
    });
    return lista;
  }

  @Patch('items/:id')
  async editarItem(@Req() request: RequestComAdmin, @Param('id') id: string, @Body(corpo(ItemMalaDto)) dto: ItemMalaDto): Promise<CategoriaDaMala[]> {
    const lista = await this.mala.editarItem(id, { ...dto, description: dto.description ?? null });
    if (lista === 'ausente') throw new HttpException({ message: 'Item não encontrado.' }, HttpStatus.NOT_FOUND);
    if (lista === 'categoria') throw new HttpException({ message: 'Categoria não encontrada.' }, HttpStatus.NOT_FOUND);
    await this.sessoes.auditar({
      adminId: request.adminId,
      action: 'packing.item.update',
      entityType: 'packing_catalog_item',
      entityId: id,
      oldValues: null,
      newValues: { name: dto.name, isDefault: dto.isDefault },
      ip: ipDe(request),
    });
    return lista;
  }
}

function corpo<T>(tipo: new () => T): ValidationPipe {
  return new ValidationPipe({ expectedType: tipo, whitelist: true, forbidNonWhitelisted: true, transform: true });
}

function ipDe(request: RequestComAdmin): string | null {
  const direto = (request.ip || request.socket?.remoteAddress || '').replace(/^::ffff:/, '').slice(0, 45);
  return direto || null;
}
