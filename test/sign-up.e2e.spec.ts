import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module';
import { prepararAplicacao } from '../src/common/http/preparar-aplicacao';
import { hashDeCodigo } from '../src/modules/identidade/domain/value-objects/codigo-verificacao.vo';
import { REMETENTE_DE_EMAIL } from '../src/modules/identidade/domain/ports/remetente-de-email.port';
import { contarContas, lerConta } from './ler-conta';

/**
 * Teste de integração HTTP ponta a ponta contra o Postgres real do
 * Compose local. Cobre `.specs/042-sign-up-api.md` AC-1 a AC-6 e AC-8.
 *
 * AC-7 (expiração) tem cobertura dedicada no teste de domínio
 * (`codigo-verificacao.vo.spec.ts`), com relógio controlado. AC-9
 * (limite de taxa) tem arquivo próprio (`sign-up-rate-limit.e2e.spec.ts`)
 * porque precisa de um app isolado, sem o "ruído" de chamada das outras
 * fatias deste arquivo contando para o mesmo limite por IP.
 *
 * O envio real de e-mail (SMTP Hostinger) é substituído por um dublê —
 * não temos credencial real de Hostinger neste ambiente, e a spec já
 * previa "SMTP mockado" para o AC-1.
 */
describe('POST /v1/auth/sign-up (e2e, Postgres real)', () => {
  let app: INestApplication;
  let dados: DataSource;
  const enviarCodigoDeVerificacao = vi.fn().mockResolvedValue(undefined);

  beforeAll(async () => {
    process.env.SIGN_UP_RATE_LIMIT_PER_MINUTE = '1000';
    process.env.RATE_LIMIT_LIMITE = '1000';

    const moduloDeTeste = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(REMETENTE_DE_EMAIL)
      .useValue({ enviarCodigoDeVerificacao })
      .compile();

    app = moduloDeTeste.createNestApplication();
    prepararAplicacao(app);
    await app.init();

    dados = moduloDeTeste.get(DataSource);
  });

  afterAll(async () => {
    await app.close();
  });

  it('AC-1: cria a conta pendente com hash Argon2id e dispara o envio do código', async () => {
    const email = `e2e-${randomUUID()}@exemplo.com`;

    const resposta = await request(app.getHttpServer())
      .post('/v1/auth/sign-up')
      .send({ nome: 'Pessoa E2E', email, senha: 'umaSenhaForte123', aceitouTermos: true });

    expect(resposta.status).toBe(202);
    expect(resposta.body.mensagem).toMatch(/código de verificação/i);

    const linha = await lerConta(dados, email);
    const codigoEnviado = enviarCodigoDeVerificacao.mock.calls.at(-1)?.[0].codigo as string;
    expect(linha).not.toBeNull();
    expect(linha?.status).toBe('pending');
    expect(linha?.password_hash).toMatch(/^\$argon2id\$/);
    expect(linha?.code_hash).toBe(hashDeCodigo(codigoEnviado));
    expect(codigoEnviado).toMatch(/^\d{4}$/);

    expect(enviarCodigoDeVerificacao).toHaveBeenCalledWith(
      expect.objectContaining({ paraEmail: email, codigo: codigoEnviado }),
    );
  });

  it('não atende o cadastro fora da v1', async () => {
    const resposta = await request(app.getHttpServer())
      .post('/auth/sign-up')
      .send({ nome: 'Pessoa E2E', email: `e2e-${randomUUID()}@exemplo.com`, senha: 'umaSenhaForte123', aceitouTermos: true });

    expect(resposta.status).toBe(404);
  });

  it('AC-2: nome vazio é rejeitado com a mensagem de BUSINESS/02', async () => {
    const resposta = await request(app.getHttpServer())
      .post('/v1/auth/sign-up')
      .send({ nome: '', email: `e2e-${randomUUID()}@exemplo.com`, senha: 'umaSenhaForte123', aceitouTermos: true });

    expect(resposta.status).toBe(400);
    expect(JSON.stringify(resposta.body)).toContain('Digite seu nome.');
  });

  it('AC-3: e-mail em formato inválido é rejeitado com a mensagem de BUSINESS/02', async () => {
    const resposta = await request(app.getHttpServer())
      .post('/v1/auth/sign-up')
      .send({ nome: 'Pessoa', email: 'nao-e-um-email', senha: 'umaSenhaForte123', aceitouTermos: true });

    expect(resposta.status).toBe(400);
    expect(JSON.stringify(resposta.body)).toContain('Digite um e-mail válido.');
  });

  it('AC-4: senha com menos de 8 caracteres é rejeitada com a mensagem de BUSINESS/02', async () => {
    const resposta = await request(app.getHttpServer())
      .post('/v1/auth/sign-up')
      .send({ nome: 'Pessoa', email: `e2e-${randomUUID()}@exemplo.com`, senha: 'curta', aceitouTermos: true });

    expect(resposta.status).toBe(400);
    expect(JSON.stringify(resposta.body)).toContain('A senha precisa ter pelo menos 8 caracteres.');
  });

  it('AC-5: termos não aceitos são rejeitados com a mensagem de BUSINESS/02', async () => {
    const resposta = await request(app.getHttpServer())
      .post('/v1/auth/sign-up')
      .send({
        nome: 'Pessoa',
        email: `e2e-${randomUUID()}@exemplo.com`,
        senha: 'umaSenhaForte123',
        aceitouTermos: false,
      });

    expect(resposta.status).toBe(400);
    expect(JSON.stringify(resposta.body)).toContain('Aceite os termos para continuar.');
  });

  it('AC-6/D-2: e-mail já cadastrado devolve a MESMA resposta do caminho feliz, sem criar segunda conta', async () => {
    const email = `e2e-duplicado-${randomUUID()}@exemplo.com`;
    const payload = { nome: 'Pessoa', email, senha: 'umaSenhaForte123', aceitouTermos: true };

    const primeira = await request(app.getHttpServer()).post('/v1/auth/sign-up').send(payload);
    const segunda = await request(app.getHttpServer())
      .post('/v1/auth/sign-up')
      .send({ ...payload, nome: 'Outra Pessoa', senha: 'outraSenhaForte456' });

    expect(segunda.status).toBe(primeira.status);
    expect(segunda.body).toEqual(primeira.body);

    expect(await contarContas(dados, email)).toBe(1);
    expect((await lerConta(dados, email))?.display_name).toBe('Pessoa');
  });

  it('AC-8: a resposta inclui o correlation id propagado pelo cliente', async () => {
    const resposta = await request(app.getHttpServer())
      .post('/v1/auth/sign-up')
      .set('x-correlation-id', 'teste-correlation-id-123')
      .send({ nome: 'Pessoa', email: `e2e-${randomUUID()}@exemplo.com`, senha: 'umaSenhaForte123', aceitouTermos: true });

    expect(resposta.headers['x-correlation-id']).toBe('teste-correlation-id-123');
  });
});
