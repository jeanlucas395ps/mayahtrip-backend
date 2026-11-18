import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module';
import { prepararAplicacao } from '../src/common/http/preparar-aplicacao';
import { ARMAZENAMENTO, ArmazenamentoDeArquivo } from '../src/modules/identidade/domain/ports/armazenamento.port';
import { REMETENTE_DE_EMAIL } from '../src/modules/identidade/domain/ports/remetente-de-email.port';

class MemoriaArmazenamento implements ArmazenamentoDeArquivo {
  async guardar(): Promise<void> {}
  async ler(): Promise<null> {
    return null;
  }
  async apagar(): Promise<void> {}
}

describe('Financeiro (e2e, Postgres real)', () => {
  let app: INestApplication;
  let dados: DataSource;
  const enviarCodigoDeVerificacao = vi.fn().mockResolvedValue(undefined);

  beforeAll(async () => {
    process.env.RATE_LIMIT_LIMITE = '1000';
    const modulo = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(REMETENTE_DE_EMAIL)
      .useValue({ enviarCodigoDeVerificacao, enviarConvite: vi.fn() })
      .overrideProvider(ARMAZENAMENTO)
      .useValue(new MemoriaArmazenamento())
      .compile();
    app = modulo.createNestApplication();
    prepararAplicacao(app);
    await app.init();
    dados = modulo.get(DataSource);
  });

  afterAll(async () => {
    await app.close();
  });

  it('lê as dez moedas de exibição, a moeda ativa do gasto e as dez categorias', async () => {
    const email = `fin-${randomUUID()}@exemplo.com`;
    expect((await request(app.getHttpServer()).post('/v1/auth/sign-up').send({ nome: 'Pessoa E2E', email, senha: 'umaSenhaForte123', aceitouTermos: true })).status).toBe(202);
    const codigo = enviarCodigoDeVerificacao.mock.calls.at(-1)?.[0].codigo as string;
    expect((await request(app.getHttpServer()).post('/v1/auth/confirm').send({ email, codigo })).status).toBe(200);
    const login = await request(app.getHttpServer()).post('/v1/auth/sign-in').send({ email, senha: 'umaSenhaForte123' });
    const auth = { Authorization: `Bearer ${login.body.accessToken}` };
    expect((await request(app.getHttpServer()).get('/v1/finance/currencies')).status).toBe(401);

    await dados.query(`INSERT INTO finance.currency_definitions (code, name, symbol, is_display, is_active) VALUES ('ZZZ', 'Moeda teste', 'Z', false, true)`);
    const exibicao = await request(app.getHttpServer()).get('/v1/finance/currencies').set(auth);
    const gasto = await request(app.getHttpServer()).get('/v1/finance/currencies').set(auth).query({ uso: 'gasto' });
    expect(exibicao.body).toHaveLength(10);
    expect(exibicao.body.map((item: { code: string }) => item.code)).not.toContain('ZZZ');
    expect(exibicao.body.map((item: { code: string }) => item.code)).toContain('BRL');
    expect(gasto.body.map((item: { code: string; display: boolean }) => item.code)).toContain('ZZZ');
    const gravada = await dados.query<{ name: string; is_display: boolean }[]>(`SELECT name, is_display FROM finance.currency_definitions WHERE code = 'ZZZ'`);
    expect(gravada[0]).toMatchObject({ name: 'Moeda teste', is_display: false });
    await dados.query(`DELETE FROM finance.currency_definitions WHERE code = 'ZZZ'`);

    const categorias = await request(app.getHttpServer()).get('/v1/finance/expense-categories').set(auth);
    expect(categorias.body.map((item: { slug: string }) => item.slug)).toEqual([
      'hospedagem',
      'transporte',
      'alimentacao',
      'atividades',
      'passeios',
      'compras',
      'transporte-local',
      'saude',
      'comunicacao',
      'outros',
    ]);
    const lida = await dados.query<{ name: string }[]>(`SELECT name FROM finance.expense_categories WHERE id = $1`, [categorias.body[2].id]);
    expect(lida[0].name).toBe('Alimentação');
  });
});
