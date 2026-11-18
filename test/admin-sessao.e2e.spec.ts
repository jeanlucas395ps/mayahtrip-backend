import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as argon2 from 'argon2';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { prepararAplicacao } from '../src/common/http/preparar-aplicacao';
import { hashDeTokenAdmin } from '../src/modules/admin/domain/token-admin';

describe('Sessão do painel (e2e, Postgres real)', () => {
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

  it('grava tentativa, sessão e auditoria, e revoga o token ao sair', async () => {
    const email = `painel-${randomUUID()}@exemplo.com`;
    const senha = 'painel-teste-1';
    const hash = await argon2.hash(senha, { type: argon2.argon2id });
    await dados.query(`INSERT INTO admin.admin_users (name, email, password_hash, is_active) VALUES ($1, $2, $3, true)`, [
      'Auditor',
      email,
      hash,
    ]);
    const emailInativo = `inativo-${randomUUID()}@exemplo.com`;
    await dados.query(`INSERT INTO admin.admin_users (name, email, password_hash, is_active) VALUES ($1, $2, $3, false)`, [
      'Inativo',
      emailInativo,
      hash,
    ]);

    const errado = await request(app.getHttpServer()).post('/v1/admin/sign-in').send({ email, senha: 'senhaerrada1' });
    expect(errado.status).toBe(401);
    expect(await tentativas(dados, email)).toEqual([{ successful: false }]);
    expect(await sessoes(dados, email)).toEqual([]);

    const inativoResposta = await request(app.getHttpServer()).post('/v1/admin/sign-in').send({ email: emailInativo, senha });
    expect(inativoResposta.status).toBe(401);

    const entrada = await request(app.getHttpServer()).post('/v1/admin/sign-in').send({ email, senha });
    expect(entrada.status).toBe(200);
    const token = entrada.body.accessToken as string;
    expect(await tentativas(dados, email)).toEqual([{ successful: false }, { successful: true }]);
    const sessao = (await sessoes(dados, email))[0];
    expect(sessao.token_hash).toBe(hashDeTokenAdmin(token));
    expect(sessao.revoked_at).toBeNull();
    expect(new Date(sessao.expires_at).getTime()).toBeGreaterThan(Date.now());
    expect(JSON.stringify(sessao)).not.toContain(senha);
    expect(await acoes(dados, email)).toContain('admin.sign_in');

    const codigo = `aud-${randomUUID().slice(0, 8)}`;
    const criado = await request(app.getHttpServer())
      .post('/v1/admin/plans')
      .set('Authorization', `Bearer ${token}`)
      .send({
        code: codigo,
        name: 'Plano auditado',
        isFree: false,
        currency: 'BRL',
        billingPeriod: 'monthly',
        amount: 10,
        durationDays: 30,
        features: [],
      });
    expect(criado.status).toBe(201);
    const auditoria = await dados.query<{ action: string; new_values: { code?: string } | null }[]>(
      `SELECT action, new_values
       FROM admin.admin_audit_logs
       WHERE entity_id = $1`,
      [criado.body.id],
    );
    expect(auditoria.map((linha) => linha.action)).toContain('plan.create');
    expect(auditoria.find((linha) => linha.action === 'plan.create')?.new_values?.code).toBe(codigo);
    expect(JSON.stringify(auditoria)).not.toContain(token);

    const lista = await request(app.getHttpServer()).get('/v1/admin/plans').set('Authorization', `Bearer ${token}`);
    expect(lista.status).toBe(200);

    const saida = await request(app.getHttpServer()).post('/v1/admin/logout').set('Authorization', `Bearer ${token}`);
    expect(saida.status).toBe(204);
    expect((await sessoes(dados, email))[0].revoked_at).toBeTruthy();
    expect(await acoes(dados, email)).toContain('admin.sign_out');

    const depois = await request(app.getHttpServer()).get('/v1/admin/plans').set('Authorization', `Bearer ${token}`);
    expect(depois.status).toBe(401);
  });
});

async function tentativas(dados: DataSource, email: string): Promise<{ successful: boolean }[]> {
  return dados.query(
    `SELECT successful FROM admin.admin_login_attempts WHERE lower(email) = lower($1) ORDER BY attempted_at`,
    [email],
  );
}

async function sessoes(dados: DataSource, email: string): Promise<{ token_hash: string; expires_at: string; revoked_at: string | null }[]> {
  return dados.query(
    `SELECT s.token_hash, s.expires_at, s.revoked_at
     FROM admin.admin_sessions s
     JOIN admin.admin_users u ON u.id = s.admin_user_id
     WHERE lower(u.email) = lower($1)
     ORDER BY s.created_at`,
    [email],
  );
}

async function acoes(dados: DataSource, email: string): Promise<string[]> {
  const linhas = await dados.query<{ action: string }[]>(
    `SELECT l.action
     FROM admin.admin_audit_logs l
     JOIN admin.admin_users u ON u.id = l.admin_user_id
     WHERE lower(u.email) = lower($1)
     ORDER BY l.created_at`,
    [email],
  );
  return linhas.map((linha) => linha.action);
}
