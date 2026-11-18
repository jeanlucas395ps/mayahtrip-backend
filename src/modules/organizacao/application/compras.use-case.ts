import { Inject, Injectable } from '@nestjs/common';
import { EntradaDeGasto, GastosUseCase } from '../../financeiro/application/gastos.use-case';
import { FalhaGasto } from '../../financeiro/domain/gasto.port';
import { COMPRAS, CompraNova, ComprasRepositorio, FalhaCompra, ListaDeCompras } from '../domain/compras.port';

export type FalhaDaCompra = FalhaCompra | FalhaGasto;

@Injectable()
export class ComprasUseCase {
  constructor(
    @Inject(COMPRAS) private readonly compras: ComprasRepositorio,
    @Inject(GastosUseCase) private readonly gastos: GastosUseCase,
  ) {}

  listar(userId: string, viagemId: string): Promise<ListaDeCompras | FalhaCompra> {
    return this.compras.listar(userId, viagemId);
  }

  criar(userId: string, viagemId: string, item: CompraNova): Promise<ListaDeCompras | FalhaCompra> {
    return this.compras.criar(userId, viagemId, item);
  }

  editar(userId: string, viagemId: string, itemId: string, item: CompraNova): Promise<ListaDeCompras | FalhaCompra> {
    return this.compras.editar(userId, viagemId, itemId, item);
  }

  remover(userId: string, viagemId: string, itemId: string): Promise<ListaDeCompras | FalhaCompra> {
    return this.compras.remover(userId, viagemId, itemId);
  }

  async abrirGasto(userId: string, viagemId: string, itemId: string, gasto: EntradaDeGasto): Promise<ListaDeCompras | FalhaDaCompra> {
    const lista = await this.compras.listar(userId, viagemId);
    if (typeof lista === 'string') return lista;
    const item = lista.items.find((atual) => atual.id === itemId);
    if (!item) return 'sumido';
    if (item.expenseId) return 'ligado';
    const criado = await this.gastos.criar(userId, viagemId, gasto);
    if (typeof criado === 'string') return criado;
    return this.compras.vincularGasto(userId, viagemId, itemId);
  }
}
