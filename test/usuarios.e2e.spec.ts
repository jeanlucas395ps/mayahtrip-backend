import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as argon2 from 'argon2';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { prepararAplicacao } from '../src/common/http/preparar-aplicacao';

describe('Usuários do app no painel (e2e, Postgres real)', () => {
  let app: INestApplication;
  let dados: DataSource;

  beforeAll(async () => {
    process.env.RATE_LIMIT_LIMITE = '1000';
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = modulo.createNestApplication();
    prepararAplicacao(app);
    await app.init();
    dados = modulo.get(DataSource);
  });

  afterAll(async () => {
    await app.close();
  });

  it('lista a ficha, desativa, exclui sem apagar a viagem e restaura', async () => {
    const operador = await criarAdmin(dados);
    const entrada = await request(app.getHttpServer()).post('/v1/admin/sign-in').send({ email: operador.email, senha: operador.senha });
    expect(entrada.status).toBe(200);
    const token = entrada.body.accessToken as string;
    const auth = { Authorization: `Bearer ${token}` };

    const pais = randomUUID();
    await dados.query(`INSERT INTO geography.countries (id, name) VALUES ($1, $2)`, [pais, `Pais ${pais.slice(0, 8)}`]);
    const senha = 'senha-usuario-1';
    const hash = await argon2.hash(senha, { type: argon2.argon2id });
    const ativo = await criarUsuario(dados, { hash, status: 'active', verificado: true, pais, nome: 'Viajante Ativo' });
    const pendente = await criarUsuario(dados, { hash, status: 'pending', verificado: false, pais: null, nome: 'Viajante Pendente' });
    const google = await criarUsuario(dados, { hash: null, status: 'active', verificado: true, pais: null, nome: 'Viajante Google', google: true });
    await dados.query(
      `INSERT INTO travel.trips (owner_user_id, title, start_mode, duration_days) VALUES ($1, 'Viagem guardada', 'from_scratch', 3)`,
      [ativo.id],
    );

    const lista = await request(app.getHttpServer()).get('/v1/admin/users').query({ q: ativo.email }).set(auth);
    expect(lista.status).toBe(200);
    expect(lista.body[0]).toMatchObject({
      id: ativo.id,
      name: 'Viajante Ativo',
      email: ativo.email,
      countryId: pais,
      locale: 'en',
      currency: 'USD',
      planCode: 'free',
      emailVerified: true,
      status: 'active',
      deleted: false,
      entrada: 'senha',
    });
    expect(JSON.stringify(lista.body)).not.toContain(senha);

    const ficha = await request(app.getHttpServer()).get(`/v1/admin/users/${ativo.id}`).set(auth);
    expect(ficha.status).toBe(200);
    expect(ficha.body.username).toBe(ativo.username);

    const soAtivos = await request(app.getHttpServer()).get('/v1/admin/users').query({ q: pendente.email, ativo: 'true' }).set(auth);
    expect(soAtivos.body).toEqual([]);
    const naoVerificado = await request(app.getHttpServer()).get('/v1/admin/users').query({ q: pendente.email, verificado: 'false' }).set(auth);
    expect(naoVerificado.body[0]?.id).toBe(pendente.id);
    const porPais = await request(app.getHttpServer()).get('/v1/admin/users').query({ q: ativo.email, pais }).set(auth);
    expect(porPais.body[0]?.id).toBe(ativo.id);
    const porGoogle = await request(app.getHttpServer()).get('/v1/admin/users').query({ q: google.email, entrada: 'google' }).set(auth);
    expect(porGoogle.body[0]?.entrada).toBe('google');
    const foraDaData = await request(app.getHttpServer()).get('/v1/admin/users').query({ q: ativo.email, cadastroDe: '2099-01-01' }).set(auth);
    expect(foraDaData.body).toEqual([]);
    const filtroRuim = await request(app.getHttpServer()).get('/v1/admin/users').query({ entrada: 'convite' }).set(auth);
    expect(filtroRuim.status).toBe(400);

    const sessao = await request(app.getHttpServer()).post('/v1/auth/sign-in').send({ email: ativo.email, senha });
    expect(sessao.status).toBe(200);

    const desativado = await request(app.getHttpServer()).post(`/v1/admin/users/${ativo.id}/deactivate`).set(auth);
    expect(desativado.status).toBe(200);
    expect(desativado.body.status).toBe('inactive');
    expect((await lerUsuario(dados, ativo.id))?.status).toBe('inactive');
    expect(await request(app.getHttpServer()).post('/v1/auth/sign-in').send({ email: ativo.email, senha })).toMatchObject({ status: 401 });
    expect(await request(app.getHttpServer()).post('/v1/auth/refresh').send({ refreshToken: sessao.body.refreshToken })).toMatchObject({ status: 401 });
    expect(await contarViagens(dados, ativo.id)).toBe(1);

    const reativado = await request(app.getHttpServer()).post(`/v1/admin/users/${ativo.id}/activate`).set(auth);
    expect(reativado.body.status).toBe('active');
    expect(await request(app.getHttpServer()).post('/v1/auth/sign-in').send({ email: ativo.email, senha })).toMatchObject({ status: 200 });

    const excluido = await request(app.getHttpServer()).delete(`/v1/admin/users/${ativo.id}`).set(auth);
    expect(excluido.status).toBe(204);
    expect((await lerUsuario(dados, ativo.id))?.deleted_at).not.toBeNull();
    expect((await lerUsuario(dados, ativo.id))?.status).toBe('active');
    expect(await contarViagens(dados, ativo.id)).toBe(1);
    expect(await request(app.getHttpServer()).post('/v1/auth/sign-in').send({ email: ativo.email, senha })).toMatchObject({ status: 401 });
    const bloqueado = await request(app.getHttpServer()).post(`/v1/admin/users/${ativo.id}/activate`).set(auth);
    expect(bloqueado.status).toBe(409);

    const restaurado = await request(app.getHttpServer()).post(`/v1/admin/users/${ativo.id}/restore`).set(auth);
    expect(restaurado.status).toBe(200);
    expect(restaurado.body).toMatchObject({ deleted: false, status: 'active', email: ativo.email });
    expect((await lerUsuario(dados, ativo.id))?.deleted_at).toBeNull();
    expect(await request(app.getHttpServer()).post('/v1/auth/sign-in').send({ email: ativo.email, senha })).toMatchObject({ status: 200 });

    const auditoria = JSON.stringify(await dados.query(`SELECT action, new_values FROM admin.admin_audit_logs WHERE entity_id = $1`, [ativo.id]));
    expect(auditoria).not.toContain(senha);
    expect(auditoria).toContain('user.delete');
    expect(auditoria).toContain('user.restore');
  });
});

