import { OrigemVisita } from '../visita';

export const VISITA_REPOSITORIO = Symbol('VISITA_REPOSITORIO');

export interface VisitaPais {
  id: string;
  paisId: string;
  nome: string;
  iso2: string | null;
  origem: OrigemVisita;
  viagemId: string | null;
  quando: string | null;
}

export interface VisitaCidade {
  id: string;
  cidadeId: string;
  paisId: string;
  nome: string;
  origem: OrigemVisita;
  viagemId: string | null;
  quando: string | null;
}

export interface Marcacao {
  userId: string;
  origem: OrigemVisita;
  viagemId: string | null;
  quando: string | null;
}

export interface ViagemParaMapa {
  id: string;
  donoId: string;
  encerrada: boolean;
  quando: string | null;
  destinos: { cidadeId: string; paisId: string }[];
}

export interface VisitaRepositorio {
  paisExiste(paisId: string): Promise<boolean>;
  cidade(cidadeId: string): Promise<{ paisId: string } | null>;
  listarPaises(userId: string, locale: string): Promise<VisitaPais[]>;
  listarCidades(userId: string, locale: string): Promise<VisitaCidade[]>;
  contarPlanejados(userId: string): Promise<number>;
  marcarPais(paisId: string, marcacao: Marcacao): Promise<void>;
  marcarCidade(cidadeId: string, marcacao: Marcacao): Promise<void>;
  removerPais(userId: string, paisId: string): Promise<'removido' | 'ausente' | 'viagem'>;
  removerCidade(userId: string, cidadeId: string): Promise<'removido' | 'ausente' | 'viagem'>;
  viagem(tripId: string): Promise<ViagemParaMapa | null>;
}
