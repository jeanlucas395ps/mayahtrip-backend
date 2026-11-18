import { CanActivate, ExecutionContext, HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';

export interface RequestComAdmin extends Request {
  adminId: string;
}

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(@Inject(JwtService) private readonly jwt: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestComAdmin>();
    const cabecalho = request.header('authorization') ?? '';
    const token = cabecalho.startsWith('Bearer ') ? cabecalho.slice('Bearer '.length) : '';
    if (!token) throw naoAutorizado();

    try {
      const payload = await this.jwt.verifyAsync<{ sub?: string; tipo?: string }>(token);
      if (payload.tipo !== 'admin' || !payload.sub) throw naoAutorizado();
      request.adminId = payload.sub;
      return true;
    } catch (erro) {
      if (erro instanceof HttpException) throw erro;
      throw naoAutorizado();
    }
  }
}

function naoAutorizado(): HttpException {
  return new HttpException({ message: 'Não foi possível entrar.' }, HttpStatus.UNAUTHORIZED);
}