async function criarAdmin(dados: DataSource): Promise<{ email: string; senha: string }> {
  const email = `operador-${randomUUID()}@exemplo.com`;
  const senha = 'painel-teste-1';
  const hash = await argon2.hash(senha, { type: argon2.argon2id });
  await dados.query(`INSERT INTO admin.admin_users (name, email, password_hash) VALUES ('Operador', $1, $2)`, [email, hash]);
  return { email, senha };
}

async function criarUsuario(
  dados: DataSource,
  entrada: { hash: string | null; status: 'active' | 'pending'; verificado: boolean; pais: string | null; nome: string; google?: boolean },
): Promise<{ id: string; email: string; username: string }> {
  const id = randomUUID();
  const email = `pessoa-${id}@exemplo.com`;
  const username = `pessoa.${id.replace(/-/g, '').slice(0, 8)}`;
  await dados.query(
    `INSERT INTO identity.users (id, email, password_hash, status, email_verified_at)
     VALUES ($1, $2, $3, $4::identity.user_status, CASE WHEN $5 THEN now() ELSE NULL END)`,
    [id, email, entrada.hash, entrada.status, entrada.verificado],
  );
  await dados.query(
    `INSERT INTO identity.user_profiles (user_id, display_name, username, country_id) VALUES ($1, $2, $3, $4)`,
    [id, entrada.nome, username, entrada.pais],
  );
  await dados.query(
    `INSERT INTO identity.user_preferences (user_id, locale, display_currency, follow_device_locale, follow_device_currency)
     VALUES ($1, 'en', 'USD', false, false)`,
    [id],
  );
  if (entrada.google) {
    await dados.query(
      `INSERT INTO identity.user_auth_providers (user_id, provider, provider_user_id) VALUES ($1, 'google', $2)`,
      [id, `google-${id}`],
    );
  }
  return { id, email, username };
}

function lerUsuario(dados: DataSource, id: string): Promise<{ status: string; deleted_at: Date | null } | undefined> {
  return dados
    .query<{ status: string; deleted_at: Date | null }[]>(`SELECT status, deleted_at FROM identity.users WHERE id = $1`, [id])
    .then((linhas) => linhas[0]);
}

function contarViagens(dados: DataSource, id: string): Promise<number> {
  return dados
    .query<{ total: string }[]>(`SELECT count(*)::text AS total FROM travel.trips WHERE owner_user_id = $1 AND deleted_at IS NULL`, [id])
    .then((linhas) => Number(linhas[0]?.total ?? 0));
}
