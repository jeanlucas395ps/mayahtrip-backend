import { CanActivate, ExecutionContext, HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { SESSAO_ADMIN, SessaoAdminRepositorio } from '../../../domain/ports/sessao-admin.port';
import { hashDeTokenAdmin } from '../../../domain/token-admin';

export interface RequestComAdmin extends Request {
  adminId: string;
}

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(
    @Inject(JwtService) private readonly jwt: JwtService,
    @Inject(SESSAO_ADMIN) private readonly sessoes: SessaoAdminRepositorio,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestComAdmin>();
    const token = tokenDe(request);
    if (!token) throw naoAutorizado();

    try {
      const payload = await this.jwt.verifyAsync<{ sub?: string; tipo?: string }>(token);
      if (payload.tipo !== 'admin' || !payload.sub) throw naoAutorizado();
      const adminId = await this.sessoes.sessaoAtiva(hashDeTokenAdmin(token));
      if (adminId !== payload.sub) throw naoAutorizado();
      request.adminId = adminId;
      return true;
    } catch (erro) {
      if (erro instanceof HttpException) throw erro;
      throw naoAutorizado();
    }
  }
}

export function tokenDe(request: Request): string {
  const cabecalho = request.header('authorization') ?? '';
  return cabecalho.startsWith('Bearer ') ? cabecalho.slice('Bearer '.length).trim() : '';
}

function naoAutorizado(): HttpException {
  return new HttpException({ message: 'Não foi possível entrar.' }, HttpStatus.UNAUTHORIZED);
}
