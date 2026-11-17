import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module';
import { prepararAplicacao } from '../src/common/http/preparar-aplicacao';
import { REMETENTE_DE_EMAIL } from '../src/modules/identidade/domain/ports/remetente-de-email.port';

/**
 * AC-9 de `.specs/042-sign-up-api.md`, em arquivo próprio: precisa de um
 * app isolado, com o limite de taxa real proposto em D-3 (5/min por IP),
 * sem chamadas de outros testes contando para a mesma janela.
 */
describe('POST /v1/auth/sign-up — limite de taxa (e2e, Postgres real)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    delete process.env.SIGN_UP_RATE_LIMIT_PER_MINUTE; // usa o padrão proposto: 5/min

    const moduloDeTeste = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(REMETENTE_DE_EMAIL)
      .useValue({ enviarCodigoDeVerificacao: vi.fn().mockResolvedValue(undefined) })
      .compile();

    app = moduloDeTeste.createNestApplication();
    prepararAplicacao(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('AC-9: a 6ª chamada no mesmo minuto, do mesmo IP, é recusada (limite proposto de 5/min, D-3)', async () => {
    const chamar = () =>
      request(app.getHttpServer())
        .post('/v1/auth/sign-up')
        .send({ nome: 'Pessoa', email: `e2e-${randomUUID()}@exemplo.com`, senha: 'umaSenhaForte123', aceitouTermos: true });

    const cincoChamadas = await Promise.all([chamar(), chamar(), chamar(), chamar(), chamar()]);
    cincoChamadas.forEach((resposta) => expect(resposta.status).toBe(202));

    const sexta = await chamar();
    expect(sexta.status).toBe(429);
  });
});
