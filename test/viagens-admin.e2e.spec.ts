import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { argon2id, hash } from 'argon2';
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

describe('Viagens no painel (e2e, Postgres real)', () => {
  let app: INestApplication;
  let dados: DataSource;
  const enviarCodigoDeVerificacao = vi.fn().mockResolvedValue({ entregue: true });

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

  it('busca, desliga, publica e exclui a viagem sem abrir parada nem gasto', async () => {
    const operador = await criarAdmin(dados);
    const entrada = await request(app.getHttpServer()).post('/v1/admin/sign-in').send({ email: operador.email, senha: operador.senha });
    const auth = { Authorization: `Bearer ${entrada.body.accessToken}` };
    const dono = await entrar(app, enviarCodigoDeVerificacao);
    const marca = randomUUID().slice(0, 8);
    const paisId = randomUUID();
    const cidadeId = randomUUID();
    await dados.query(`INSERT INTO geography.countries (id, name) VALUES ($1, $2)`, [paisId, `Pais ${marca}`]);
    await dados.query(`INSERT INTO geography.cities (id, country_id, name) VALUES ($1, $2, $3)`, [cidadeId, paisId, `Lisboa ${marca}`]);
    const hoje = String((await dados.query<{ hoje: string }[]>(`SELECT CURRENT_DATE::text AS hoje`))[0].hoje).slice(0, 10);
    const criada = await request(app.getHttpServer())
      .post('/v1/trips')
      .set('Authorization', `Bearer ${dono.access}`)
      .send({ title: `Painel ${marca}`, startDate: somar(hoje, 8), endDate: somar(hoje, 10), startMode: 'suggested', destinations: [{ cityId: cidadeId }] });
    expect(criada.status).toBe(201);

    const lista = await request(app.getHttpServer()).get('/v1/admin/trips').set(auth).query({ q: marca, destination: `Lisboa ${marca}`, status: 'upcoming', active: 'true' });
    expect(lista.body[0]).toMatchObject({ id: criada.body.id, title: `Painel ${marca}`, status: 'upcoming', isActive: true, visibility: 'private' });
    expect(lista.body[0].destinations).toContain(`Lisboa ${marca}`);
    const ficha = await request(app.getHttpServer()).get(`/v1/admin/trips/${criada.body.id}`).set(auth);
    expect(ficha.body.participants[0]).toMatchObject({ displayName: 'Pessoa E2E', role: 'owner' });
    expect(JSON.stringify(ficha.body)).not.toContain('storage');

    expect((await request(app.getHttpServer()).post(`/v1/admin/trips/${criada.body.id}/deactivate`).set(auth)).body.mensagem).toBe('Viagem desativada.');
    expect((await request(app.getHttpServer()).get(`/v1/trips/${criada.body.id}`).set('Authorization', `Bearer ${dono.access}`)).status).toBe(404);
    expect((await dados.query<{ is_active: boolean }[]>(`SELECT is_active FROM travel.trips WHERE id = $1`, [criada.body.id]))[0].is_active).toBe(false);

    expect((await request(app.getHttpServer()).post(`/v1/admin/trips/${criada.body.id}/activate`).set(auth)).body.mensagem).toBe('Viagem ativada.');
    expect((await request(app.getHttpServer()).get(`/v1/trips/${criada.body.id}`).set('Authorization', `Bearer ${dono.access}`)).status).toBe(200);
    const publica = await request(app.getHttpServer()).patch(`/v1/admin/trips/${criada.body.id}/visibility`).set(auth).send({ visibility: 'public' });
    expect(publica.body.visibility).toBe('public');
    expect((await request(app.getHttpServer()).delete(`/v1/admin/trips/${criada.body.id}`).set(auth)).body.mensagem).toBe('Viagem excluída.');
    expect((await request(app.getHttpServer()).get('/v1/admin/trips').set(auth).query({ q: marca })).body).toEqual([]);
    const gravada = await dados.query<{ deleted_at: Date | null; is_active: boolean }[]>(`SELECT deleted_at, is_active FROM travel.trips WHERE id = $1`, [criada.body.id]);
    expect(gravada[0].deleted_at).not.toBeNull();
    expect(gravada[0].is_active).toBe(false);
  });
});

async function criarAdmin(dados: DataSource): Promise<{ email: string; senha: string }> {
  const email = `viagens-${randomUUID()}@exemplo.com`;
  const senha = 'painel-teste-1';
  await dados.query(`INSERT INTO admin.admin_users (name, email, password_hash) VALUES ('Operador', $1, $2)`, [email, await hash(senha, { type: argon2id })]);
  return { email, senha };
}

async function entrar(app: INestApplication, enviar: ReturnType<typeof vi.fn>): Promise<{ access: string }> {
  const email = `dono-${randomUUID()}@exemplo.com`;
  expect((await request(app.getHttpServer()).post('/v1/auth/sign-up').send({ nome: 'Pessoa E2E', usuario: email.split('@')[0].replace(/[^a-zA-Z0-9._$#&-]+/g, '').slice(0, 60) || 'viajante', email, senha: 'umaSenhaForte123', aceitouTermos: true })).status).toBe(202);
  const codigo = enviar.mock.calls.at(-1)?.[0].codigo as string;
  expect((await request(app.getHttpServer()).post('/v1/auth/confirm').send({ email, codigo })).status).toBe(200);
  const login = await request(app.getHttpServer()).post('/v1/auth/sign-in').send({ email, senha: 'umaSenhaForte123' });
  return { access: login.body.accessToken as string };
}

function somar(iso: string, dias: number): string {
  const data = new Date(`${iso}T00:00:00Z`);
  data.setUTCDate(data.getUTCDate() + dias);
  return data.toISOString().slice(0, 10);
}
