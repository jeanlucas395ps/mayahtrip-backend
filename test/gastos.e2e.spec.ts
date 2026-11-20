import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module';
import { prepararAplicacao } from '../src/common/http/preparar-aplicacao';
import { CAMBIO } from '../src/modules/financeiro/domain/financeiro.port';
import { ARMAZENAMENTO, ArmazenamentoDeArquivo } from '../src/modules/identidade/domain/ports/armazenamento.port';
import { REMETENTE_DE_EMAIL } from '../src/modules/identidade/domain/ports/remetente-de-email.port';

class MemoriaArmazenamento implements ArmazenamentoDeArquivo {
  readonly objetos = new Map<string, { bytes: Buffer; mime: string }>();
  async guardar(chave: string, bytes: Buffer, mime: string): Promise<void> {
    this.objetos.set(chave, { bytes: Buffer.from(bytes), mime });
  }
  async ler(chave: string): Promise<{ bytes: Buffer; mime: string } | null> {
    return this.objetos.get(chave) ?? null;
  }
  async apagar(chave: string): Promise<void> {
    this.objetos.delete(chave);
  }
}

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

describe('Gastos (e2e, Postgres real)', () => {
  let app: INestApplication;
  let dados: DataSource;
  const armazenamento = new MemoriaArmazenamento();
  const enviarCodigoDeVerificacao = vi.fn().mockResolvedValue({ entregue: true });
  const taxa = vi.fn<(base: string, alvo: string, data: string) => Promise<number | null>>().mockResolvedValue(5);

  beforeAll(async () => {
    process.env.RATE_LIMIT_LIMITE = '1000';
    const modulo = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(REMETENTE_DE_EMAIL)
      .useValue({ enviarCodigoDeVerificacao, enviarConvite: vi.fn() })
      .overrideProvider(ARMAZENAMENTO)
      .useValue(armazenamento)
      .overrideProvider(CAMBIO)
      .useValue({ taxa })
      .compile();
    app = modulo.createNestApplication();
    prepararAplicacao(app);
    await app.init();
    dados = modulo.get(DataSource);
  });

  afterAll(async () => {
    await dados.query(`DELETE FROM finance.exchange_rates WHERE base_currency = 'USD' AND target_currency = 'BRL' AND rate_date = CURRENT_DATE`);
    await app.close();
  });

  it('lança, divide, anexa o recibo, acerta e desfaz', async () => {
    const dono = await entrar(app, enviarCodigoDeVerificacao);
    const junior = await entrar(app, enviarCodigoDeVerificacao);
    const auth = { Authorization: `Bearer ${dono.access}` };
    const marca = randomUUID().slice(0, 8);
    const paisId = randomUUID();
    const cidadeId = randomUUID();
    await dados.query(`INSERT INTO geography.countries (id, name) VALUES ($1, $2)`, [paisId, `Pais ${marca}`]);
    await dados.query(`INSERT INTO geography.cities (id, country_id, name) VALUES ($1, $2, $3)`, [cidadeId, paisId, `Cidade ${marca}`]);
    const hoje = String((await dados.query<{ hoje: string }[]>(`SELECT CURRENT_DATE::text AS hoje`))[0].hoje).slice(0, 10);
    const criada = await request(app.getHttpServer())
      .post('/v1/trips')
      .set(auth)
      .send({ title: `Gasto ${marca}`, startDate: somar(hoje, 3), endDate: somar(hoje, 5), startMode: 'from_scratch', adultCount: 2, budgetAmount: 200, budgetCurrency: 'BRL', destinations: [{ cityId: cidadeId }] });
    expect(criada.status).toBe(201);
    const donoId = criada.body.participants[0].id as string;
    const outroId = criada.body.participants[1].id as string;
    await dados.query(
      `INSERT INTO travel.trip_participants (trip_id, user_id, display_name, party_kind, role, joined_at)
       VALUES ($1, $2, 'Junior', 'adult'::travel.party_kind, 'junior_assistant'::travel.participant_role, now())`,
      [criada.body.id, junior.userId],
    );
    expect((await request(app.getHttpServer()).get(`/v1/trips/${criada.body.id}/expenses`).set('Authorization', `Bearer ${junior.access}`)).body.message).toBe(
      'Você não vê os gastos desta viagem.',
    );
    const categorias = await request(app.getHttpServer()).get('/v1/finance/expense-categories').set(auth);
    const alimentacao = categorias.body.find((item: { slug: string }) => item.slug === 'alimentacao').id as string;
    const aberto = await request(app.getHttpServer())
      .post(`/v1/trips/${criada.body.id}/expenses`)
      .set(auth)
      .send({
        amount: 100,
        currency: 'BRL',
        categoryId: alimentacao,
        context: 'on_trip',
        expenseDate: somar(hoje, 3),
        paidByParticipantId: donoId,
        splits: [
          { participantId: donoId, allocationType: 'equal' },
          { participantId: outroId, allocationType: 'equal' },
        ],
      });
    expect(aberto.status).toBe(201);
    expect(aberto.body.total).toBe(100);
    expect(aberto.body.expenses[0].title).toBe('Alimentação');
    expect(aberto.body.expenses[0].splits.map((item: { shareAmount: number }) => item.shareAmount).sort()).toEqual([50, 50]);
    const gastoId = aberto.body.expenses[0].id as string;
    const percent = await request(app.getHttpServer())
      .patch(`/v1/trips/${criada.body.id}/expenses/${gastoId}`)
      .set(auth)
      .send({
        amount: 100,
        currency: 'BRL',
        categoryId: alimentacao,
        context: 'on_trip',
        expenseDate: somar(hoje, 3),
        paidByParticipantId: donoId,
        splits: [
          { participantId: donoId, allocationType: 'percent', allocationValue: 70 },
          { participantId: outroId, allocationType: 'percent', allocationValue: 30 },
        ],
      });
    expect(percent.body.expenses[0].splits.find((item: { participantId: string }) => item.participantId === outroId).shareAmount).toBe(30);
    expect((await request(app.getHttpServer()).patch(`/v1/trips/${criada.body.id}/expenses/${gastoId}`).set(auth).send({
      amount: 100,
      currency: 'BRL',
      categoryId: alimentacao,
      context: 'on_trip',
      expenseDate: somar(hoje, 3),
      paidByParticipantId: donoId,
      splits: [
        { participantId: donoId, allocationType: 'percent', allocationValue: 40 },
        { participantId: outroId, allocationType: 'percent', allocationValue: 40 },
      ],
    })).body.message).toBe('A divisão não fecha o valor.');
    const fixo = await request(app.getHttpServer())
      .patch(`/v1/trips/${criada.body.id}/expenses/${gastoId}`)
      .set(auth)
      .send({
        title: 'Jantar',
        amount: 100,
        currency: 'BRL',
        categoryId: alimentacao,
        context: 'on_trip',
        expenseDate: somar(hoje, 3),
        paidByParticipantId: donoId,
        splits: [
          { participantId: donoId, allocationType: 'fixed', allocationValue: 40 },
          { participantId: outroId, allocationType: 'fixed', allocationValue: 60 },
        ],
      });
    expect(fixo.body.expenses[0].title).toBe('Jantar');
    const cotas = await dados.query<{ allocation_type: string; share_amount: string }[]>(
      `SELECT allocation_type::text, share_amount::text FROM finance.expense_participants WHERE expense_id = $1 ORDER BY share_amount`,
      [gastoId],
    );
    expect(cotas.map((cota) => [cota.allocation_type, Number(cota.share_amount)])).toEqual([
      ['fixed', 40],
      ['fixed', 60],
    ]);
    const recibo = await request(app.getHttpServer())
      .post(`/v1/trips/${criada.body.id}/expenses/${gastoId}/receipt`)
      .set(auth)
      .attach('arquivo', PNG, { filename: 'recibo.png', contentType: 'image/png' });
    expect(recibo.body.expenses[0].hasReceipt).toBe(true);
    expect(JSON.stringify(recibo.body)).not.toContain('recibo-');
    const arquivo = await request(app.getHttpServer()).get(`/v1/trips/${criada.body.id}/expenses/${gastoId}/receipt`).set(auth);
    expect(arquivo.status).toBe(200);
    expect(arquivo.headers['content-type']).toContain('image/png');
    const mime = await dados.query<{ receipt_mime: string }[]>(`SELECT receipt_mime FROM finance.expenses WHERE id = $1`, [gastoId]);
    expect(mime[0].receipt_mime).toBe('image/png');

    await dados.query(`DELETE FROM finance.exchange_rates WHERE base_currency = 'USD' AND target_currency = 'BRL' AND rate_date = CURRENT_DATE`);
    const dolar = await request(app.getHttpServer())
      .post(`/v1/trips/${criada.body.id}/expenses`)
      .set(auth)
      .send({
        title: 'Museu',
        amount: 10,
        currency: 'USD',
        categoryId: alimentacao,
        context: 'before_trip',
        paidByParticipantId: donoId,
        splits: [{ participantId: donoId, allocationType: 'equal' }],
      });
    expect(dolar.body.expenses[0]).toMatchObject({ amountOriginal: 10, currencyOriginal: 'USD', amountDisplay: 50 });
    const cambio = await dados.query<{ exchange_rate: string; fx: string }[]>(
      `SELECT r.exchange_rate::text, e.fx_rate_date::text AS fx
       FROM finance.expenses e
       JOIN finance.exchange_rates r ON r.base_currency = 'USD' AND r.target_currency = 'BRL' AND r.rate_date = e.fx_rate_date
       WHERE e.title = 'Museu' AND e.trip_id = $1`,
      [criada.body.id],
    );
    expect(cambio[0].fx).toBe(hoje);
    expect(Number(cambio[0].exchange_rate)).toBe(5);

    const acerto = await request(app.getHttpServer())
      .post(`/v1/trips/${criada.body.id}/settlements`)
      .set(auth)
      .send({ payerParticipantId: outroId, receiverParticipantId: donoId, amount: 60, currency: 'BRL' });
    expect(acerto.status).toBe(201);
    expect(acerto.body.total).toBe(150);
    const acertoId = acerto.body.settlements[0].id as string;
    const desfeito = await request(app.getHttpServer()).post(`/v1/trips/${criada.body.id}/settlements/${acertoId}/undo`).set(auth);
    expect(desfeito.body.settlements[0].undone).toBe(true);
    expect((await dados.query<{ undone_at: Date | null }[]>(`SELECT undone_at FROM finance.settlements WHERE id = $1`, [acertoId]))[0].undone_at).not.toBeNull();
    expect((await request(app.getHttpServer()).post(`/v1/trips/${criada.body.id}/settlements/${acertoId}/undo`).set(auth)).body.message).toBe('Este acerto já foi desfeito.');
    const apagado = await request(app.getHttpServer()).delete(`/v1/trips/${criada.body.id}/expenses/${gastoId}`).set(auth);
    expect(apagado.body.expenses.some((item: { id: string }) => item.id === gastoId)).toBe(false);
    expect((await dados.query<{ deleted_at: Date | null }[]>(`SELECT deleted_at FROM finance.expenses WHERE id = $1`, [gastoId]))[0].deleted_at).not.toBeNull();
  });
});

