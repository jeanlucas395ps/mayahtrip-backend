import { Inject, Injectable } from '@nestjs/common';
import { dataDeVisita, percentualDoMundo } from '../../domain/visita';
import { VISITA_REPOSITORIO, VisitaRepositorio } from '../../domain/ports/visita-repositorio.port';
import { OrigemVisita } from '../../domain/visita';

export class VisitaAusenteError extends Error {
  constructor() {
    super('ausente');
    this.name = 'VisitaAusenteError';
  }
}

export class VisitaDeViagemError extends Error {
  constructor() {
    super('viagem');
    this.name = 'VisitaDeViagemError';
  }
}

export interface MapaVisivel {
  paises: {
    id: string;
    paisId: string;
    nome: string;
    iso2: string | null;
    origem: 'manual' | 'viagem';
    viagemId: string | null;
    quando: string | null;
  }[];
  cidades: {
    id: string;
    cidadeId: string;
    paisId: string;
    nome: string;
    origem: 'manual' | 'viagem';
    viagemId: string | null;
    quando: string | null;
  }[];
  paisesVisitados: number;
  paisesPlanejados: number;
  percentualMundo: number;
  percentualComPlanejados: number;
}

@Injectable()
export class VisitasUseCase {
  constructor(@Inject(VISITA_REPOSITORIO) private readonly visitas: VisitaRepositorio) {}

  async ver(userId: string, locale: string): Promise<MapaVisivel> {
    const paises = await this.visitas.listarPaises(userId, locale);
    const cidades = await this.visitas.listarCidades(userId, locale);
    const planejados = await this.visitas.contarPlanejados(userId);
    return {
      paises: paises.map((pais) => ({ ...pais, origem: origemDe(pais.origem) })),
      cidades: cidades.map((cidade) => ({ ...cidade, origem: origemDe(cidade.origem) })),
      paisesVisitados: paises.length,
      paisesPlanejados: planejados,
      percentualMundo: percentualDoMundo(paises.length),
      percentualComPlanejados: percentualDoMundo(paises.length + planejados),
    };
  }

  async marcarPais(userId: string, paisId: string, quando: string | undefined): Promise<void> {
    if (!(await this.visitas.paisExiste(paisId))) throw new VisitaAusenteError();
    await this.visitas.marcarPais(paisId, { userId, origem: 'manual', viagemId: null, quando: dataDeVisita(quando) });
  }

  async marcarCidade(userId: string, cidadeId: string, quando: string | undefined): Promise<void> {
    const cidade = await this.visitas.cidade(cidadeId);
    if (!cidade) throw new VisitaAusenteError();
    const data = dataDeVisita(quando);
    await this.visitas.marcarCidade(cidadeId, { userId, origem: 'manual', viagemId: null, quando: data });
    if (await this.visitas.paisExiste(cidade.paisId)) {
      await this.visitas.marcarPais(cidade.paisId, { userId, origem: 'manual', viagemId: null, quando: data });
    }
  }

  async removerPais(userId: string, paisId: string): Promise<void> {
    if (!uuid(paisId)) throw new VisitaAusenteError();
    await this.concluirRemocao(await this.visitas.removerPais(userId, paisId));
  }

  async removerCidade(userId: string, cidadeId: string): Promise<void> {
    if (!uuid(cidadeId)) throw new VisitaAusenteError();
    await this.concluirRemocao(await this.visitas.removerCidade(userId, cidadeId));
  }

  /** O corte de viagem chama isto ao gravar a viagem. Viagem futura não entra na tabela. */
  async registrarDaViagem(tripId: string): Promise<void> {
    const viagem = await this.visitas.viagem(tripId);
    if (!viagem?.encerrada) return;
    for (const destino of viagem.destinos) {
      const marcacao = { userId: viagem.donoId, origem: 'trip' as const, viagemId: viagem.id, quando: viagem.quando };
      await this.visitas.marcarCidade(destino.cidadeId, marcacao);
      await this.visitas.marcarPais(destino.paisId, marcacao);
    }
  }

  private concluirRemocao(resultado: 'removido' | 'ausente' | 'viagem'): void {
    if (resultado === 'ausente') throw new VisitaAusenteError();
    if (resultado === 'viagem') throw new VisitaDeViagemError();
  }
}

function origemDe(origem: OrigemVisita): 'manual' | 'viagem' {
  return origem === 'trip' ? 'viagem' : 'manual';
}

function uuid(valor: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(valor);
}
