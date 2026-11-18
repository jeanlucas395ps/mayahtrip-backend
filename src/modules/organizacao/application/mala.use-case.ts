import { Inject, Injectable } from '@nestjs/common';
import { FalhaMala, ItemMalaEditado, MALA, MalaRepositorio, MalasLidas } from '../domain/mala.port';

export interface EntradaDeItem {
  name: string;
  quantity?: number;
  notes?: string;
  isPacked?: boolean;
}

@Injectable()
export class MalaUseCase {
  constructor(@Inject(MALA) private readonly malas: MalaRepositorio) {}

  listar(userId: string, viagemId: string): Promise<MalasLidas | 'ausente'> {
    return this.malas.listar(userId, viagemId);
  }

  adicionar(userId: string, viagemId: string, participanteId: string, entrada: EntradaDeItem): Promise<MalasLidas | FalhaMala> {
    const nome = entrada.name.trim();
    if (!nome) return Promise.resolve('sumido');
    return this.malas.adicionar(userId, viagemId, participanteId, {
      name: nome,
      quantity: entrada.quantity ?? 1,
      notes: entrada.notes?.trim() || null,
    });
  }

  editar(userId: string, viagemId: string, itemId: string, entrada: EntradaDeItem): Promise<MalasLidas | FalhaMala> {
    const item = fechar(entrada);
    if (!item) return Promise.resolve('sumido');
    return this.malas.editar(userId, viagemId, itemId, item);
  }

  remover(userId: string, viagemId: string, itemId: string): Promise<MalasLidas | FalhaMala> {
    return this.malas.remover(userId, viagemId, itemId);
  }

  esvaziar(userId: string, viagemId: string, participanteId: string): Promise<MalasLidas | FalhaMala> {
    return this.malas.esvaziar(userId, viagemId, participanteId);
  }

  definirVistantes(userId: string, viagemId: string, participanteId: string, vistantes: string[]): Promise<MalasLidas | FalhaMala> {
    return this.malas.definirVistantes(userId, viagemId, participanteId, vistantes);
  }
}

function fechar(entrada: EntradaDeItem): ItemMalaEditado | null {
  const nome = entrada.name.trim();
  if (!nome || entrada.isPacked === undefined) return null;
  return { name: nome, quantity: entrada.quantity ?? 1, notes: entrada.notes?.trim() || null, isPacked: entrada.isPacked };
}
