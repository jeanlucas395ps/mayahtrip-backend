import { Inject, Injectable } from '@nestjs/common';
import { CategoriaDaMala, CategoriaDaMalaNova, ItemDaMalaNovo, MALA_ADMIN, MalaAdminRepositorio } from '../domain/ports/mala-admin.port';

@Injectable()
export class MalaAdminUseCase {
  constructor(@Inject(MALA_ADMIN) private readonly mala: MalaAdminRepositorio) {}

  listar(): Promise<CategoriaDaMala[]> {
    return this.mala.listar();
  }

  editarCategoria(id: string, categoria: CategoriaDaMalaNova): Promise<CategoriaDaMala[] | 'ausente'> {
    return this.mala.editarCategoria(id, { ...categoria, name: categoria.name.trim() });
  }

  editarItem(id: string, item: ItemDaMalaNovo): Promise<CategoriaDaMala[] | 'ausente' | 'categoria'> {
    return this.mala.editarItem(id, { ...item, name: item.name.trim(), description: item.description?.trim() || null });
  }
}
