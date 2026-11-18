import { Inject, Injectable } from '@nestjs/common';
import {
  DeslocamentoNovo,
  DiaNovo,
  FalhaRoteiro,
  GeracaoLida,
  ParadaNova,
  PedidoDeGeracao,
  ROTEIRO,
  RoteiroLido,
  RoteiroRepositorio,
} from '../domain/roteiro.port';

@Injectable()
export class RoteiroUseCase {
  constructor(@Inject(ROTEIRO) private readonly roteiros: RoteiroRepositorio) {}

  ler(userId: string, viagemId: string): Promise<RoteiroLido | 'ausente'> {
    return this.roteiros.ler(userId, viagemId);
  }

  criarDia(userId: string, viagemId: string, dia: DiaNovo): Promise<RoteiroLido | FalhaRoteiro> {
    return this.roteiros.criarDia(userId, viagemId, dia);
  }

  criarParada(userId: string, viagemId: string, diaId: string, parada: ParadaNova): Promise<RoteiroLido | FalhaRoteiro> {
    return this.roteiros.criarParada(userId, viagemId, diaId, parada);
  }

  criarDeslocamento(
    userId: string,
    viagemId: string,
    diaId: string,
    deslocamento: DeslocamentoNovo,
  ): Promise<RoteiroLido | FalhaRoteiro> {
    return this.roteiros.criarDeslocamento(userId, viagemId, diaId, deslocamento);
  }

  marcarFeito(userId: string, viagemId: string, paradaId: string, feito: boolean): Promise<RoteiroLido | FalhaRoteiro> {
    return this.roteiros.marcarFeito(userId, viagemId, paradaId, feito);
  }

  gerar(userId: string, viagemId: string, pedido: PedidoDeGeracao): Promise<GeracaoLida | FalhaRoteiro> {
    return this.roteiros.gerar(userId, viagemId, pedido);
  }
}
