import { OpenAPIObject } from '@nestjs/swagger';
import { OperacaoContrato, RespostaContrato, lerContrato } from './ler-contrato';

interface OperacaoEditavel {
  summary?: string;
  description?: string;
  parameters?: unknown[];
  security?: { bearer: string[] }[];
  requestBody?: unknown;
  responses: Record<string, unknown>;
}

export function aplicarContrato(documento: OpenAPIObject, contrato = lerContrato()): void {
  documento.components = {
    ...documento.components,
    securitySchemes: {
      ...documento.components?.securitySchemes,
      bearer: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
    },
  };

  for (const [caminho, item] of Object.entries(documento.paths ?? {})) {
    if (!item) continue;
    for (const metodo of ['get', 'post', 'put', 'patch', 'delete'] as const) {
      const operacao = item[metodo];
      if (!operacao) continue;
      const chave = `${metodo.toUpperCase()} ${caminho.replace(/\{([^}]+)\}/g, ':$1')}`;
      const ficha = contrato.get(chave);
      if (!ficha) continue;
      preencher(operacao as OperacaoEditavel, ficha);
    }
  }
}

function preencher(operacao: OperacaoEditavel, ficha: OperacaoContrato): void {
  operacao.summary = ficha.resumo;
  operacao.description = ficha.descricao;
  operacao.parameters = ficha.parametros
    .filter((item) => item.nome !== 'arquivo')
    .map((item) => ({
      name: item.nome,
      in: item.em,
      required: item.obrigatorio,
      description: item.descricao,
      schema: { type: 'string' as const, example: item.exemplo },
    }));
  if (ficha.auth === 'viajante' || ficha.auth === 'admin') operacao.security = [{ bearer: [] }];
  if (ficha.exemploCorpo) {
    operacao.requestBody = {
      required: true,
      content: {
        'application/json': {
          schema: { type: 'object' },
          example: ficha.exemploCorpo,
        },
      },
    };
  }
  if (ficha.parametros.some((item) => item.nome === 'arquivo')) {
    operacao.requestBody = {
      required: true,
      content: { 'multipart/form-data': { schema: { type: 'object', properties: { arquivo: { type: 'string', format: 'binary' } } } } },
    };
  }
  operacao.responses = {};
  for (const resposta of ficha.respostas) {
    operacao.responses[String(resposta.status)] = corpoDaResposta(resposta);
  }
}

function corpoDaResposta(resposta: RespostaContrato): { description: string; content?: Record<string, unknown> } {
  if (resposta.vazio || resposta.binario) {
    return {
      description: resposta.descricao,
      ...(resposta.binario ? { content: { 'image/*': { schema: { type: 'string', format: 'binary' } } } } : {}),
    };
  }
  if (resposta.texto) {
    return {
      description: resposta.descricao,
      content: { 'text/plain': { schema: { type: 'string' }, example: resposta.exemplo } },
    };
  }
  return {
    description: resposta.descricao,
    content: { 'application/json': { schema: { type: 'object' }, example: resposta.exemplo } },
  };
}

export function htmlDoContrato(operacoes: readonly string[], contrato = lerContrato()): string {
  const artigos = operacoes
    .map((chave) => {
      const ficha = contrato.get(chave);
      if (!ficha) return `<section><h2>${escapar(chave)}</h2></section>`;
      const corpo = ficha.exemploCorpo ? `<h3>Exemplo de corpo</h3><pre>${escapar(JSON.stringify(ficha.exemploCorpo, null, 2))}</pre>` : '';
      const respostas = ficha.respostas
        .map((resposta) => {
          const bruto = typeof resposta.exemplo === 'string' ? resposta.exemplo : JSON.stringify(resposta.exemplo ?? null, null, 2);
          const exemplo = resposta.vazio || resposta.binario ? '' : `<pre>${escapar(bruto)}</pre>`;
          return `<li><strong>${resposta.status}</strong> ${escapar(resposta.descricao)}${exemplo}</li>`;
        })
        .join('');
      return `<section><h2>${escapar(chave)}</h2><p>${escapar(ficha.descricao)}</p>${corpo}<h3>Status</h3><ul>${respostas}</ul></section>`;
    })
    .join('');
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="utf-8"><title>ReadMe — MayahTrip API</title></head>
<body>
<h1>MayahTrip API</h1>
<p>Contrato das rotas implementadas, o mesmo documento enviado ao ReadMe quando há chave. Exemplos e status saem do código que responde em produção.</p>
${artigos}
</body>
</html>`;
}

function escapar(valor: string): string {
  return String(valor).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}
