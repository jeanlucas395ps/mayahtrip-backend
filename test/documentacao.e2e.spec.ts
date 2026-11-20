import { Controller, Get, INestApplication, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { prepararAplicacao } from '../src/common/http/preparar-aplicacao';
import {
  CAMINHO_README,
  CAMINHO_SWAGGER,
  CAMINHO_SWAGGER_JSON,
  listarRotasHttp,
  montarDocumentacao,
  operacoesDoDocumento,
} from '../src/common/docs/documentacao';
import { lerContrato } from '../src/common/docs/ler-contrato';

@Controller('somente-no-teste')
class RotaSomenteNoTesteController {
  @Get('ping')
  ping(): { ok: true } {
    return { ok: true };
  }
}

@Module({ controllers: [RotaSomenteNoTesteController] })
class RotaSomenteNoTesteModule {}

async function subir(ambiente: string, comRotaExtra: boolean): Promise<INestApplication> {
  process.env.NODE_ENV = ambiente;
  const modulo = await Test.createTestingModule({
    imports: comRotaExtra ? [AppModule, RotaSomenteNoTesteModule] : [AppModule],
  }).compile();

  const app = modulo.createNestApplication();
  prepararAplicacao(app);
  montarDocumentacao(app);
  await app.init();
  return app;
}

describe('Swagger e ReadMe (049, 050)', () => {
  const ambienteOriginal = process.env.NODE_ENV;

  afterAll(() => {
    process.env.NODE_ENV = ambienteOriginal;
  });

  describe('development (local)', () => {
    let app: INestApplication;

    beforeAll(async () => {
      app = await subir('development', true);
    });

    afterAll(async () => {
      await app.close();
    });

    it('AC-1 e AC-5: /docs e /readme mostram as rotas registradas, inclusive a do teste', async () => {
      const swagger = await request(app.getHttpServer()).get(`/${CAMINHO_SWAGGER}`);
      const json = await request(app.getHttpServer()).get(`/${CAMINHO_SWAGGER_JSON}`);
      const readme = await request(app.getHttpServer()).get(`/${CAMINHO_README}`);

      expect(swagger.status).toBe(200);
      expect(swagger.headers['content-type']).toMatch(/html/);
      expect(json.status).toBe(200);
      expect(readme.status).toBe(200);
      expect(readme.text).toContain('POST /v1/auth/sign-up');
      expect(readme.text).toContain('GET /metrics');
      expect(readme.text).toContain('GET /v1/somente-no-teste/ping');
      expect(readme.text).not.toContain('POST /auth/sign-up');

      const operacoes = operacoesDoDocumento(json.body);
      expect(operacoes).toEqual(listarRotasHttp(app));
      expect(operacoes).toContain('POST /v1/auth/sign-up');
      expect(operacoes).toContain('GET /metrics');
      expect(operacoes).toContain('GET /v1/somente-no-teste/ping');
      for (const operacao of operacoes) {
        expect(readme.text).toContain(operacao);
      }

      const contrato = lerContrato();
      const deProduto = operacoes.filter((operacao) => !operacao.includes('somente-no-teste'));
      expect(deProduto.every((operacao) => contrato.has(operacao))).toBe(true);
      const cadastro = json.body.paths['/v1/auth/sign-up'].post;
      expect(cadastro.description).toContain('Digite seu nome.');
      expect(cadastro.requestBody.content['application/json'].example.aceitouTermos).toBe(true);
      expect(cadastro.responses['202'].content['application/json'].example.mensagem).toContain('código de verificação');
      expect(cadastro.responses['429'].description).toContain('Limite de taxa excedido.');
      expect(readme.text).toContain('código de verificação');
      expect(readme.text).toContain('http_request_duration_seconds');
    });
  });

  describe('test', () => {
    let app: INestApplication;

    beforeAll(async () => {
      app = await subir('test', false);
    });

    afterAll(async () => {
      await app.close();
    });

    it('AC-2: a mesma visualização existe no ambiente de teste, sem a rota extra', async () => {
      const json = await request(app.getHttpServer()).get(`/${CAMINHO_SWAGGER_JSON}`);
      const readme = await request(app.getHttpServer()).get(`/${CAMINHO_README}`);
      const operacoes = operacoesDoDocumento(json.body);

      expect(json.status).toBe(200);
      expect(readme.status).toBe(200);
      expect(operacoes).toEqual(listarRotasHttp(app));
      expect(operacoes).toContain('POST /v1/auth/sign-up');
      expect(operacoes).toContain('GET /metrics');
      expect(operacoes).not.toContain('GET /v1/somente-no-teste/ping');
      expect(readme.text).not.toContain('somente-no-teste');
    });
  });

  describe('production', () => {
    let app: INestApplication;

    beforeAll(async () => {
      app = await subir('production', false);
    });

    afterAll(async () => {
      await app.close();
    });

    it('AC-3: fora de local e teste as duas URLs não servem o contrato', async () => {
      const swagger = await request(app.getHttpServer()).get(`/${CAMINHO_SWAGGER}`);
      const json = await request(app.getHttpServer()).get(`/${CAMINHO_SWAGGER_JSON}`);
      const readme = await request(app.getHttpServer()).get(`/${CAMINHO_README}`);

      for (const resposta of [swagger, json, readme]) {
        expect(resposta.status).toBe(404);
        expect(resposta.text).not.toContain('/v1/auth/sign-up');
        expect(resposta.text).not.toContain('swagger');
      }
    });
  });
});
