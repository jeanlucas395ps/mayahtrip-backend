import { Module } from '@nestjs/common';
import { ConfigModule, ConfigType } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { authConfig } from '../../config/auth.config';
import { storageConfig } from '../../config/storage.config';
import { signUpConfig } from '../../config/sign-up.config';
import { MetricsModule } from '../../common/logging/metrics.module';
import { ConfirmarContaUseCase, ReenviarCodigoUseCase } from './application/use-cases/confirmar-conta.use-case';
import { CriarContaUseCase, CODIGO_TTL_MINUTOS } from './application/use-cases/criar-conta.use-case';
import { EntrarComGoogleUseCase, EntrarComSenhaUseCase } from './application/use-cases/entrar.use-case';
import { EmitirHandoffUseCase, TrocarHandoffUseCase } from './application/use-cases/handoff.use-case';
import {
  ConferirCodigoDeSenhaUseCase,
  PedirCodigoDeSenhaUseCase,
  RedefinirSenhaUseCase,
} from './application/use-cases/recuperar-senha.use-case';
import { PerfilUseCase } from './application/use-cases/perfil.use-case';
import { DocumentoUseCase } from './application/use-cases/documento.use-case';
import { VisitasUseCase } from './application/use-cases/visitas.use-case';
import { PreferenciaUseCase } from './application/use-cases/preferencia.use-case';
import { SessaoDeAcesso } from './application/sessao-de-acesso';
import { ARMAZENAMENTO } from './domain/ports/armazenamento.port';
import { CODIGO_HANDOFF_REPOSITORIO } from './domain/ports/codigo-handoff-repositorio.port';
import { CONTA_REPOSITORIO } from './domain/ports/conta-repositorio.port';
import { DOCUMENTO_REPOSITORIO } from './domain/ports/documento-repositorio.port';
import { VISITA_REPOSITORIO } from './domain/ports/visita-repositorio.port';
import { HASH_DE_SENHA } from './domain/ports/hash-de-senha.port';
import { LISTA_DE_REVOGACAO } from './domain/ports/lista-de-revogacao.port';
import { LOCALIZADOR } from './domain/ports/localizador.port';
import { PERFIL_REPOSITORIO } from './domain/ports/perfil-repositorio.port';
import { PREFERENCIA_REPOSITORIO } from './domain/ports/preferencia-repositorio.port';
import { PREPARADOR_DE_AVATAR } from './domain/ports/preparador-de-avatar.port';
import { REMETENTE_DE_EMAIL } from './domain/ports/remetente-de-email.port';
import { RECUPERACAO_DE_SENHA_REPOSITORIO } from './domain/ports/recuperacao-de-senha-repositorio.port';
import { RELOGIO } from './domain/ports/relogio.port';
import { SESSAO_REPOSITORIO } from './domain/ports/sessao-repositorio.port';
import { VALIDADOR_TOKEN_GOOGLE } from './domain/ports/validador-token-google.port';
import { SmtpRemetenteDeEmailAdapter } from './infrastructure/email/smtp-remetente-de-email.adapter';
import { SharpPreparadorDeAvatar } from './infrastructure/image/sharp-preparador-de-avatar';
import { IpapiLocalizador } from './infrastructure/location/ipapi-localizador';
import { CodigoHandoffTypeOrmRepositorio } from './infrastructure/persistence/repositories/codigo-handoff-typeorm.repositorio';
import { ContaTypeOrmRepositorio } from './infrastructure/persistence/repositories/conta-typeorm.repositorio';
import { DocumentoTypeOrmRepositorio } from './infrastructure/persistence/repositories/documento-typeorm.repositorio';
import { VisitaTypeOrmRepositorio } from './infrastructure/persistence/repositories/visita-typeorm.repositorio';
import { PerfilTypeOrmRepositorio } from './infrastructure/persistence/repositories/perfil-typeorm.repositorio';
import { PreferenciaTypeOrmRepositorio } from './infrastructure/persistence/repositories/preferencia-typeorm.repositorio';
import { RecuperacaoDeSenhaTypeOrmRepositorio } from './infrastructure/persistence/repositories/recuperacao-de-senha-typeorm.repositorio';
import { SessaoTypeOrmRepositorio } from './infrastructure/persistence/repositories/sessao-typeorm.repositorio';
import { Argon2HashDeSenhaAdapter } from './infrastructure/security/argon2-hash-de-senha.adapter';
import { GoogleValidadorTokenAdapter } from './infrastructure/security/google-validador-token.adapter';
import { RedisListaDeRevogacao } from './infrastructure/security/redis-lista-de-revogacao.adapter';
import { GcsArmazenamento } from './infrastructure/storage/gcs-armazenamento.adapter';
import { SistemaRelogioAdapter } from './infrastructure/time/sistema-relogio.adapter';
import { AuthController } from './interface/http/controllers/auth.controller';
import { MeuPerfilController, PerfilPublicoController } from './interface/http/controllers/perfil.controller';
import { DocumentoController } from './interface/http/controllers/documento.controller';
import { VisitasController } from './interface/http/controllers/visitas.controller';
import { PreferenciaController } from './interface/http/controllers/preferencia.controller';
import { AccessTokenGuard, AccessTokenOpcionalGuard } from './interface/http/guards/access-token.guard';

