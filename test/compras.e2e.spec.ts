import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module';
import { prepararAplicacao } from '../src/common/http/preparar-aplicacao';
import { CAMBIO } from '../src/modules/financeiro/domain/financeiro.port';
import { REMETENTE_DE_EMAIL } from '../src/modules/identidade/domain/ports/remetente-de-email.port';

describe('Lista de compras (e2e, Postgres real)', () => {
  let app: INestApplication;
  let dados: DataSource;
  const enviarCodigoDeVerificacao = vi.fn().mockResolvedValue(undefined);

  beforeAll(async () => {
    process.env.RATE_LIMIT_LIMITE = '1000';
    const modulo = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(REMETENTE_DE_EMAIL)
      .useValue({ enviarCodigoDeVerificacao, enviarConvite: vi.fn() })
      .overrideProvider(CAMBIO)
      .useValue({ taxa: vi.fn().mockResolvedValue(5) })
      .compile();
    app = modulo.createNestApplication();
    prepararAplicacao(app);
    await app.init();
    dados = modulo.get(DataSource);
  });

  afterAll(async () => {
    await app.close();
  });

  it('guarda o item na moeda de exibição e liga o gasto quando a pessoa salva', async () => {
    const dono = await entrar(app, enviarCodigoDeVerificacao);
    const junior = await entrar(app, enviarCodigoDeVerificacao);
    const auth = { Authorization: `Bearer ${dono.access}` };
    const marca = randomUUID().slice(0, 8);
    const paisId = randomUUID();
    const cidadeId = randomUUID();
    await dados.query(`INSERT INTO geography.countries (id, name) VALUES ($1, $2)`, [paisId, `Pais ${marca}`]);
    await dados.query(`INSERT INTO geography.cities (id, country_id, name) VALUES ($1, $2, $3)`, [cidadeId, paisId, `Cidade ${marca}`]);
    const criada = await request(app.getHttpServer())
      .post('/v1/trips')
      .set(auth)
      .send({ title: `Compras ${marca}`, durationDays: 3, startMode: 'from_scratch', adultCount: 1, destinations: [{ cityId: cidadeId }] });
    expect(criada.status).toBe(201);
    await dados.query(
      `INSERT INTO travel.trip_participants (trip_id, user_id, display_name, party_kind, role, joined_at)
       VALUES ($1, $2, 'Junior', 'adult'::travel.party_kind, 'junior_assistant'::travel.participant_role, now())`,
      [criada.body.id, junior.userId],
    );
    expect((await request(app.getHttpServer()).get(`/v1/trips/${criada.body.id}/shopping`).set('Authorization', `Bearer ${junior.access}`)).body.message).toBe(
      'Você não vê as compras desta viagem.',
    );

    const criado = await request(app.getHttpServer())
      .post(`/v1/trips/${criada.body.id}/shopping`)
      .set(auth)
      .send({ name: 'Protetor solar', estimatedPrice: 42.5, storeName: 'Farmácia' });
    expect(criado.status).toBe(201);
    const item = criado.body.items.find((atual: { name: string }) => atual.name === 'Protetor solar');
    expect(item).toMatchObject({ estimatedPrice: 42.5, currency: 'BRL', isPurchased: false, expenseId: null, quantity: 1 });
    const gravado = await dados.query<{ estimated_price: string; currency: string }[]>(
      `SELECT estimated_price::text, currency FROM organization.shopping_items WHERE id = $1`,
      [item.id],
    );
    expect(Number(gravado[0].estimated_price)).toBe(42.5);
    expect(gravado[0].currency.trim()).toBe('BRL');

    const comprado = await request(app.getHttpServer())
      .patch(`/v1/trips/${criada.body.id}/shopping/${item.id}`)
      .set(auth)
      .send({ name: 'Protetor solar', estimatedPrice: 42.5, storeName: 'Farmácia', isPurchased: true });
    expect(comprado.body.items[0].isPurchased).toBe(true);
    expect(comprado.body.items[0].expenseId).toBeNull();

    const categorias = await request(app.getHttpServer()).get('/v1/finance/expense-categories').set(auth);
    const compras = categorias.body.find((atual: { slug: string }) => atual.slug === 'compras').id as string;
    const donoId = criada.body.participants[0].id as string;
    const gasto = await request(app.getHttpServer())
      .post(`/v1/trips/${criada.body.id}/shopping/${item.id}/expense`)
      .set(auth)
      .send({
        title: 'Protetor solar',
        amount: 42.5,
        currency: 'BRL',
        categoryId: compras,
        context: 'planned',
        paidByParticipantId: donoId,
        splits: [{ participantId: donoId, allocationType: 'equal' }],
      });
    expect(gasto.status).toBe(201);
    const ligado = await dados.query<{ expense_id: string; is_purchased: boolean }[]>(
      `SELECT expense_id, is_purchased FROM organization.shopping_items WHERE id = $1`,
      [item.id],
    );
    expect(ligado[0].is_purchased).toBe(true);
    const gastoGravado = await dados.query<{ id: string }[]>(`SELECT id FROM finance.expenses WHERE id = $1`, [ligado[0].expense_id]);
    expect(gastoGravado).toHaveLength(1);
    expect((await request(app.getHttpServer()).post(`/v1/trips/${criada.body.id}/shopping/${item.id}/expense`).set(auth).send({
      title: 'Protetor solar',
      amount: 42.5,
      currency: 'BRL',
      categoryId: compras,
      context: 'planned',
      paidByParticipantId: donoId,
      splits: [{ participantId: donoId, allocationType: 'equal' }],
    })).body.message).toBe('Este item já abriu um gasto.');

    const outro = await request(app.getHttpServer()).post(`/v1/trips/${criada.body.id}/shopping`).set(auth).send({ name: 'Chapéu' });
    const chapeu = outro.body.items.find((atual: { name: string }) => atual.name === 'Chapéu');
    const semPreco = await dados.query<{ estimated_price: string | null; currency: string | null }[]>(
      `SELECT estimated_price::text, currency FROM organization.shopping_items WHERE id = $1`,
      [chapeu.id],
    );
    expect(semPreco[0].estimated_price).toBeNull();
    expect(semPreco[0].currency).toBeNull();
    const apagado = await request(app.getHttpServer()).delete(`/v1/trips/${criada.body.id}/shopping/${chapeu.id}`).set(auth);
    expect(apagado.body.items.some((atual: { id: string }) => atual.id === chapeu.id)).toBe(false);
    expect(await dados.query(`SELECT id FROM organization.shopping_items WHERE id = $1`, [chapeu.id])).toHaveLength(0);
  });
});

async function entrar(app: INestApplication, enviar: ReturnType<typeof vi.fn>): Promise<{ access: string; userId: string }> {
  const email = `compra-${randomUUID()}@exemplo.com`;
  expect((await request(app.getHttpServer()).post('/v1/auth/sign-up').send({ nome: 'Pessoa E2E', email, senha: 'umaSenhaForte123', aceitouTermos: true })).status).toBe(202);
  const codigo = enviar.mock.calls.at(-1)?.[0].codigo as string;
  expect((await request(app.getHttpServer()).post('/v1/auth/confirm').send({ email, codigo })).status).toBe(200);
  const login = await request(app.getHttpServer()).post('/v1/auth/sign-in').send({ email, senha: 'umaSenhaForte123' });
  const dados = app.get(DataSource);
  const usuarios = await dados.query<{ id: string }[]>(`SELECT id FROM identity.users WHERE email = $1`, [email]);
  return { access: login.body.accessToken as string, userId: usuarios[0].id };
}
