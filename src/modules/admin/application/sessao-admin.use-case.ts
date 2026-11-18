import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { authConfig } from '../../../config/auth.config';
import { AuditoriaAdmin, SESSAO_ADMIN, SessaoAdminRepositorio } from '../domain/ports/sessao-admin.port';
import { hashDeTokenAdmin } from '../domain/token-admin';

@Injectable()
export class SessaoAdminUseCase {
  constructor(
    @Inject(SESSAO_ADMIN) private readonly sessoes: SessaoAdminRepositorio,
    @Inject(JwtService) private readonly jwt: JwtService,
    @Inject(authConfig.KEY) private readonly config: ConfigType<typeof authConfig>,
  ) {}

  async entrar(email: string, senha: string, ip: string | null): Promise<string | null> {
    const normalizado = email.trim().toLowerCase();
    const admin = await this.sessoes.buscarAtivo(normalizado);
    const senhaConfere = admin ? await argon2.verify(admin.passwordHash, senha).catch(() => false) : false;
    await this.sessoes.registrarTentativa(normalizado, ip, Boolean(admin && senhaConfere));
    if (!admin || !senhaConfere) return null;

    const accessToken = await this.jwt.signAsync({ sub: admin.id, tipo: 'admin' });
    const expira = new Date(Date.now() + this.config.jwtAccessTtlSeconds * 1000);
    await this.sessoes.abrirSessao(admin.id, hashDeTokenAdmin(accessToken), ip, expira);
    await this.sessoes.marcarEntrada(admin.id);
    await this.sessoes.auditar({
      adminId: admin.id,
      action: 'admin.sign_in',
      entityType: 'admin_user',
      entityId: admin.id,
      oldValues: null,
      newValues: null,
      ip,
    });
    return accessToken;
  }

  async sair(token: string, ip: string | null, adminId: string): Promise<boolean> {
    const revogou = await this.sessoes.revogar(hashDeTokenAdmin(token));
    if (!revogou) return false;
    await this.sessoes.auditar({
      adminId,
      action: 'admin.sign_out',
      entityType: 'admin_user',
      entityId: adminId,
      oldValues: null,
      newValues: null,
      ip,
    });
    return true;
  }

  auditar(registro: AuditoriaAdmin): Promise<void> {
    return this.sessoes.auditar(registro);
  }
}
