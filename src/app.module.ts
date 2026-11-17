import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { appConfig } from './config/app.config';
import { authConfig } from './config/auth.config';
import { databaseConfig, DatabaseConfig } from './config/database.config';
import { emailConfig } from './config/email.config';
import { readmeConfig } from './config/readme.config';
import { signUpConfig } from './config/sign-up.config';
import { validationSchema } from './config/validation.schema';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { CorrelationIdMiddleware } from './common/logging/correlation-id.middleware';
import { MetricsInterceptor } from './common/logging/metrics.interceptor';
import { MetricsModule } from './common/logging/metrics.module';
import { IdentidadeModule } from './modules/identidade/identidade.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig, databaseConfig, authConfig, emailConfig, signUpConfig, readmeConfig],
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
    // security-rate-limiting (nestjs-best-practices): limite geral; cada
    // endpoint sensível sobrescreve com @Throttle (ex.: sign-up-api D-3).
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    MetricsModule,
    IdentidadeModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR, useClass: MetricsInterceptor },
    // Sem isto, @Throttle é só metadado sem efeito (AC-9, 042-sign-up-api.md).
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(CorrelationIdMiddleware).forRoutes('*');
  }
}
