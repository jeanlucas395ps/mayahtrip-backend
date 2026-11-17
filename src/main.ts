import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { montarDocumentacao } from './common/docs/documentacao';
import { prepararAplicacao } from './common/http/preparar-aplicacao';
import { createLogger } from './common/logging/winston.factory';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    logger: createLogger(process.env.NODE_ENV ?? 'development'),
  });

  prepararAplicacao(app);

  const config = app.get(ConfigService);
  const port = config.get<number>('app.port', 3000);

  montarDocumentacao(app);
  await app.listen(port);
}

bootstrap();