async function entrar(app: INestApplication, enviar: ReturnType<typeof vi.fn>): Promise<{ access: string; userId: string }> {
  const email = `gasto-${randomUUID()}@exemplo.com`;
  expect((await request(app.getHttpServer()).post('/v1/auth/sign-up').send({ nome: 'Pessoa E2E', usuario: email.split('@')[0].replace(/[^a-zA-Z0-9._$#&-]+/g, '').slice(0, 60) || 'viajante', email, senha: 'umaSenhaForte123', aceitouTermos: true })).status).toBe(202);
  const codigo = enviar.mock.calls.at(-1)?.[0].codigo as string;
  expect((await request(app.getHttpServer()).post('/v1/auth/confirm').send({ email, codigo })).status).toBe(200);
  const login = await request(app.getHttpServer()).post('/v1/auth/sign-in').send({ email, senha: 'umaSenhaForte123' });
  const dados = app.get(DataSource);
  const usuarios = await dados.query<{ id: string }[]>(`SELECT id FROM identity.users WHERE email = $1`, [email]);
  return { access: login.body.accessToken as string, userId: usuarios[0].id };
}

function somar(iso: string, dias: number): string {
  const data = new Date(`${iso}T00:00:00Z`);
  data.setUTCDate(data.getUTCDate() + dias);
  return data.toISOString().slice(0, 10);
}
