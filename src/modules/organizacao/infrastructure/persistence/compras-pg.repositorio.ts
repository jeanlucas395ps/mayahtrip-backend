import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { visaoDe } from '../../../viagem/domain/visao';
import { CompraNova, ComprasRepositorio, FalhaCompra, ItemDeCompra, ListaDeCompras } from '../../domain/compras.port';
import { acessoDaViagem } from '../acesso';

interface LinhaCompra {
  id: string;
  name: string;
  quantity: number;
  estimated_price: string | null;
  currency: string | null;
  store_name: string | null;
  url: string | null;
  is_purchased: boolean;
  expense_id: string | null;
}

@Injectable()
export class ComprasPgRepositorio implements ComprasRepositorio {
  constructor(@Inject(DataSource) private readonly dados: DataSource) {}

  async listar(userId: string, viagemId: string): Promise<ListaDeCompras | FalhaCompra> {
    const acesso = await this.acesso(userId, viagemId);
    if (acesso !== 'ok') return acesso;
    return this.montar(viagemId);
  }

  async criar(userId: string, viagemId: string, item: CompraNova): Promise<ListaDeCompras | FalhaCompra> {
    const acesso = await this.acesso(userId, viagemId);
    if (acesso !== 'ok') return acesso;
    const moeda = item.estimatedPrice === null ? null : await moedaDeExibicao(this.dados, userId);
    await this.dados.query(
      `INSERT INTO organization.shopping_items
         (trip_id, created_by_user_id, name, quantity, estimated_price, currency, store_name, url, is_purchased)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [viagemId, userId, item.name, item.quantity, item.estimatedPrice, moeda, item.storeName, item.url, item.isPurchased],
    );
    return this.montar(viagemId);
  }

  async editar(userId: string, viagemId: string, itemId: string, item: CompraNova): Promise<ListaDeCompras | FalhaCompra> {
    const acesso = await this.acesso(userId, viagemId);
    if (acesso !== 'ok') return acesso;
    const moeda = item.estimatedPrice === null ? null : await moedaDeExibicao(this.dados, userId);
    const linhas = await this.dados.query<{ id: string }[]>(
      `UPDATE organization.shopping_items
       SET name = $3, quantity = $4, estimated_price = $5, currency = $6, store_name = $7, url = $8,
           is_purchased = $9, updated_at = clock_timestamp()
       WHERE id = $1 AND trip_id = $2
       RETURNING id`,
      [itemId, viagemId, item.name, item.quantity, item.estimatedPrice, moeda, item.storeName, item.url, item.isPurchased],
    );
    if (linhasRetornadas(linhas).length === 0) return 'sumido';
    return this.montar(viagemId);
  }

  async remover(userId: string, viagemId: string, itemId: string): Promise<ListaDeCompras | FalhaCompra> {
    const acesso = await this.acesso(userId, viagemId);
    if (acesso !== 'ok') return acesso;
    const linhas = await this.dados.query<{ id: string }[]>(
      `DELETE FROM organization.shopping_items WHERE id = $1 AND trip_id = $2 RETURNING id`,
      [itemId, viagemId],
    );
    if (linhasRetornadas(linhas).length === 0) return 'sumido';
    return this.montar(viagemId);
  }

  async vincularGasto(userId: string, viagemId: string, itemId: string): Promise<ListaDeCompras | FalhaCompra> {
    const acesso = await this.acesso(userId, viagemId);
    if (acesso !== 'ok') return acesso;
    const atuais = await this.dados.query<{ expense_id: string | null }[]>(
      `SELECT expense_id FROM organization.shopping_items WHERE id = $1 AND trip_id = $2`,
      [itemId, viagemId],
    );
    if (atuais.length === 0) return 'sumido';
    if (atuais[0].expense_id) return 'ligado';
    const linhas = await this.dados.query<{ id: string }[]>(
      `UPDATE organization.shopping_items
       SET expense_id = (
             SELECT id FROM finance.expenses
             WHERE trip_id = $2 AND created_by_user_id = $3 AND deleted_at IS NULL
             ORDER BY created_at DESC
             LIMIT 1
           ),
           is_purchased = true,
           updated_at = clock_timestamp()
       WHERE id = $1 AND trip_id = $2 AND expense_id IS NULL
       RETURNING id`,
      [itemId, viagemId, userId],
    );
    if (linhasRetornadas(linhas).length === 0) return 'sumido';
    return this.montar(viagemId);
  }

  private async acesso(userId: string, viagemId: string): Promise<'ok' | FalhaCompra> {
    const acesso = await acessoDaViagem(this.dados, viagemId, userId);
    if (acesso === 'ausente') return 'ausente';
    return visaoDe(acesso.role).edit ? 'ok' : 'proibido';
  }

  private async montar(viagemId: string): Promise<ListaDeCompras> {
    const linhas = await this.dados.query<LinhaCompra[]>(
      `SELECT id, name, quantity, estimated_price::text, currency, store_name, url, is_purchased, expense_id
       FROM organization.shopping_items
       WHERE trip_id = $1
       ORDER BY created_at, id`,
      [viagemId],
    );
    return {
      items: linhas.map((linha) => ({
        id: linha.id,
        name: linha.name,
        quantity: Number(linha.quantity),
        estimatedPrice: linha.estimated_price === null ? null : Number(linha.estimated_price),
        currency: linha.currency?.trim() || null,
        storeName: linha.store_name,
        url: linha.url,
        isPurchased: linha.is_purchased,
        expenseId: linha.expense_id,
      })),
    };
  }
}

async function moedaDeExibicao(dados: DataSource, userId: string): Promise<string> {
  const linhas = await dados.query<{ display_currency: string }[]>(
    `SELECT display_currency FROM identity.user_preferences WHERE user_id = $1`,
    [userId],
  );
  return linhas[0]?.display_currency?.trim() || 'BRL';
}

function linhasRetornadas<T>(resultado: T[] | [T[], number]): T[] {
  return Array.isArray(resultado[0]) ? resultado[0] : (resultado as T[]);
}
