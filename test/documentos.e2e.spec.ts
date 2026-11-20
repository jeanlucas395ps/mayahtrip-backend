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

describe('Documentos pessoais (e2e, Postgres real)', () => {
  let app: INestApplication;
  let dados: DataSource;
  const armazenamento = new MemoriaArmazenamento();
  const enviarCodigoDeVerificacao = vi.fn().mockResolvedValue({ entregue: true });

  beforeAll(async () => {
    process.env.RATE_LIMIT_LIMITE = '1000';
    const modulo = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(REMETENTE_DE_EMAIL)
      .useValue({ enviarCodigoDeVerificacao })
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

  async function entrar(): Promise<{ email: string; access: string }> {
    const email = `doc-${randomUUID()}@exemplo.com`;
    const cadastro = await request(app.getHttpServer())
      .post('/v1/auth/sign-up')
      .send({ nome: 'Pessoa E2E', usuario: email.split('@')[0].replace(/[^a-zA-Z0-9._$#&-]+/g, '').slice(0, 60) || 'viajante', email, senha: 'umaSenhaForte123', aceitouTermos: true });
    expect(cadastro.status).toBe(202);
    const codigo = enviarCodigoDeVerificacao.mock.calls.at(-1)?.[0].codigo as string;
    expect((await request(app.getHttpServer()).post('/v1/auth/confirm').send({ email, codigo })).status).toBe(200);
    const login = await request(app.getHttpServer()).post('/v1/auth/sign-in').send({ email, senha: 'umaSenhaForte123' });
    return { email, access: login.body.accessToken as string };
  }

  it('grava CPF e passagem, recusa carteira sem código e esconde o arquivo de outra conta', async () => {
    const dono = await entrar();
    const outro = await entrar();
    const codigoLegivel = `M1-${randomUUID()}`;
    const pdf = Buffer.from('%PDF-1.4 documento pessoal');

    const semToken = await request(app.getHttpServer()).get('/v1/me/documents');
    expect(semToken.status).toBe(401);

    const cpf = await request(app.getHttpServer())
      .post('/v1/me/documents')
      .set('Authorization', `Bearer ${dono.access}`)
      .field('tipo', 'cpf')
      .attach('arquivo', pdf, { filename: 'rg.pdf', contentType: 'application/pdf' });
    expect(cpf.status).toBe(201);
    expect(cpf.body).toMatchObject({ tipo: 'cpf', nome: 'rg.pdf', mime: 'application/pdf', tamanho: pdf.length, temCodigo: false, carteira: null });
    expect(JSON.stringify(cpf.body)).not.toContain('documentos/');

    const linhaCpf = await lerDocumento(dados, dono.email, 'cpf');
    expect(linhaCpf?.barcode_payload).toBeNull();
    expect(linhaCpf?.wallet_provider).toBeNull();
    expect(linhaCpf?.wallet_object_id).toBeNull();
    expect(linhaCpf?.storage_key.startsWith(`documentos/`)).toBe(true);
    expect(armazenamento.objetos.has(linhaCpf?.storage_key ?? '')).toBe(true);

    const arquivo = await request(app.getHttpServer())
      .get(`/v1/me/documents/${cpf.body.id}/arquivo`)
      .set('Authorization', `Bearer ${dono.access}`)
      .buffer(true)
      .parse(binario);
    expect(arquivo.status).toBe(200);
    expect(arquivo.body.equals(pdf)).toBe(true);

    const passagem = await request(app.getHttpServer())
      .post('/v1/me/documents')
      .set('Authorization', `Bearer ${dono.access}`)
      .field('tipo', 'aviao')
      .field('codigo', codigoLegivel)
      .field('carteira', 'google')
      .attach('arquivo', Buffer.from('png'), { filename: 'embarque.png', contentType: 'image/png' });
    expect(passagem.status).toBe(201);
    expect(passagem.body).toMatchObject({ tipo: 'aviao', temCodigo: true, carteira: 'google' });
    expect(JSON.stringify(passagem.body)).not.toContain(codigoLegivel);
    expect(await lerDocumento(dados, dono.email, 'flight_ticket')).toMatchObject({
      barcode_payload: codigoLegivel,
      wallet_provider: 'google_wallet',
      wallet_object_id: null,
    });

    const semCodigo = await request(app.getHttpServer())
      .post('/v1/me/documents')
      .set('Authorization', `Bearer ${dono.access}`)
      .query({ idioma: 'en' })
      .field('tipo', 'onibus')
      .field('carteira', 'apple')
      .attach('arquivo', Buffer.from('webp'), { filename: 'onibus.webp', contentType: 'image/webp' });
    expect(semCodigo.status).toBe(400);
    expect(semCodigo.body.message).toContain('readable code');
    expect(await lerDocumento(dados, dono.email, 'bus_ticket')).toBeNull();

    const texto = await request(app.getHttpServer())
      .post('/v1/me/documents')
      .set('Authorization', `Bearer ${dono.access}`)
      .field('tipo', 'cnh')
      .attach('arquivo', Buffer.from('oi'), { filename: 'nota.txt', contentType: 'text/plain' });
    expect(texto.status).toBe(400);

    const lista = await request(app.getHttpServer()).get('/v1/me/documents').set('Authorization', `Bearer ${dono.access}`);
    expect(lista.body).toHaveLength(2);

    const alheio = await request(app.getHttpServer())
      .get(`/v1/me/documents/${cpf.body.id}/arquivo`)
      .set('Authorization', `Bearer ${outro.access}`);
    expect(alheio.status).toBe(404);
    expect((await request(app.getHttpServer()).get('/v1/me/documents').set('Authorization', `Bearer ${outro.access}`)).body).toEqual([]);

    const exclusao = await request(app.getHttpServer())
      .delete(`/v1/me/documents/${cpf.body.id}`)
      .set('Authorization', `Bearer ${dono.access}`);
    expect(exclusao.status).toBe(204);
    expect((await lerDocumento(dados, dono.email, 'cpf'))?.deleted_at).toBeTruthy();
    expect(armazenamento.objetos.has(linhaCpf?.storage_key ?? '')).toBe(false);
    expect(
      (await request(app.getHttpServer()).get(`/v1/me/documents/${cpf.body.id}`).set('Authorization', `Bearer ${dono.access}`)).status,
    ).toBe(404);
  });
});

interface DocumentoLido {
  document_type: string;
  storage_key: string;
  barcode_payload: string | null;
  wallet_provider: string | null;
  wallet_object_id: string | null;
  deleted_at: string | null;
}

async function lerDocumento(dados: DataSource, email: string, tipo: string): Promise<DocumentoLido | null> {
  const linhas = await dados.query<DocumentoLido[]>(
    `SELECT d.document_type::text, d.storage_key, d.barcode_payload, d.wallet_provider::text, d.wallet_object_id, d.deleted_at
     FROM identity.user_documents d
     JOIN identity.users u ON u.id = d.user_id
     WHERE lower(u.email) = lower($1) AND d.document_type::text = $2
     ORDER BY d.created_at DESC`,
    [email, tipo],
  );
  return linhas[0] ?? null;
}

function binario(res: request.Response, callback: (error: Error | null, body: Buffer) => void): void {
  const pedacos: Buffer[] = [];
  res.on('data', (pedaco: Buffer) => pedacos.push(pedaco));
  res.on('end', () => callback(null, Buffer.concat(pedacos)));
}
