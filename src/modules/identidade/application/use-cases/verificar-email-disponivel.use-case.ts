import { Inject, Injectable } from '@nestjs/common';
import { CONTA_REPOSITORIO, ContaRepositorio } from '../../domain/ports/conta-repositorio.port';
import { Email } from '../../domain/value-objects/email.vo';

export interface VerificarEmailDisponivelOutput {
  /** `false` só quando já existe conta confirmada com esse e-mail. */
  disponivel: boolean;
}

/**
 * Checagem usada no focus-out do cadastro.
 * Conta pendente ainda pode concluir o fluxo — conta como disponível.
 */
@Injectable()
export class VerificarEmailDisponivelUseCase {
  constructor(@Inject(CONTA_REPOSITORIO) private readonly repositorio: ContaRepositorio) {}

  async executar(emailBruto: string): Promise<VerificarEmailDisponivelOutput> {
    const email = new Email(emailBruto);
    const existente = await this.repositorio.buscarPorEmail(email);
    if (!existente) {
      return { disponivel: true };
    }
    return { disponivel: existente.estado !== 'confirmada' };
  }
}
