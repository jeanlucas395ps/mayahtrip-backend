import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { ARMAZENAMENTO, ArmazenamentoDeArquivo } from '../../identidade/domain/ports/armazenamento.port';
import { VisitasUseCase } from '../../identidade/application/use-cases/visitas.use-case';
import {
  Carteira,
  CriarViagem,
  DestinoNovo,
  FalhaViagem,
  FiltroDaCarteira,
  ModoDeComeco,
  VIAGEM,
  ViagemLida,
  ViagemRepositorio,
} from '../domain/ports/viagem.port';

const LIMITE_BYTES = 10 * 1024 * 1024;
const MIMES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const DIAS_SEM_ROTEIRO = 14;

export interface NovaViagem {
  title?: string | null;
  description?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  durationDays?: number | null;
  startMode: ModoDeComeco;
  adultCount?: number;
  childCount?: number;
  budgetAmount?: number | null;
  budgetCurrency?: string | null;
  destinations: { cityId?: string | null; customName?: string | null }[];
}

@Injectable()
export class ViagemUseCase {
  constructor(
    @Inject(VIAGEM) private readonly viagens: ViagemRepositorio,
    @Inject(VisitasUseCase) private readonly visitas: VisitasUseCase,
    @Inject(ARMAZENAMENTO) private readonly arquivos: ArmazenamentoDeArquivo,
  ) {}

  async criar(donoId: string, entrada: NovaViagem): Promise<ViagemLida | FalhaViagem> {
    const pronta = await this.normalizar(entrada);
    if (typeof pronta === 'string') return pronta;
    const id = await this.viagens.criar({ ...pronta, ownerId: donoId });
    await this.visitas.registrarDaViagem(id);
    const ficha = await this.viagens.ficha(donoId, id);
    return ficha ?? 'ausente';
  }

  carteira(donoId: string, filtro: string | undefined): Promise<Carteira | 'filtro'> {
    if (filtro !== undefined && filtro !== '' && filtro !== 'todas' && filtro !== 'proximas' && filtro !== 'rascunhos') {
      return Promise.resolve('filtro');
    }
    const escolhido: FiltroDaCarteira = filtro === 'proximas' || filtro === 'rascunhos' ? filtro : 'todas';
    return this.viagens.carteira(donoId, escolhido);
  }

  async ficha(donoId: string, viagemId: string): Promise<ViagemLida | null> {
    return this.viagens.ficha(donoId, viagemId);
  }

  async guardarCapa(donoId: string, viagemId: string, bytes: Buffer, mime: string): Promise<ViagemLida | FalhaViagem> {
    if (!MIMES.has(mime) || bytes.length === 0 || bytes.length > LIMITE_BYTES) return 'capa';
    const chave = `viagens/${viagemId}/capa-${randomUUID()}`;
    await this.arquivos.guardar(chave, bytes, mime);
    const anterior = await this.viagens.guardarCapa(donoId, viagemId, chave);
    if (anterior === 'ausente' || anterior === 'proibido') {
      await this.arquivos.apagar(chave);
      return anterior;
    }
    if (anterior) await this.arquivos.apagar(anterior);
    const ficha = await this.viagens.ficha(donoId, viagemId);
    return ficha ?? 'ausente';
  }

  async renomear(userId: string, viagemId: string, participanteId: string, nome: string): Promise<ViagemLida | FalhaViagem> {
    const resultado = await this.viagens.renomear(userId, viagemId, participanteId, nome.trim());
    if (resultado !== 'ok') return resultado;
    const ficha = await this.viagens.ficha(userId, viagemId);
    return ficha ?? 'ausente';
  }

  async capa(donoId: string, viagemId: string): Promise<{ bytes: Buffer; mime: string } | 'ausente' | 'capa'> {
    const chave = await this.viagens.chaveDaCapa(donoId, viagemId);
    if (chave === 'ausente') return 'ausente';
    if (!chave) return 'capa';
    const arquivo = await this.arquivos.ler(chave);
    return arquivo ?? 'capa';
  }

  private async normalizar(entrada: NovaViagem): Promise<Omit<CriarViagem, 'ownerId'> | FalhaViagem> {
    const destinos = entrada.destinations.map((item) => ({
      cityId: item.cityId ?? null,
      customName: item.customName?.trim() || null,
    }));
    if (destinos.length === 0 || destinos.some((item) => !item.cityId && !item.customName)) return 'destino';
    const ids = destinos.flatMap((item) => (item.cityId ? [item.cityId] : []));
    const nomes = await this.viagens.nomesDasCidades(ids);
    if (!nomes) return 'cidade';

    const datas = await this.periodo(entrada);
    if (typeof datas === 'string') return datas;

    const valor = entrada.budgetAmount ?? null;
    const moeda = entrada.budgetCurrency?.trim().toUpperCase() || null;
    if ((valor === null) !== (moeda === null)) return 'orcamento';
    if (moeda && !(await this.viagens.moedaAtiva(moeda))) return 'moeda';

    const titulo = entrada.title?.trim() || juntar(destinos, nomes);
    if (!titulo || titulo.length > 255) return 'nome';

    return {
      title: titulo,
      description: entrada.description?.trim() || null,
      startDate: datas.startDate,
      endDate: datas.endDate,
      durationDays: datas.durationDays,
      startMode: entrada.startMode,
      adultCount: entrada.adultCount ?? 1,
      childCount: entrada.childCount ?? 0,
      budgetAmount: valor,
      budgetCurrency: moeda,
      destinations: destinos,
    };
  }

  private async periodo(entrada: NovaViagem): Promise<{ startDate: string | null; endDate: string | null; durationDays: number | null } | FalhaViagem> {
    const inicio = entrada.startDate ?? null;
    const fim = entrada.endDate ?? null;
    const duracao = entrada.durationDays ?? null;
    const comData = Boolean(inicio || fim);
    if (comData && (!inicio || !fim)) return 'data';
    if (!comData && duracao === null) return 'data';
    if (comData && duracao !== null) return 'data';

    const tetoCalendario = await this.viagens.teto('trip_calendar_max_days');
    const tetoFlexivel = await this.viagens.teto('trip_flexible_max_days');
    if (tetoCalendario === null || tetoFlexivel === null) return 'config';

    if (!inicio || !fim) {
      if (duracao === null || duracao > tetoFlexivel) return 'dias';
      if (duracao > DIAS_SEM_ROTEIRO && entrada.startMode !== 'from_scratch') return 'modo';
      return { startDate: null, endDate: null, durationDays: duracao };
    }

    if (fim < inicio) return 'data';
    const hoje = await this.viagens.hoje();
    if (inicio < hoje) return 'data';
    const dias = diasEntre(inicio, fim);
    if (dias > tetoCalendario) return 'dias';
    if (dias > DIAS_SEM_ROTEIRO && entrada.startMode !== 'from_scratch') return 'modo';
    return { startDate: inicio, endDate: fim, durationDays: null };
  }
}

function juntar(destinos: DestinoNovo[], nomes: Map<string, string>): string {
  return destinos.map((item) => (item.cityId ? nomes.get(item.cityId) : item.customName) ?? '').filter(Boolean).join(' e ');
}

function diasEntre(inicio: string, fim: string): number {
  const a = Date.parse(`${inicio}T00:00:00Z`);
  const b = Date.parse(`${fim}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000) + 1;
}
