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

describe('Documentos da viagem (e2e, Postgres real)', () => {
  let app: INestApplication;
  let dados: DataSource;
  const armazenamento = new MemoriaArmazenamento();
  const enviarCodigoDeVerificacao = vi.fn().mockResolvedValue(undefined);

  beforeAll(async () => {
    process.env.RATE_LIMIT_LIMITE = '1000';
    const modulo = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(REMETENTE_DE_EMAIL)
      .useValue({ enviarCodigoDeVerificacao, enviarConvite: vi.fn() })
      .overrideProvider(ARMAZENAMENTO)
      .useValue(armazenamento)
      .compile();
    app = modulo.createNestApplication();
    prepararAplicacao(app);
    await app.init();
    dados = modulo.get(DataSource);
  });

  afterAll(async () => {
    await app.close();
  });

  it('guarda o arquivo fora do painel e o link ao lado', async () => {
    const dono = await entrar(app, enviarCodigoDeVerificacao);
    const experiente = await entrar(app, enviarCodigoDeVerificacao);
    const estranho = await entrar(app, enviarCodigoDeVerificacao);
    const auth = { Authorization: `Bearer ${dono.access}` };
    const marca = randomUUID().slice(0, 8);
    const paisId = randomUUID();
    const cidadeId = randomUUID();
    await dados.query(`INSERT INTO geography.countries (id, name) VALUES ($1, $2)`, [paisId, `Pais ${marca}`]);
    await dados.query(`INSERT INTO geography.cities (id, country_id, name) VALUES ($1, $2, $3)`, [cidadeId, paisId, `Cidade ${marca}`]);
    const criada = await request(app.getHttpServer())
      .post('/v1/trips')
      .set(auth)
      .send({ title: `Docs ${marca}`, durationDays: 3, startMode: 'from_scratch', adultCount: 1, destinations: [{ cityId: cidadeId }] });
    expect(criada.status).toBe(201);
    await dados.query(
      `INSERT INTO travel.trip_participants (trip_id, user_id, display_name, party_kind, role, joined_at)
       VALUES ($1, $2, 'Experiente', 'adult'::travel.party_kind, 'experienced_traveler'::travel.participant_role, now())`,
      [criada.body.id, experiente.userId],
    );
    expect((await request(app.getHttpServer()).get(`/v1/trips/${criada.body.id}/documents`).set('Authorization', `Bearer ${experiente.access}`)).body.message).toBe(
      'Você não vê os documentos desta viagem.',
    );

    const enviado = await request(app.getHttpServer())
      .post(`/v1/trips/${criada.body.id}/documents`)
      .set(auth)
      .field('name', 'Reserva')
      .field('documentType', 'voucher')
      .attach('arquivo', PNG, { filename: 'reserva.png', contentType: 'image/png' });
    expect(enviado.status).toBe(201);
    expect(JSON.stringify(enviado.body)).not.toContain('storage');
    expect(JSON.stringify(enviado.body)).not.toContain('viagens/');
    const documento = enviado.body.documents[0];
    expect(documento).toMatchObject({ name: 'Reserva', documentType: 'voucher', mimeType: 'image/png', fileSize: PNG.length });
    const gravado = await dados.query<{ storage_key: string; file_size: string }[]>(
      `SELECT storage_key, file_size::text FROM organization.trip_documents WHERE id = $1`,
      [documento.id],
    );
    expect(gravado[0].storage_key.startsWith(`viagens/${criada.body.id}/documento-`)).toBe(true);
    expect(Number(gravado[0].file_size)).toBe(PNG.length);
    const aberto = await request(app.getHttpServer()).get(`/v1/trips/${criada.body.id}/documents/${documento.id}`).set(auth);
    expect(aberto.status).toBe(200);
    expect(aberto.body.equals(PNG)).toBe(true);

    const link = await request(app.getHttpServer())
      .post(`/v1/trips/${criada.body.id}/links`)
      .set(auth)
      .send({ title: 'Hotel', url: 'https://hotel.example/reserva' });
    expect(link.status).toBe(201);
    const salvo = link.body.links[0];
    const linha = await dados.query<{ url: string }[]>(`SELECT url FROM organization.trip_links WHERE id = $1`, [salvo.id]);
    expect(linha[0].url).toBe('https://hotel.example/reserva');
    const editado = await request(app.getHttpServer())
      .patch(`/v1/trips/${criada.body.id}/links/${salvo.id}`)
      .set(auth)
      .send({ title: 'Hotel confirmado', url: 'https://hotel.example/reserva' });
    expect(editado.body.links[0].title).toBe('Hotel confirmado');

    expect((await request(app.getHttpServer()).patch(`/v1/trips/${criada.body.id}/visibility`).set(auth).send({ visibility: 'public' })).status).toBe(200);
    expect((await request(app.getHttpServer()).get(`/v1/trips/${criada.body.id}/documents`).set('Authorization', `Bearer ${estranho.access}`)).status).toBe(404);

    const semLink = await request(app.getHttpServer()).delete(`/v1/trips/${criada.body.id}/links/${salvo.id}`).set(auth);
    expect(semLink.body.links).toEqual([]);
    expect(await dados.query(`SELECT id FROM organization.trip_links WHERE id = $1`, [salvo.id])).toHaveLength(0);
    const semDocumento = await request(app.getHttpServer()).delete(`/v1/trips/${criada.body.id}/documents/${documento.id}`).set(auth);
    expect(semDocumento.body.documents).toEqual([]);
    expect((await dados.query<{ deleted_at: Date | null }[]>(`SELECT deleted_at FROM organization.trip_documents WHERE id = $1`, [documento.id]))[0].deleted_at).not.toBeNull();
    expect(armazenamento.objetos.has(gravado[0].storage_key)).toBe(false);
  });
});

async function entrar(app: INestApplication, enviar: ReturnType<typeof vi.fn>): Promise<{ access: string; userId: string }> {
  const email = `doc-${randomUUID()}@exemplo.com`;
  expect((await request(app.getHttpServer()).post('/v1/auth/sign-up').send({ nome: 'Pessoa E2E', email, senha: 'umaSenhaForte123', aceitouTermos: true })).status).toBe(202);
  const codigo = enviar.mock.calls.at(-1)?.[0].codigo as string;
  expect((await request(app.getHttpServer()).post('/v1/auth/confirm').send({ email, codigo })).status).toBe(200);
  const login = await request(app.getHttpServer()).post('/v1/auth/sign-in').send({ email, senha: 'umaSenhaForte123' });
  const dados = app.get(DataSource);
  const usuarios = await dados.query<{ id: string }[]>(`SELECT id FROM identity.users WHERE email = $1`, [email]);
  return { access: login.body.accessToken as string, userId: usuarios[0].id };
}
