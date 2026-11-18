import { CanActivate, ExecutionContext, HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { MetricsService } from '../../../../../common/logging/metrics.service';
import { LISTA_DE_REVOGACAO, ListaDeRevogacao } from '../../../domain/ports/lista-de-revogacao.port';

export interface RequestComConta extends Request {
  contaId: string;
  accessJti: string;
}

export interface RequestComContaOpcional extends Request {
  contaId: string | null;
}

/**
 * ADR 0001 / 044 D-7: valida assinatura e expiração do JWT e consulta o
 * Redis só para a lista de jti. Não lê a sessão no Postgres.
 * Redis fora do ar recusa o token (falha fechada) — a pergunta de
 * produto sobre falha aberta continua em aberto.
 */
@Injectable()
export class AccessTokenGuard implements CanActivate {
  constructor(
    @Inject(JwtService) private readonly jwt: JwtService,
    @Inject(LISTA_DE_REVOGACAO) private readonly revogacao: ListaDeRevogacao,
    @Inject(MetricsService) private readonly metrics: MetricsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestComConta>();
    const identidade = await lerAccess(request, this.jwt, this.revogacao, this.metrics);
    request.contaId = identidade.contaId;
    request.accessJti = identidade.jti;
    return true;
  }
}

/** Perfil público: sem token, a leitura segue anônima. Token inválido continua 401. */
@Injectable()
export class AccessTokenOpcionalGuard implements CanActivate {
  constructor(
    @Inject(JwtService) private readonly jwt: JwtService,
    @Inject(LISTA_DE_REVOGACAO) private readonly revogacao: ListaDeRevogacao,
    @Inject(MetricsService) private readonly metrics: MetricsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestComContaOpcional>();
    const cabecalho = request.header('authorization') ?? '';
    if (!cabecalho.startsWith('Bearer ') || cabecalho.length === 'Bearer '.length) {
      request.contaId = null;
      return true;
    }
    const identidade = await lerAccess(request, this.jwt, this.revogacao, this.metrics);
    request.contaId = identidade.contaId;
    return true;
  }
}

async function lerAccess(
  request: Request,
  jwt: JwtService,
  revogacao: ListaDeRevogacao,
  metrics: MetricsService,
): Promise<{ contaId: string; jti: string }> {
  const cabecalho = request.header('authorization') ?? '';
  const token = cabecalho.startsWith('Bearer ') ? cabecalho.slice('Bearer '.length) : '';
  if (!token) {
    throw naoAutorizado();
  }

  let payload: { sub?: string; jti?: string };
  try {
    payload = await jwt.verifyAsync(token);
  } catch {
    throw naoAutorizado();
  }

  if (!payload.sub || !payload.jti) {
    throw naoAutorizado();
  }

  let revogado = false;
  try {
    revogado = await revogacao.estaRevogado(payload.jti);
  } catch {
    throw naoAutorizado();
  }

  if (revogado) {
    metrics.rejeicoesPorRevogacao.inc();
    throw naoAutorizado();
  }

  return { contaId: payload.sub, jti: payload.jti };
}

function naoAutorizado(): HttpException {
  return new HttpException({ message: 'Não foi possível entrar.' }, HttpStatus.UNAUTHORIZED);
}
