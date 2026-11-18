import { Module, OnModuleInit, Logger, Inject } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { DataSource } from 'typeorm';
import { authConfig } from '../../config/auth.config';
import { IdentidadeModule } from '../identidade/identidade.module';
import { CatalogoAdminUseCase } from './application/catalogo-admin.use-case';
import { AdministradoresUseCase } from './application/administradores.use-case';
import { PLANOS } from './application/planos.repositorio';
import { PlanosUseCase } from './application/planos.use-case';
import { SessaoAdminUseCase } from './application/sessao-admin.use-case';
import { UsuariosUseCase } from './application/usuarios.use-case';
import { CATALOGO_ADMIN } from './domain/ports/catalogo-admin.port';
import { ADMINISTRADORES } from './domain/ports/administradores.port';
import { SESSAO_ADMIN } from './domain/ports/sessao-admin.port';
import { USUARIOS } from './domain/ports/usuarios.port';
import { CatalogoAdminPgRepositorio } from './infrastructure/persistence/catalogo-admin-pg.repositorio';
import { AdministradoresPgRepositorio } from './infrastructure/persistence/administradores-pg.repositorio';
import { PlanosPgRepositorio } from './infrastructure/persistence/planos-pg.repositorio';
import { SessaoAdminPgRepositorio } from './infrastructure/persistence/sessao-admin-pg.repositorio';
import { UsuariosPgRepositorio } from './infrastructure/persistence/usuarios-pg.repositorio';
import { CatalogoAdminController } from './interface/http/controllers/catalogo-admin.controller';
import { AdminController } from './interface/http/controllers/admin.controller';
import { AsaasWebhookController } from './interface/http/controllers/asaas-webhook.controller';
import { AdminGuard } from './interface/http/guards/admin.guard';

@Module({
  imports: [
    IdentidadeModule,
    JwtModule.registerAsync({
      inject: [authConfig.KEY],
      useFactory: (config: ConfigType<typeof authConfig>) => ({
        secret: config.jwtAccessSecret,
        signOptions: { expiresIn: config.jwtAccessTtlSeconds },
      }),
    }),
  ],
  controllers: [AdminController, CatalogoAdminController, AsaasWebhookController],
  providers: [
    PlanosUseCase,
    SessaoAdminUseCase,
    AdministradoresUseCase,
    UsuariosUseCase,
    CatalogoAdminUseCase,
    AdminGuard,
    { provide: PLANOS, useClass: PlanosPgRepositorio },
    { provide: SESSAO_ADMIN, useClass: SessaoAdminPgRepositorio },
    { provide: ADMINISTRADORES, useClass: AdministradoresPgRepositorio },
    { provide: USUARIOS, useClass: UsuariosPgRepositorio },
    { provide: CATALOGO_ADMIN, useClass: CatalogoAdminPgRepositorio },
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
