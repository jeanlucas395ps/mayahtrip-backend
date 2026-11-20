import { Inject, Injectable } from '@nestjs/common';
import { PERFIL_REPOSITORIO, PerfilRepositorio } from '../../domain/ports/perfil-repositorio.port';
import { Username } from '../../domain/value-objects/username.vo';

export interface VerificarUsernameDisponivelOutput {
  disponivel: boolean;
}

@Injectable()
export class VerificarUsernameDisponivelUseCase {
  constructor(@Inject(PERFIL_REPOSITORIO) private readonly perfis: PerfilRepositorio) {}

  async executar(usernameBruto: string): Promise<VerificarUsernameDisponivelOutput> {
    const username = new Username(usernameBruto);
    const existente = await this.perfis.buscarPorUsername(username.valor);
    return { disponivel: existente === null };
  }
}