@Module({
  imports: [
    ConfigModule.forFeature(storageConfig),
    MetricsModule,
    JwtModule.registerAsync({
      inject: [authConfig.KEY],
      useFactory: (config: ConfigType<typeof authConfig>) => ({
        secret: config.jwtAccessSecret,
        signOptions: { expiresIn: config.jwtAccessTtlSeconds },
      }),
    }),
  ],
  controllers: [AuthController, MeuPerfilController, PerfilPublicoController, PreferenciaController, DocumentoController, VisitasController],
  providers: [
    CriarContaUseCase,
    ConfirmarContaUseCase,
    ReenviarCodigoUseCase,
    EntrarComSenhaUseCase,
    EntrarComGoogleUseCase,
    EmitirHandoffUseCase,
    TrocarHandoffUseCase,
    PedirCodigoDeSenhaUseCase,
    ConferirCodigoDeSenhaUseCase,
    RedefinirSenhaUseCase,
    PerfilUseCase,
    PreferenciaUseCase,
    DocumentoUseCase,
    VisitasUseCase,
    SessaoDeAcesso,
    AccessTokenGuard,
    AccessTokenOpcionalGuard,
    { provide: CONTA_REPOSITORIO, useClass: ContaTypeOrmRepositorio },
    { provide: SESSAO_REPOSITORIO, useClass: SessaoTypeOrmRepositorio },
    { provide: PERFIL_REPOSITORIO, useClass: PerfilTypeOrmRepositorio },
    { provide: PREFERENCIA_REPOSITORIO, useClass: PreferenciaTypeOrmRepositorio },
    { provide: DOCUMENTO_REPOSITORIO, useClass: DocumentoTypeOrmRepositorio },
    { provide: VISITA_REPOSITORIO, useClass: VisitaTypeOrmRepositorio },
    { provide: LOCALIZADOR, useClass: IpapiLocalizador },
    { provide: ARMAZENAMENTO, useClass: GcsArmazenamento },
    { provide: PREPARADOR_DE_AVATAR, useClass: SharpPreparadorDeAvatar },
    { provide: RECUPERACAO_DE_SENHA_REPOSITORIO, useClass: RecuperacaoDeSenhaTypeOrmRepositorio },
    { provide: CODIGO_HANDOFF_REPOSITORIO, useClass: CodigoHandoffTypeOrmRepositorio },
    { provide: HASH_DE_SENHA, useClass: Argon2HashDeSenhaAdapter },
    { provide: REMETENTE_DE_EMAIL, useClass: SmtpRemetenteDeEmailAdapter },
    { provide: RELOGIO, useClass: SistemaRelogioAdapter },
    { provide: LISTA_DE_REVOGACAO, useClass: RedisListaDeRevogacao },
    { provide: VALIDADOR_TOKEN_GOOGLE, useClass: GoogleValidadorTokenAdapter },
    {
      provide: CODIGO_TTL_MINUTOS,
      inject: [signUpConfig.KEY],
      useFactory: (config: ConfigType<typeof signUpConfig>) => config.codeTtlMinutes,
    },
  ],
  exports: [SessaoDeAcesso, AccessTokenGuard, JwtModule, LISTA_DE_REVOGACAO, MetricsModule, ARMAZENAMENTO, VisitasUseCase],
})
export class IdentidadeModule {}
