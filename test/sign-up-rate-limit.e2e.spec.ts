import { randomUUID } from 'node:crypto';
import { Controller, Get, INestApplication, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module';
import { MetricsService } from '../src/common/logging/metrics.service';
import { prepararAplicacao } from '../src/common/http/preparar-aplicacao';
import { REMETENTE_DE_EMAIL } from '../src/modules/identidade/domain/ports/remetente-de-email.port';
import { lerConta } from './ler-conta';

@Controller('somente-no-teste-limite')
class RotaDoLimiteController {
  @Get('ping')
  ping(): { ok: true } {
    return { ok: true };
  }
}

@Module({ controllers: [RotaDoLimiteController] })
class RotaDoLimiteModule {}

/**
 * Spec 048: um guard só. O teto é injetado pelo teste e não é o número
 * de produção. O limite antigo só do cadastro (5/min) deixou de existir.
 */
describe('Limite de taxa único (048)', () => {
  let app: INestApplication;
  let dados: DataSource;
  let metricas: MetricsService;
  const enviar = vi.fn().mockResolvedValue(undefined);

  beforeAll(async () => {
    process.env.RATE_LIMIT_LIMITE = '1';
    process.env.RATE_LIMIT_JANELA_MS = '60000';

    const modulo = await Test.createTestingModule({ imports: [AppModule, RotaDoLimiteModule] })
      .overrideProvider(REMETENTE_DE_EMAIL)
      .useValue({ enviarCodigoDeVerificacao: enviar })
      .compile();

    app = modulo.createNestApplication();
    prepararAplicacao(app);
    await app.init();
    dados = modulo.get(DataSource);
    metricas = modulo.get(MetricsService);
  });

  afterAll(async () => {
    await app.close();
  });

  it('AC-2 a AC-5: acima do teto injetado, as rotas não executam e a métrica não leva segredo', async () => {
    const email = `limite-${randomUUID()}@exemplo.com`;
    const cadastro = await request(app.getHttpServer())
      .post('/v1/auth/sign-up')
      .send({ nome: 'Pessoa', email, senha: 'umaSenhaForte123', aceitouTermos: true });
    expect(cadastro.status).toBe(202);

    const confirmacao = await request(app.getHttpServer()).post('/v1/auth/confirm').send({ email, codigo: '0000' });
    const login = await request(app.getHttpServer()).post('/v1/auth/sign-in').send({ email, senha: 'umaSenhaForte123' });
    const rotaNova = await request(app.getHttpServer()).get('/v1/somente-no-teste-limite/ping');

    expect(confirmacao.status).toBe(429);
    expect(login.status).toBe(429);
    expect(rotaNova.status).toBe(429);
    expect(confirmacao.body.message).toBe('Limite de taxa excedido.');
    expect(login.body).toMatchObject({ message: confirmacao.body.message, statusCode: 429 });
    expect(rotaNova.body.message).toBe(confirmacao.body.message);
    expect((await lerConta(dados, email))?.attempts).toBe(0);
    expect(enviar).toHaveBeenCalledTimes(1);

    const texto = await metricas.metricsText();
    expect(texto).toContain('http_rate_limit_rejections_total');
    expect(texto).not.toContain('umaSenhaForte123');
  });
});
