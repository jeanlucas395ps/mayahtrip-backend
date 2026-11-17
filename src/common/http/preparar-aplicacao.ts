import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';

/** Versão atual da API de produto. ADR 0003 e `.specs/051-versao-da-api.md`. */
export const VERSAO_API = '1';
export const VERSAO_URI = `v${VERSAO_API}`;

export function prepararAplicacao(app: INestApplication): void {
  // Rota de produto sem versão explícita entra em /v1. Uma rota futura
  // só sai da v1 quando declarar outra versão.
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: VERSAO_API,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
}
