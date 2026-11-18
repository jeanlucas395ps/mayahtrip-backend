import { createHash } from 'node:crypto';
import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule, ConfigService, ConfigType } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { LimiteDeTaxaGuard } from './common/http/limite-de-taxa.guard';
import { TypeOrmModule } from '@nestjs/typeorm';
import { appConfig } from './config/app.config';
import { authConfig } from './config/auth.config';
import { databaseConfig, DatabaseConfig } from './config/database.config';
import { emailConfig } from './config/email.config';
import { rateLimitConfig } from './config/rate-limit.config';
import { readmeConfig } from './config/readme.config';
import { redisConfig } from './config/redis.config';
import { signUpConfig } from './config/sign-up.config';
import { validationSchema } from './config/validation.schema';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { CorrelationIdMiddleware } from './common/logging/correlation-id.middleware';
import { MetricsInterceptor } from './common/logging/metrics.interceptor';
import { MetricsModule } from './common/logging/metrics.module';
import { AdminModule } from './modules/admin/admin.module';
import { AssinaturaModule } from './modules/assinatura/assinatura.module';
import { MayaModule } from './modules/maya/maya.module';
import { CatalogoModule } from './modules/catalogo/catalogo.module';
import { ComunidadeModule } from './modules/comunidade/comunidade.module';
import { GeografiaModule } from './modules/geografia/geografia.module';
import { IdentidadeModule } from './modules/identidade/identidade.module';
import { FinanceiroModule } from './modules/financeiro/financeiro.module';
import { NotificacaoModule } from './modules/notificacao/notificacao.module';
import { OrganizacaoModule } from './modules/organizacao/organizacao.module';
import { PlataformaModule } from './modules/plataforma/plataforma.module';
import { RoteiroModule } from './modules/roteiro/roteiro.module';
import { ViagemModule } from './modules/viagem/viagem.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig, databaseConfig, authConfig, emailConfig, signUpConfig, readmeConfig, redisConfig, rateLimitConfig],
      validationSchema,
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres' as const,
        ...config.get<DatabaseConfig>('database'),
        // Entidades vêm de `TypeOrmModule.forFeature` em cada módulo; a
        // migration roda por script separado (`scripts/run-migrations.ts`
        // + `src/data-source.ts`), nunca por este DataSource da aplicação.
        autoLoadEntities: true,
        synchronize: false,
        migrationsRun: false,
      }),
    }),
    ThrottlerModule.forRootAsync({
      inject: [rateLimitConfig.KEY],
      useFactory: (config: ConfigType<typeof rateLimitConfig>) => [
        {
          ttl: config.janelaMs,
          limit: config.limite,
          // Um contador para a API inteira. A chave continua a do
          // cliente que a biblioteca já usa; o produto ainda não fechou
          // se é IP, conta ou token.
          generateKey: (_context: unknown, suffix: string, name: string) =>
            createHash('sha256').update(`${name}:${suffix}`).digest('hex'),
        },
      ],
    }),
    MetricsModule,
    IdentidadeModule,
    AdminModule,
    GeografiaModule,
    CatalogoModule,
    ViagemModule,
    RoteiroModule,
    FinanceiroModule,
    OrganizacaoModule,
    NotificacaoModule,
    ComunidadeModule,
    MayaModule,
    AssinaturaModule,
    PlataformaModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR, useClass: MetricsInterceptor },
    // 048: um único guard. Nenhuma rota registra o próprio limite.
    { provide: APP_GUARD, useClass: LimiteDeTaxaGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(CorrelationIdMiddleware).forRoutes('*');
  }
}
