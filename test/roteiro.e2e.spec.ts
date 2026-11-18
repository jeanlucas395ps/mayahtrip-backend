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

describe('Roteiro (e2e, Postgres real)', () => {
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

  it('grava dia, parada e deslocamento, marca Feito e desfaz', async () => {
    const dono = await entrar(app, enviarCodigoDeVerificacao, dados);
    const junior = await entrar(app, enviarCodigoDeVerificacao, dados);
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
      .send({ title: `Roteiro ${marca}`, startDate: somar(hoje, 4), endDate: somar(hoje, 5), startMode: 'from_scratch', destinations: [{ cityId: cidadeId }] });
    expect(criada.status).toBe(201);
    expect((await request(app.getHttpServer()).get(`/v1/trips/${criada.body.id}/itinerary`).set(auth)).body).toEqual({ id: null, days: [] });

    const dia = await request(app.getHttpServer()).post(`/v1/trips/${criada.body.id}/itinerary/days`).set(auth).send({ dayNumber: 1, title: 'Chegada' });
    expect(dia.status).toBe(201);
    const dayId = dia.body.days[0].id as string;
    const parada = await request(app.getHttpServer())
      .post(`/v1/trips/${criada.body.id}/itinerary/days/${dayId}/stops`)
      .set(auth)
      .send({ title: 'Miradouro', sortOrder: 0, startTime: '09:00', durationMinutes: 45 });
    const almoco = await request(app.getHttpServer())
      .post(`/v1/trips/${criada.body.id}/itinerary/days/${dayId}/stops`)
      .set(auth)
      .send({ title: 'Almoço', sortOrder: 1 });
    expect(parada.body.days[0].stops[0]).toMatchObject({ title: 'Miradouro', startTime: '09:00', durationMinutes: 45, done: false });
    const deslocamento = await request(app.getHttpServer())
      .post(`/v1/trips/${criada.body.id}/itinerary/days/${dayId}/transfers`)
      .set(auth)
      .send({ fromStopId: parada.body.days[0].stops[0].id, toStopId: almoco.body.days[0].stops[1].id, transportType: 'walk', durationSeconds: 600 });
    expect(deslocamento.body.days[0].transfers[0].transportType).toBe('walk');

    await dados.query(
      `INSERT INTO travel.trip_participants (trip_id, user_id, display_name, party_kind, role, joined_at)
       VALUES ($1, $2, 'Junior', 'adult'::travel.party_kind, 'junior_assistant'::travel.participant_role, now())`,
      [criada.body.id, junior.userId],
    );
    expect((await request(app.getHttpServer()).post(`/v1/trips/${criada.body.id}/itinerary/days`).set('Authorization', `Bearer ${junior.access}`).send({ dayNumber: 2 })).body.message).toBe(
      'Você não pode editar o roteiro.',
    );
    const feito = await request(app.getHttpServer())
      .post(`/v1/trips/${criada.body.id}/itinerary/stops/${parada.body.days[0].stops[0].id}/done`)
      .set('Authorization', `Bearer ${junior.access}`);
    expect(feito.body.days[0].stops[0].done).toBe(true);
    const gravado = await dados.query<{ completed_at: Date | null; transport_type: string; day_number: number }[]>(
      `SELECT s.completed_at, t.transport_type, d.day_number
       FROM itinerary.itinerary_stops s
       JOIN itinerary.itinerary_days d ON d.id = s.itinerary_day_id
       JOIN itinerary.itinerary_transfers t ON t.itinerary_day_id = d.id
       WHERE s.id = $1`,
      [parada.body.days[0].stops[0].id],
    );
    expect(gravado[0].completed_at).not.toBeNull();
    expect(gravado[0]).toMatchObject({ transport_type: 'walk', day_number: 1 });
    const desfeito = await request(app.getHttpServer())
      .delete(`/v1/trips/${criada.body.id}/itinerary/stops/${parada.body.days[0].stops[0].id}/done`)
      .set('Authorization', `Bearer ${junior.access}`);
    expect(desfeito.body.days[0].stops[0].done).toBe(false);
    expect((await dados.query<{ completed_at: Date | null }[]>(`SELECT completed_at FROM itinerary.itinerary_stops WHERE id = $1`, [parada.body.days[0].stops[0].id]))[0].completed_at).toBeNull();
  });
});

async function entrar(app: INestApplication, enviar: ReturnType<typeof vi.fn>, dados: DataSource): Promise<{ access: string; userId: string }> {
  const email = `roteiro-${randomUUID()}@exemplo.com`;
  expect((await request(app.getHttpServer()).post('/v1/auth/sign-up').send({ nome: 'Pessoa E2E', email, senha: 'umaSenhaForte123', aceitouTermos: true })).status).toBe(202);
  const codigo = enviar.mock.calls.at(-1)?.[0].codigo as string;
  expect((await request(app.getHttpServer()).post('/v1/auth/confirm').send({ email, codigo })).status).toBe(200);
  const login = await request(app.getHttpServer()).post('/v1/auth/sign-in').send({ email, senha: 'umaSenhaForte123' });
  const usuarios = await dados.query<{ id: string }[]>(`SELECT id FROM identity.users WHERE email = $1`, [email]);
  return { access: login.body.accessToken as string, userId: usuarios[0].id };
}

function somar(iso: string, dias: number): string {
  const data = new Date(`${iso}T00:00:00Z`);
  data.setUTCDate(data.getUTCDate() + dias);
  return data.toISOString().slice(0, 10);
}
