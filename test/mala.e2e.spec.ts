import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module';
import { prepararAplicacao } from '../src/common/http/preparar-aplicacao';
import { REMETENTE_DE_EMAIL } from '../src/modules/identidade/domain/ports/remetente-de-email.port';

describe('Mala da viagem (e2e, Postgres real)', () => {
  let app: INestApplication;
  let dados: DataSource;
  const enviarCodigoDeVerificacao = vi.fn().mockResolvedValue(undefined);

  beforeAll(async () => {
    process.env.RATE_LIMIT_LIMITE = '1000';
    const modulo = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(REMETENTE_DE_EMAIL)
      .useValue({ enviarCodigoDeVerificacao, enviarConvite: vi.fn() })
      .compile();
    app = modulo.createNestApplication();
    prepararAplicacao(app);
    await app.init();
    dados = modulo.get(DataSource);
  });

  afterAll(async () => {
    await app.close();
  });

  it('copia a lista para cada pessoa e o dono escolhe quem vê', async () => {
    const dono = await entrar(app, enviarCodigoDeVerificacao);
    const outro = await entrar(app, enviarCodigoDeVerificacao);
    const auth = { Authorization: `Bearer ${dono.access}` };
    const marca = randomUUID().slice(0, 8);
    const paisId = randomUUID();
    const cidadeId = randomUUID();
    await dados.query(`INSERT INTO geography.countries (id, name) VALUES ($1, $2)`, [paisId, `Pais ${marca}`]);
    await dados.query(`INSERT INTO geography.cities (id, country_id, name) VALUES ($1, $2, $3)`, [cidadeId, paisId, `Cidade ${marca}`]);
    const criada = await request(app.getHttpServer())
      .post('/v1/trips')
      .set(auth)
      .send({ title: `Mala ${marca}`, durationDays: 3, startMode: 'from_scratch', adultCount: 2, destinations: [{ cityId: cidadeId }] });
    expect(criada.status).toBe(201);
    const lista = await request(app.getHttpServer()).get(`/v1/trips/${criada.body.id}/packing`).set(auth);
    expect(lista.status).toBe(200);
    expect(lista.body.bags).toHaveLength(2);
    const minha = lista.body.bags.find((mala: { mine: boolean }) => mala.mine);
    const alheia = lista.body.bags.find((mala: { mine: boolean }) => !mala.mine);
    expect(minha.items).toHaveLength(30);
    expect(alheia.items).toHaveLength(30);
    expect(minha.items.some((item: { name: string }) => item.name === 'Passaporte')).toBe(true);
    expect(minha.viewers).toEqual([]);
    const gravados = await dados.query<{ total: string }[]>(
      `SELECT count(*)::text AS total FROM organization.trip_packing_items WHERE trip_id = $1 AND deleted_at IS NULL`,
      [criada.body.id],
    );
    expect(Number(gravados[0].total)).toBe(60);

    const passaporte = minha.items.find((item: { name: string }) => item.name === 'Passaporte');
    const marcado = await request(app.getHttpServer())
      .patch(`/v1/trips/${criada.body.id}/packing/items/${passaporte.id}`)
      .set(auth)
      .send({ name: 'Passaporte', quantity: 1, isPacked: true });
    expect(marcado.status).toBe(200);
    const lido = await dados.query<{ is_packed: boolean }[]>(`SELECT is_packed FROM organization.trip_packing_items WHERE id = $1`, [passaporte.id]);
    expect(lido[0].is_packed).toBe(true);

    const novo = await request(app.getHttpServer())
      .post(`/v1/trips/${criada.body.id}/packing/${minha.participantId}/items`)
      .set(auth)
      .send({ name: 'Adaptador extra' });
    expect(novo.status).toBe(201);
    const extra = novo.body.bags.find((mala: { mine: boolean }) => mala.mine).items.find((item: { name: string }) => item.name === 'Adaptador extra');
    expect(extra).toBeTruthy();
    const apagado = await request(app.getHttpServer()).delete(`/v1/trips/${criada.body.id}/packing/items/${extra.id}`).set(auth);
    expect(apagado.status).toBe(200);
    expect((await dados.query<{ deleted_at: Date | null }[]>(`SELECT deleted_at FROM organization.trip_packing_items WHERE id = $1`, [extra.id]))[0].deleted_at).not.toBeNull();

    await dados.query(
      `INSERT INTO travel.trip_participants (trip_id, user_id, display_name, party_kind, role, joined_at)
       VALUES ($1, $2, 'Experiente', 'adult'::travel.party_kind, 'experienced_traveler'::travel.participant_role, now())`,
      [criada.body.id, outro.userId],
    );
    const pessoas = await dados.query<{ id: string }[]>(
      `SELECT id FROM travel.trip_participants WHERE trip_id = $1 AND user_id = $2`,
      [criada.body.id, outro.userId],
    );
    const antes = await request(app.getHttpServer()).get(`/v1/trips/${criada.body.id}/packing`).set('Authorization', `Bearer ${outro.access}`);
    expect(antes.body.bags.some((mala: { participantId: string }) => mala.participantId === minha.participantId)).toBe(false);
    const visto = await request(app.getHttpServer())
      .put(`/v1/trips/${criada.body.id}/packing/${minha.participantId}/viewers`)
      .set(auth)
      .send({ viewerParticipantIds: [pessoas[0].id] });
    expect(visto.status).toBe(200);
    const autorizacao = await dados.query<{ viewer_participant_id: string }[]>(
      `SELECT viewer_participant_id FROM organization.packing_list_viewers WHERE owner_participant_id = $1`,
      [minha.participantId],
    );
    expect(autorizacao.map((linha) => linha.viewer_participant_id)).toEqual([pessoas[0].id]);
    const aberta = await request(app.getHttpServer()).get(`/v1/trips/${criada.body.id}/packing`).set('Authorization', `Bearer ${outro.access}`);
    const vista = aberta.body.bags.find((mala: { participantId: string }) => mala.participantId === minha.participantId);
    expect(vista.canEdit).toBe(false);
    expect(vista.items.some((item: { name: string }) => item.name === 'Passaporte')).toBe(true);
    expect((await request(app.getHttpServer()).patch(`/v1/trips/${criada.body.id}/packing/items/${passaporte.id}`).set('Authorization', `Bearer ${outro.access}`).send({ name: 'Passaporte', quantity: 1, isPacked: false })).body.message).toBe(
      'Você não mexe nesta mala.',
    );

    const vazia = await request(app.getHttpServer()).delete(`/v1/trips/${criada.body.id}/packing/${alheia.participantId}`).set(auth);
    expect(vazia.body.bags.find((mala: { participantId: string }) => mala.participantId === alheia.participantId).items).toEqual([]);
    const restaram = await dados.query<{ total: string }[]>(
      `SELECT count(*)::text AS total FROM organization.trip_packing_items WHERE participant_id = $1 AND deleted_at IS NULL`,
      [alheia.participantId],
    );
    expect(Number(restaram[0].total)).toBe(0);
  });
});

async function entrar(app: INestApplication, enviar: ReturnType<typeof vi.fn>): Promise<{ access: string; userId: string }> {
  const email = `mala-${randomUUID()}@exemplo.com`;
  expect((await request(app.getHttpServer()).post('/v1/auth/sign-up').send({ nome: 'Pessoa E2E', email, senha: 'umaSenhaForte123', aceitouTermos: true })).status).toBe(202);
  const codigo = enviar.mock.calls.at(-1)?.[0].codigo as string;
  expect((await request(app.getHttpServer()).post('/v1/auth/confirm').send({ email, codigo })).status).toBe(200);
  const login = await request(app.getHttpServer()).post('/v1/auth/sign-in').send({ email, senha: 'umaSenhaForte123' });
  const dados = app.get(DataSource);
  const usuarios = await dados.query<{ id: string }[]>(`SELECT id FROM identity.users WHERE email = $1`, [email]);
  return { access: login.body.accessToken as string, userId: usuarios[0].id };
}
