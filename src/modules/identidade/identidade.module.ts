import { Module } from '@nestjs/common';
import { ConfigModule, ConfigType } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { signUpConfig } from '../../config/sign-up.config';
import { CriarContaUseCase, CODIGO_TTL_MINUTOS } from './application/use-cases/criar-conta.use-case';
import { CONTA_REPOSITORIO } from './domain/ports/conta-repositorio.port';
import { HASH_DE_SENHA } from './domain/ports/hash-de-senha.port';
import { REMETENTE_DE_EMAIL } from './domain/ports/remetente-de-email.port';
import { RELOGIO } from './domain/ports/relogio.port';
import { ContaOrmEntity } from './infrastructure/persistence/entities/conta.orm-entity';
import { ContaTypeOrmRepositorio } from './infrastructure/persistence/repositories/conta-typeorm.repositorio';
import { Argon2HashDeSenhaAdapter } from './infrastructure/security/argon2-hash-de-senha.adapter';
import { SmtpRemetenteDeEmailAdapter } from './infrastructure/email/smtp-remetente-de-email.adapter';
import { SistemaRelogioAdapter } from './infrastructure/time/sistema-relogio.adapter';
import { AuthController } from './interface/http/controllers/auth.controller';

@Module({
  imports: [ConfigModule, TypeOrmModule.forFeature([ContaOrmEntity])],
  controllers: [AuthController],
  providers: [
    CriarContaUseCase,
    { provide: CONTA_REPOSITORIO, useClass: ContaTypeOrmRepositorio },
    { provide: HASH_DE_SENHA, useClass: Argon2HashDeSenhaAdapter },
    { provide: REMETENTE_DE_EMAIL, useClass: SmtpRemetenteDeEmailAdapter },
    { provide: RELOGIO, useClass: SistemaRelogioAdapter },
    {
      provide: CODIGO_TTL_MINUTOS,
      inject: [signUpConfig.KEY],
      useFactory: (config: ConfigType<typeof signUpConfig>) => config.codeTtlMinutes,
    },
  ],
})
export class IdentidadeModule {}
