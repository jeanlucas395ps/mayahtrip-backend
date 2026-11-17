import { randomBytes, randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { authConfig } from '../../../../config/auth.config';
import { CODIGO_HANDOFF_REPOSITORIO, CodigoHandoffRepositorio } from '../../domain/ports/codigo-handoff-repositorio.port';
import { RELOGIO, Relogio } from '../../domain/ports/relogio.port';
import { hashOpaco, ParDeTokens, SessaoDeAcesso } from '../sessao-de-acesso';

@Injectable()
export class EmitirHandoffUseCase {
  constructor(
    @Inject(CODIGO_HANDOFF_REPOSITORIO) private readonly repositorio: CodigoHandoffRepositorio,
    @Inject(RELOGIO) private readonly relogio: Relogio,
    @Inject(authConfig.KEY) private readonly config: ConfigType<typeof authConfig>,
  ) {}

  async executar(contaId: string): Promise<{ codigo: string }> {
    const codigo = randomBytes(32).toString('base64url');
    const agora = this.relogio.agora();
    await this.repositorio.salvar({
      id: randomUUID(),
      contaId,
      hashCodigo: hashOpaco(codigo),
      expiraEm: new Date(agora.getTime() + this.config.handoffTtlSegundos * 1000),
      usadoEm: null,
    });
    return { codigo };
  }
}

export type ResultadoTrocaHandoff = { tipo: 'ok'; tokens: ParDeTokens } | { tipo: 'recusado' };

@Injectable()
export class TrocarHandoffUseCase {
  constructor(
    @Inject(CODIGO_HANDOFF_REPOSITORIO) private readonly repositorio: CodigoHandoffRepositorio,
    @Inject(RELOGIO) private readonly relogio: Relogio,
    @Inject(SessaoDeAcesso) private readonly sessao: SessaoDeAcesso,
  ) {}

  async executar(codigo: string): Promise<ResultadoTrocaHandoff> {
    const gravado = await this.repositorio.buscarPorHash(hashOpaco(codigo));
    const agora = this.relogio.agora();
    if (!gravado || gravado.usadoEm || gravado.expiraEm.getTime() <= agora.getTime()) {
      return { tipo: 'recusado' };
    }

    await this.repositorio.marcarUsado(gravado.id, agora);
    const tokens = await this.sessao.emitir(gravado.contaId, true);
    return { tipo: 'ok', tokens };
  }
}
