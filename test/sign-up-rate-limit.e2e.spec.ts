import { Controller, Get, INestApplication, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import request from 'supertest';
import { Repository } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module';
import { prepararAplicacao } from '../src/common/http/preparar-aplicacao';
import { REMETENTE_DE_EMAIL } from '../src/modules/identidade/domain/ports/remetente-de-email.port';
import { ContaOrmEntity } from '../src/modules/identidade/infrastructure/persistence/entities/conta.orm-entity';
import { randomUUID } from 'node:crypto';

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
  let contas: Repository<ContaOrmEntity>;
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
    contas = modulo.get(getRepositoryToken(ContaOrmEntity));
  });

  afterAll(async () => {
    await app.close();
  });

  it('AC-2, AC-3 e AC-5: acima do teto, cadastro, login e uma rota nova devolvem o mesmo erro e não executam', async () => {
    const primeira = await request(app.getHttpServer()).get('/v1/somente-no-teste-limite/ping');
    expect(primeira.status).toBe(200);

    const email = `limite-${randomUUID()}@exemplo.com`;
    const cadastro = await request(app.getHttpServer())
      .post('/v1/auth/sign-up')
      .send({ nome: 'Pessoa', email, senha: 'umaSenhaForte123', aceitouTermos: true });
    const login = await request(app.getHttpServer())
      .post('/v1/auth/sign-in')
      .send({ email, senha: 'umaSenhaForte123' });
    const rotaNova = await request(app.getHttpServer()).get('/v1/somente-no-teste-limite/ping');

    expect(cadastro.status).toBe(429);
    expect(login.status).toBe(429);
    expect(rotaNova.status).toBe(429);
    expect(cadastro.body.message).toBe(login.body.message);
    expect(rotaNova.body.message).toBe(login.body.message);
    expect(cadastro.body.statusCode).toBe(429);
    expect(await contas.findOne({ where: { email } })).toBeNull();
    expect(enviar).not.toHaveBeenCalled();

    const metricas = await request(app.getHttpServer()).get('/metrics');
    expect(metricas.status === 200 || metricas.status === 429).toBe(true);
    if (metricas.status === 200) {
      expect(metricas.text).toContain('http_rate_limit_rejections_total');
    }
  });
});
