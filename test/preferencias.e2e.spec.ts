import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module';
import { prepararAplicacao } from '../src/common/http/preparar-aplicacao';
import { Lugar } from '../src/modules/identidade/domain/preferencia';
import { LOCALIZADOR } from '../src/modules/identidade/domain/ports/localizador.port';
import { REMETENTE_DE_EMAIL } from '../src/modules/identidade/domain/ports/remetente-de-email.port';

describe('Preferências (e2e, Postgres real)', () => {
  let app: INestApplication;
  let dados: DataSource;
  let lugar: Lugar | null = null;
  const enviarCodigoDeVerificacao = vi.fn().mockResolvedValue(undefined);
  const porIp = vi.fn(async () => lugar);

  beforeAll(async () => {
    process.env.RATE_LIMIT_LIMITE = '1000';
    const modulo = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(REMETENTE_DE_EMAIL)
      .useValue({ enviarCodigoDeVerificacao })
      .overrideProvider(LOCALIZADOR)
      .useValue({ porIp })
      .compile();

    app = modulo.createNestApplication();
    prepararAplicacao(app);
    await app.init();
    dados = modulo.get(DataSource);
  });

  afterAll(async () => {
    await app.close();
  });

  async function entrar(): Promise<{ email: string; access: string }> {
    const email = `pref-${randomUUID()}@exemplo.com`;
    const cadastro = await request(app.getHttpServer())
      .post('/v1/auth/sign-up')
      .send({ nome: 'Pessoa E2E', email, senha: 'umaSenhaForte123', aceitouTermos: true });
    expect(cadastro.status).toBe(202);
    const codigo = enviarCodigoDeVerificacao.mock.calls.at(-1)?.[0].codigo as string;
    expect((await request(app.getHttpServer()).post('/v1/auth/confirm').send({ email, codigo })).status).toBe(200);
    const login = await request(app.getHttpServer()).post('/v1/auth/sign-in').send({ email, senha: 'umaSenhaForte123' });
    return { email, access: login.body.accessToken as string };
  }

  it('grava pt-BR e BRL sem lugar, a localização quando ela existe, e a escolha explícita por cima', async () => {
    const conta = await entrar();
    lugar = null;

    const semLugar = await request(app.getHttpServer())
      .get('/v1/me/preferences')
      .set('Authorization', `Bearer ${conta.access}`);
    expect(semLugar.status).toBe(200);
    expect(semLugar.body).toMatchObject({
      idioma: 'pt-BR',
      moeda: 'BRL',
      idiomaSegueLocalizacao: true,
      moedaSegueLocalizacao: true,
      modo: 'localizacao',
      fuso: null,
    });
    expect(await lerPreferencia(dados, conta.email)).toMatchObject({
      locale: 'pt-BR',
      display_currency: 'BRL',
      follow_device_locale: true,
      follow_device_currency: true,
    });

    lugar = { pais: 'PT', paisNome: 'Portugal', cidade: 'Lisboa', moeda: 'EUR', fuso: 'Europe/Lisbon' };
    const emLisboa = await request(app.getHttpServer())
      .get('/v1/me/preferences')
      .set('Authorization', `Bearer ${conta.access}`);
    expect(emLisboa.body).toMatchObject({
      idioma: 'pt-PT',
      moeda: 'EUR',
      modo: 'localizacao',
      fuso: 'Europe/Lisbon',
      cidade: 'Lisboa',
      pais: 'Portugal',
    });
    expect(await lerPreferencia(dados, conta.email)).toMatchObject({
      locale: 'pt-PT',
      display_currency: 'EUR',
      timezone: 'Europe/Lisbon',
      follow_device_locale: true,
      follow_device_currency: true,
    });

    lugar = { pais: 'JP', paisNome: 'Japan', cidade: 'Tóquio', moeda: 'JPY', fuso: 'Asia/Tokyo' };
    const japaoSemTabelaDeIdioma = await request(app.getHttpServer())
      .get('/v1/me/preferences')
      .set('Authorization', `Bearer ${conta.access}`);
    expect(japaoSemTabelaDeIdioma.body.idioma).toBe('pt-BR');
    expect(japaoSemTabelaDeIdioma.body.moeda).toBe('JPY');

    const escolha = await request(app.getHttpServer())
      .patch('/v1/me/preferences')
      .set('Authorization', `Bearer ${conta.access}`)
      .send({ idioma: 'en', moeda: 'gbp' });
    expect(escolha.status).toBe(200);
    expect(escolha.body).toMatchObject({
      idioma: 'en',
      moeda: 'GBP',
      idiomaSegueLocalizacao: false,
      moedaSegueLocalizacao: false,
      modo: 'personalizado',
      fuso: 'Asia/Tokyo',
    });
    expect((await lerPreferencia(dados, conta.email))?.locale).toBe('en');
    expect((await lerPreferencia(dados, conta.email))?.display_currency).toBe('GBP');

    lugar = { pais: 'PT', paisNome: 'Portugal', cidade: 'Lisboa', moeda: 'EUR', fuso: 'Europe/Lisbon' };
    const mantemEscolha = await request(app.getHttpServer())
      .get('/v1/me/preferences')
      .set('Authorization', `Bearer ${conta.access}`);
    expect(mantemEscolha.body.idioma).toBe('en');
    expect(mantemEscolha.body.moeda).toBe('GBP');

    const soIdiomaVolta = await request(app.getHttpServer())
      .patch('/v1/me/preferences')
      .set('Authorization', `Bearer ${conta.access}`)
      .send({ idioma: 'localizacao' });
    expect(soIdiomaVolta.body.idioma).toBe('pt-PT');
    expect(soIdiomaVolta.body.moeda).toBe('GBP');
    expect(soIdiomaVolta.body.modo).toBe('personalizado');

    const moedaFora = await request(app.getHttpServer())
      .patch('/v1/me/preferences')
      .set('Authorization', `Bearer ${conta.access}`)
      .query({ idioma: 'es' })
      .send({ moeda: 'NOK' });
    expect(moedaFora.status).toBe(400);
    expect(moedaFora.body.message).toContain('moneda');

    const idiomaFora = await request(app.getHttpServer())
      .patch('/v1/me/preferences')
      .set('Authorization', `Bearer ${conta.access}`)
      .send({ idioma: 'fr' });
    expect(idiomaFora.status).toBe(400);

    const semToken = await request(app.getHttpServer()).get('/v1/me/preferences');
    expect(semToken.status).toBe(401);
  });
});

interface PreferenciaLida {
  locale: string;
  display_currency: string;
  follow_device_locale: boolean;
  follow_device_currency: boolean;
  timezone: string | null;
}

async function lerPreferencia(dados: DataSource, email: string): Promise<PreferenciaLida | null> {
  const linhas = await dados.query<PreferenciaLida[]>(
    `SELECT p.locale, p.display_currency, p.follow_device_locale, p.follow_device_currency, p.timezone
     FROM identity.user_preferences p
     JOIN identity.users u ON u.id = p.user_id
     WHERE lower(u.email) = lower($1)`,
    [email],
  );
  const linha = linhas[0];
  if (!linha) return null;
  return { ...linha, display_currency: linha.display_currency.trim() };
}
