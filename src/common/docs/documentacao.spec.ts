import { afterEach, describe, expect, it, vi } from 'vitest';
import { Logger } from '@nestjs/common';
import {
  URL_PUBLICACAO_README,
  documentacaoPublica,
  htmlReadme,
  publicarNoReadme,
} from './documentacao';

describe('documentação pública', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('deve ficar pública só em development e test', () => {
    expect(documentacaoPublica('development')).toBe(true);
    expect(documentacaoPublica('test')).toBe(true);
    expect(documentacaoPublica('production')).toBe(false);
  });

  it('deve listar as operações na página do ReadMe e escapar HTML', () => {
    const html = htmlReadme(['POST /v1/auth/sign-up', 'GET /metrics', 'GET /<rota>']);

    expect(html).toContain('POST /v1/auth/sign-up');
    expect(html).toContain('GET /metrics');
    expect(html).toContain('GET /&lt;rota&gt;');
    expect(html).not.toContain('GET /<rota>');
  });

  it('deve renderizar a lista vazia sem item', () => {
    expect(htmlReadme([])).not.toContain('<li>');
  });

  it('deve não chamar o ReadMe sem chave', async () => {
    const fetchImpl = vi.fn();

    await publicarNoReadme({
      documento: { openapi: '3.0.0' },
      ambiente: 'development',
      chave: '  ',
      fetchImpl,
    });

    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('deve não chamar o ReadMe fora de local e teste', async () => {
    const fetchImpl = vi.fn();

    await publicarNoReadme({
      documento: { openapi: '3.0.0' },
      ambiente: 'production',
      chave: 'segredo-teste',
      fetchImpl,
    });

    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('deve enviar o OpenAPI ao ReadMe em development quando há chave', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 202 });

    await publicarNoReadme({
      documento: { openapi: '3.0.0', paths: {} },
      ambiente: 'test',
      chave: 'segredo-teste',
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      URL_PUBLICACAO_README,
      expect.objectContaining({
        method: 'POST',
        headers: { Authorization: 'Bearer segredo-teste' },
      }),
    );
    const corpo = fetchImpl.mock.calls[0]?.[1].body as FormData;
    expect(corpo).toBeInstanceOf(FormData);
    expect(corpo.get('upload_source')).toBe('form');
    expect(corpo.get('schema')).toBeTruthy();
  });

  it('deve seguir no ar quando o ReadMe recusa, sem logar a chave', async () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 401 });

    await expect(
      publicarNoReadme({
        documento: { openapi: '3.0.0' },
        ambiente: 'development',
        chave: 'segredo-teste',
        fetchImpl,
      }),
    ).resolves.toBeUndefined();

    expect(warn).toHaveBeenCalled();
    expect(JSON.stringify(warn.mock.calls)).not.toContain('segredo-teste');
  });
});
