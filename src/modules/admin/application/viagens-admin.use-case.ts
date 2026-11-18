import { Inject, Injectable } from '@nestjs/common';
import { FiltroDeViagem, VIAGENS_ADMIN, ViagemAdmin, ViagensAdminRepositorio } from '../domain/ports/viagens-admin.port';

@Injectable()
export class ViagensAdminUseCase {
  constructor(@Inject(VIAGENS_ADMIN) private readonly viagens: ViagensAdminRepositorio) {}

  listar(filtro: FiltroDeViagem): Promise<ViagemAdmin[] | 'filtro'> {
    return this.viagens.listar(filtro);
  }

  ficha(id: string): Promise<ViagemAdmin | null> {
    return this.viagens.ficha(id);
  }

  ativar(id: string, ativa: boolean): Promise<'ok' | 'ausente'> {
    return this.viagens.ativar(id, ativa);
  }

  visibilidade(id: string, visibility: 'private' | 'public'): Promise<'ok' | 'ausente'> {
    return this.viagens.visibilidade(id, visibility);
  }

  excluir(id: string): Promise<'ok' | 'ausente'> {
    return this.viagens.excluir(id);
  }
}
