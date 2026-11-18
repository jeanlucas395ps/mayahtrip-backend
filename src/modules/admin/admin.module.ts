import { Module, OnModuleInit, Logger, Inject } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { DataSource } from 'typeorm';
import { authConfig } from '../../config/auth.config';
import { AdministradoresUseCase } from './application/administradores.use-case';
import { PLANOS } from './application/planos.repositorio';
import { PlanosUseCase } from './application/planos.use-case';
import { SessaoAdminUseCase } from './application/sessao-admin.use-case';
import { ADMINISTRADORES } from './domain/ports/administradores.port';
import { SESSAO_ADMIN } from './domain/ports/sessao-admin.port';
import { AdministradoresPgRepositorio } from './infrastructure/persistence/administradores-pg.repositorio';
import { PlanosPgRepositorio } from './infrastructure/persistence/planos-pg.repositorio';
import { SessaoAdminPgRepositorio } from './infrastructure/persistence/sessao-admin-pg.repositorio';
import { AdminController } from './interface/http/controllers/admin.controller';
import { AsaasWebhookController } from './interface/http/controllers/asaas-webhook.controller';
import { AdminGuard } from './interface/http/guards/admin.guard';

@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [authConfig.KEY],
      useFactory: (config: ConfigType<typeof authConfig>) => ({
        secret: config.jwtAccessSecret,
        signOptions: { expiresIn: config.jwtAccessTtlSeconds },
      }),
    }),
  ],
  controllers: [AdminController, AsaasWebhookController],
  providers: [
    PlanosUseCase,
    SessaoAdminUseCase,
    AdministradoresUseCase,
    AdminGuard,
    { provide: PLANOS, useClass: PlanosPgRepositorio },
    { provide: SESSAO_ADMIN, useClass: SessaoAdminPgRepositorio },
    { provide: ADMINISTRADORES, useClass: AdministradoresPgRepositorio },
  ],
})
export class AdminModule implements OnModuleInit {
  private readonly log = new Logger(AdminModule.name);

  constructor(@Inject(DataSource) private readonly dados: DataSource) {}

  async onModuleInit(): Promise<void> {
    const email = process.env.ADMIN_EMAIL;
    const senha = process.env.ADMIN_PASSWORD;
    if (!email || !senha) return;

    try {
      const existentes = await this.dados.query<{ total: string }[]>(
        `SELECT count(*)::text AS total FROM admin.admin_users WHERE deleted_at IS NULL`,
      );
      if (Number(existentes[0]?.total ?? 0) > 0) return;
      const hash = await argon2.hash(senha, { type: argon2.argon2id });
      await this.dados.query(
        `INSERT INTO admin.admin_users (name, email, password_hash) VALUES ($1, $2, $3)`,
        ['Admin', email, hash],
      );
    } catch (erro) {
      this.log.warn(`Administrador inicial não foi criado: ${erro instanceof Error ? erro.name : 'erro'}`);
    }
  }
}
