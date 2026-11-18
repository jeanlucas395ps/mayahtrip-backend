import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { SharpPreparadorDeAvatar } from './sharp-preparador-de-avatar';

describe('SharpPreparadorDeAvatar', () => {
  const preparador = new SharpPreparadorDeAvatar();

  it('recorta o centro de uma imagem larga e reduz para 256', async () => {
    const origem = await sharp({
      create: { width: 400, height: 200, channels: 3, background: { r: 10, g: 20, b: 30 } },
    })
      .jpeg()
      .toBuffer();

    const pronto = await preparador.preparar(origem, 'image/jpeg');
    const meta = await sharp(pronto.bytes).metadata();

    expect(pronto.mime).toBe('image/jpeg');
    expect(meta.width).toBe(256);
    expect(meta.height).toBe(256);
  });

  it('recusa o que não é JPG nem PNG', async () => {
    await expect(preparador.preparar(Buffer.from('texto'), 'text/plain')).rejects.toThrow('mime');
  });
});
