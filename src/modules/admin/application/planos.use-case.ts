import { Inject, Injectable } from '@nestjs/common';
import { podeAtivar, podeDesativar, RecusaDePlano } from '../domain/regras-de-plano';
import { PLANOS, PlanosRepositorio, PrecoDePlano, PlanoGravado, FeatureDePlano } from './planos.repositorio';

export type Ciclo = 'free' | 'monthly' | 'yearly';

export interface SalvarPlano {
  code: string;
  name: string;
  description: string | null;
  isFree: boolean;
  currency: string | null;
  billingPeriod: Ciclo | null;
  amount: number | null;
  durationDays: number | null;
  features: FeatureDePlano[];
}

@Injectable()
export class PlanosUseCase {
  constructor(@Inject(PLANOS) private readonly planos: PlanosRepositorio) {}

  listar(): Promise<PlanoGravado[]> {
    return this.planos.listar();
  }

  async criar(entrada: SalvarPlano): Promise<{ tipo: 'criado'; plano: PlanoGravado } | { tipo: 'codigo_repetido' }> {
    const existente = await this.planos.porCodigo(entrada.code);
    if (existente) return { tipo: 'codigo_repetido' };
    const plano = await this.planos.criar({
      ...entrada,
      isActive: entrada.isFree,
    });
    return { tipo: 'criado', plano };
  }

  async editar(
    id: string,
    entrada: SalvarPlano,
  ): Promise<{ tipo: 'editado'; plano: PlanoGravado } | { tipo: 'nao_encontrado' } | { tipo: 'recusado'; motivo: RecusaDePlano }> {
    const atual = await this.planos.porId(id);
    if (!atual) return { tipo: 'nao_encontrado' };
    if (atual.isFree && !entrada.isFree) return { tipo: 'recusado', motivo: 'free_imutavel' };
    const plano = await this.planos.editar(id, entrada);
    return { tipo: 'editado', plano };
  }

  async ativar(id: string): Promise<{ tipo: 'ativado' } | { tipo: 'nao_encontrado' } | { tipo: 'recusado'; motivo: RecusaDePlano }> {
    const plano = await this.planos.porId(id);
    if (!plano) return { tipo: 'nao_encontrado' };
    const motivo = podeAtivar(plano);
    if (motivo) return { tipo: 'recusado', motivo };
    await this.planos.definirAtivo(id, true);
    return { tipo: 'ativado' };
  }

  async desativar(id: string): Promise<{ tipo: 'desativado' } | { tipo: 'nao_encontrado' } | { tipo: 'recusado'; motivo: RecusaDePlano }> {
    const plano = await this.planos.porId(id);
    if (!plano) return { tipo: 'nao_encontrado' };
    const motivo = podeDesativar(plano);
    if (motivo) return { tipo: 'recusado', motivo };
    await this.planos.definirAtivo(id, false);
    return { tipo: 'desativado' };
  }
}

export type { PlanoGravado, PrecoDePlano, FeatureDePlano };
