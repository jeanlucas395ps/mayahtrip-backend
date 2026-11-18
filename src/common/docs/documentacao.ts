import { INestApplication, Logger, RequestMethod, VERSION_NEUTRAL } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA, VERSION_METADATA } from '@nestjs/common/constants';
import { ConfigService } from '@nestjs/config';
import { ModulesContainer } from '@nestjs/core';
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { VERSAO_URI } from '../http/preparar-aplicacao';

/**
 * 049-swagger-api e 050-readme-api. ADR 0002.
 * Local é NODE_ENV=development, o valor que o .env.example já usa.
 */
export const CAMINHO_SWAGGER = 'docs';
export const CAMINHO_SWAGGER_JSON = 'docs-json';
export const CAMINHO_README = 'readme';
export const URL_PUBLICACAO_README = 'https://api.readme.com/v2/branches/stable/apis';

const logger = new Logger('Documentacao');

export function documentacaoPublica(ambiente: string): boolean {
  return ambiente === 'development' || ambiente === 'test';
}

export function montarDocumentacao(app: INestApplication): void {
  const config = app.get(ConfigService);
  const ambiente = config.get<string>('app.environment') ?? 'development';
  if (!documentacaoPublica(ambiente)) {
    return;
  }

  const documento = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('MayahTrip API')
      .setDescription('Rotas HTTP implementadas. Esta visualização só existe em local e em teste.')
      .setVersion('1.0.0')
      .build(),
  );

  SwaggerModule.setup(CAMINHO_SWAGGER, app, documento, {
    jsonDocumentUrl: CAMINHO_SWAGGER_JSON,
  });

  const http = app.getHttpAdapter().getInstance() as {
    get: (caminho: string, tratar: (req: Request, res: Response) => void) => void;
  };
  http.get(`/${CAMINHO_README}`, (_req, res) => {
    res.type('html');
    res.send(htmlReadme(operacoesDoDocumento(documento)));
  });

  const chave = config.get<string>('readme.apiKey') ?? '';
  void publicarNoReadme({ documento, ambiente, chave }).catch(() => {
    logger.warn('ReadMe não publicou o contrato.');
  });
}

export function operacoesDoDocumento(documento: Pick<OpenAPIObject, 'paths'>): string[] {
  const operacoes: string[] = [];
  for (const [caminho, item] of Object.entries(documento.paths ?? {})) {
    if (!item) continue;
    for (const metodo of ['get', 'post', 'put', 'patch', 'delete'] as const) {
      if (item[metodo]) {
        operacoes.push(formatarOperacao(metodo, caminho.replace(/\{([^}]+)\}/g, ':$1')));
      }
    }
  }
  return operacoes.sort();
}

export function listarRotasHttp(app: INestApplication): string[] {
  const container = app.get(ModulesContainer);
  const rotas: string[] = [];

  for (const modulo of container.values()) {
    for (const controller of modulo.controllers.values()) {
      const tipo = controller.metatype;
      if (!tipo) continue;
      const versoesDoController = segmentosDeVersao(tipo, [VERSAO_URI]);
      const prefixos = comoLista(Reflect.getMetadata(PATH_METADATA, tipo) as string | string[] | undefined);
      const prototipo = tipo.prototype as Record<string, unknown>;
      for (const nome of Object.getOwnPropertyNames(prototipo)) {
        const alvo = prototipo[nome];
        if (typeof alvo !== 'function') continue;
        const metodo = Reflect.getMetadata(METHOD_METADATA, alvo) as RequestMethod | undefined;
        const caminhos = Reflect.getMetadata(PATH_METADATA, alvo) as string | string[] | undefined;
        if (metodo === undefined || caminhos === undefined) continue;
        const verbo = RequestMethod[metodo];
        if (!verbo) continue;
        const versoes = segmentosDeVersao(alvo, versoesDoController);
        for (const versao of versoes) {
          for (const prefixo of prefixos) {
            for (const caminho of comoLista(caminhos)) {
              rotas.push(formatarOperacao(verbo, juntarCaminho(versao, prefixo, caminho)));
            }
          }
        }
      }
    }
  }

  return rotas.sort();
}

export function htmlReadme(operacoes: readonly string[]): string {
  const itens = operacoes.map((operacao) => `<li>${escapar(operacao)}</li>`).join('');
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="utf-8"><title>ReadMe — MayahTrip API</title></head>
<body>
<h1>MayahTrip API</h1>
<p>Contrato das rotas implementadas, o mesmo documento enviado ao ReadMe quando há chave.</p>
<ul>${itens}</ul>
</body>
</html>`;
}

export async function publicarNoReadme(opcoes: {
  documento: object;
  ambiente: string;
  chave: string | undefined;
  fetchImpl?: typeof fetch;
}): Promise<void> {
  const chave = opcoes.chave?.trim() ?? '';
  if (!documentacaoPublica(opcoes.ambiente) || chave.length === 0) {
    return;
  }

  const corpo = new FormData();
  corpo.set('schema', new Blob([JSON.stringify(opcoes.documento)], { type: 'application/json' }), 'openapi.json');
  corpo.set('upload_source', 'form');

  try {
    const resposta = await (opcoes.fetchImpl ?? fetch)(URL_PUBLICACAO_README, {
      method: 'POST',
      headers: { Authorization: `Bearer ${chave}` },
      body: corpo,
    });
    if (!resposta.ok) {
      logger.warn(`ReadMe não publicou o contrato (status ${resposta.status}).`);
    }
  } catch {
    logger.warn('ReadMe não publicou o contrato (falha de rede).');
  }
}

function comoLista(valor: string | string[] | undefined): string[] {
  if (valor === undefined) return [''];
  return Array.isArray(valor) ? valor : [valor];
}

function segmentosDeVersao(alvo: object, padrao: string[]): string[] {
  if (!Reflect.hasMetadata(VERSION_METADATA, alvo)) {
    return padrao;
  }
  const meta = Reflect.getMetadata(VERSION_METADATA, alvo) as
    | string
    | symbol
    | undefined
    | Array<string | symbol | undefined>;
  if (meta === undefined) {
    return padrao;
  }
  const lista = Array.isArray(meta) ? meta : [meta];
  return lista.map((item) => {
    if (item === undefined || item === VERSION_NEUTRAL) {
      return item === VERSION_NEUTRAL ? '' : (padrao[0] ?? '');
    }
    return `v${String(item)}`;
  });
}

function juntarCaminho(...partes: string[]): string {
  const pedacos = partes.flatMap((parte) => parte.split('/')).filter((parte) => parte.length > 0);
  return `/${pedacos.join('/')}`;
}

function formatarOperacao(metodo: string, caminho: string): string {
  const limpo = caminho.startsWith('/') ? caminho : `/${caminho}`;
  const semBarraFinal = limpo.length > 1 ? limpo.replace(/\/+$/, '') : limpo;
  return `${metodo.toUpperCase()} ${semBarraFinal}`;
}

function escapar(valor: string): string {
  return valor
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
