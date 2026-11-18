import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as argon2 from 'argon2';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { prepararAplicacao } from '../src/common/http/preparar-aplicacao';

describe('Administradores do painel (e2e, Postgres real)', () => {
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

  it('cria, edita, desativa e recusa excluir o único ativo', async () => {
    const operador = await criarAdmin(dados, 'operador');
    const entrada = await request(app.getHttpServer()).post('/v1/admin/sign-in').send({ email: operador.email, senha: operador.senha });
    expect(entrada.status).toBe(200);
    const token = entrada.body.accessToken as string;

    const emailNovo = `novo-${randomUUID()}@exemplo.com`;
    const criado = await request(app.getHttpServer())
      .post('/v1/admin/administrators')
      .set('Authorization', `Bearer ${token}`)
      .send({ nome: 'Nova Pessoa', email: emailNovo, senha: 'senha-inicial-1' });
    expect(criado.status).toBe(201);
    expect(criado.body).toMatchObject({ name: 'Nova Pessoa', email: emailNovo, isActive: true });
    expect(JSON.stringify(criado.body)).not.toContain('senha-inicial-1');

    const linha = await lerAdmin(dados, emailNovo);
    expect(linha?.deleted_at).toBeNull();
    expect(linha?.is_active).toBe(true);
    expect(await argon2.verify(linha?.password_hash ?? '', 'senha-inicial-1')).toBe(true);

    const repetido = await request(app.getHttpServer())
      .post('/v1/admin/administrators')
      .set('Authorization', `Bearer ${token}`)
      .send({ nome: 'Outra', email: emailNovo.toUpperCase(), senha: 'senha-inicial-1' });
    expect(repetido.status).toBe(409);

    const entradaNova = await request(app.getHttpServer())
      .post('/v1/admin/sign-in')
      .send({ email: emailNovo, senha: 'senha-inicial-1' });
    expect(entradaNova.status).toBe(200);

    const editado = await request(app.getHttpServer())
      .patch(`/v1/admin/administrators/${criado.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ nome: 'Pessoa Editada', email: emailNovo, senha: 'senha-nova-123' });
    expect(editado.status).toBe(200);
    expect(editado.body.name).toBe('Pessoa Editada');
    expect(await argon2.verify((await lerAdmin(dados, emailNovo))?.password_hash ?? '', 'senha-nova-123')).toBe(true);
    const auditoria = JSON.stringify(
      await dados.query(`SELECT new_values FROM admin.admin_audit_logs WHERE entity_id = $1 AND action = 'admin.update'`, [criado.body.id]),
    );
    expect(auditoria).not.toContain('senha-nova-123');

    const tokenVelho = await request(app.getHttpServer()).get('/v1/admin/plans').set('Authorization', `Bearer ${entradaNova.body.accessToken}`);
    expect(tokenVelho.status).toBe(401);
    const senhaAntiga = await request(app.getHttpServer()).post('/v1/admin/sign-in').send({ email: emailNovo, senha: 'senha-inicial-1' });
    expect(senhaAntiga.status).toBe(401);
    const senhaNova = await request(app.getHttpServer()).post('/v1/admin/sign-in').send({ email: emailNovo, senha: 'senha-nova-123' });
    expect(senhaNova.status).toBe(200);

    const desativado = await request(app.getHttpServer())
      .post(`/v1/admin/administrators/${criado.body.id}/deactivate`)
      .set('Authorization', `Bearer ${token}`);
    expect(desativado.status).toBe(200);
    expect((await lerAdmin(dados, emailNovo))?.is_active).toBe(false);
    const bloqueado = await request(app.getHttpServer()).post('/v1/admin/sign-in').send({ email: emailNovo, senha: 'senha-nova-123' });
    expect(bloqueado.status).toBe(401);

    const outros = await dados.query<{ id: string }[]>(
      `SELECT id FROM admin.admin_users WHERE is_active AND deleted_at IS NULL AND id <> $1`,
      [operador.id],
    );
    if (outros.length > 0) {
      await dados.query(`UPDATE admin.admin_users SET is_active = false WHERE id = ANY($1::uuid[])`, [outros.map((outro) => outro.id)]);
    }
    try {
      const unico = await request(app.getHttpServer()).delete(`/v1/admin/administrators/${operador.id}`).set('Authorization', `Bearer ${token}`);
      expect(unico.status).toBe(409);
      expect((await lerAdmin(dados, operador.email))?.deleted_at).toBeNull();
    } finally {
      if (outros.length > 0) {
        await dados.query(`UPDATE admin.admin_users SET is_active = true WHERE id = ANY($1::uuid[])`, [outros.map((outro) => outro.id)]);
      }
    }

    await request(app.getHttpServer()).post(`/v1/admin/administrators/${criado.body.id}/activate`).set('Authorization', `Bearer ${token}`);
    const exclusao = await request(app.getHttpServer()).delete(`/v1/admin/administrators/${operador.id}`).set('Authorization', `Bearer ${token}`);
    expect(exclusao.status).toBe(204);
    expect((await lerAdmin(dados, operador.email))?.deleted_at).toBeTruthy();
    const depois = await request(app.getHttpServer()).get('/v1/admin/administrators').set('Authorization', `Bearer ${token}`);
    expect(depois.status).toBe(401);
  });
});

async function criarAdmin(dados: DataSource, prefixo: string): Promise<{ id: string; email: string; senha: string }> {
  const email = `${prefixo}-${randomUUID()}@exemplo.com`;
  const senha = 'painel-teste-1';
  const hash = await argon2.hash(senha, { type: argon2.argon2id });
  const linhas = await dados.query<{ id: string }[]>(
    `INSERT INTO admin.admin_users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id`,
    [prefixo, email, hash],
  );
  return { id: linhas[0].id, email, senha };
}

async function lerAdmin(
  dados: DataSource,
  email: string,
): Promise<{ password_hash: string; is_active: boolean; deleted_at: string | null } | null> {
  const linhas = await dados.query<{ password_hash: string; is_active: boolean; deleted_at: string | null }[]>(
    `SELECT password_hash, is_active, deleted_at FROM admin.admin_users WHERE lower(email) = lower($1)`,
    [email],
  );
  return linhas[0] ?? null;
}
