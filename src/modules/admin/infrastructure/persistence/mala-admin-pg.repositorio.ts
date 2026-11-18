import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { CategoriaDaMala, CategoriaDaMalaNova, ItemDaMalaNovo, MalaAdminRepositorio } from '../../domain/ports/mala-admin.port';

@Injectable()
export class MalaAdminPgRepositorio implements MalaAdminRepositorio {
  constructor(@Inject(DataSource) private readonly dados: DataSource) {}

  listar(): Promise<CategoriaDaMala[]> {
    return this.montar();
  }

  async editarCategoria(id: string, categoria: CategoriaDaMalaNova): Promise<CategoriaDaMala[] | 'ausente'> {
    const linhas = linhasDe(await this.dados.query(`UPDATE organization.packing_categories SET name = $2, sort_order = $3, is_active = $4 WHERE id = $1 RETURNING id`, [id, categoria.name, categoria.sortOrder, categoria.isActive]));
    if (linhas.length === 0) return 'ausente';
    return this.montar();
  }

  async editarItem(id: string, item: ItemDaMalaNovo): Promise<CategoriaDaMala[] | 'ausente' | 'categoria'> {
    const categorias = await this.dados.query<{ id: string }[]>(`SELECT id FROM organization.packing_categories WHERE id = $1`, [item.categoryId]);
    if (categorias.length === 0) return 'categoria';
    const linhas = linhasDe(
      await this.dados.query(
        `UPDATE organization.packing_catalog_items
         SET category_id = $2, name = $3, description = $4, is_default = $5, sort_order = $6
         WHERE id = $1 RETURNING id`,
        [id, item.categoryId, item.name, item.description, item.isDefault, item.sortOrder],
      ),
    );
    if (linhas.length === 0) return 'ausente';
    return this.montar();
  }

  private async montar(): Promise<CategoriaDaMala[]> {
    const categorias = await this.dados.query<{ id: string; name: string; sort_order: number; is_active: boolean }[]>(
      `SELECT id, name, sort_order, is_active FROM organization.packing_categories ORDER BY sort_order, name`,
    );
    const itens = await this.dados.query<{ id: string; category_id: string; name: string; description: string | null; is_default: boolean; sort_order: number }[]>(
      `SELECT id, category_id, name, description, is_default, sort_order FROM organization.packing_catalog_items ORDER BY sort_order, name`,
    );
    return categorias.map((categoria) => ({
      id: categoria.id,
      name: categoria.name,
      sortOrder: categoria.sort_order,
      isActive: categoria.is_active,
      items: itens
        .filter((item) => item.category_id === categoria.id)
        .map((item) => ({
          id: item.id,
          name: item.name,
          description: item.description,
          isDefault: item.is_default,
          sortOrder: item.sort_order,
        })),
    }));
  }
}

function linhasDe<T>(resultado: T[] | [T[], number]): T[] {
  return Array.isArray(resultado[0]) ? resultado[0] : (resultado as T[]);
}
