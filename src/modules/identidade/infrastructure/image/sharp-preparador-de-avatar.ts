import { Injectable } from '@nestjs/common';
import sharp from 'sharp';
import { PreparadorDeAvatar } from '../../domain/ports/preparador-de-avatar.port';

const LADO = 256;

@Injectable()
export class SharpPreparadorDeAvatar implements PreparadorDeAvatar {
  async preparar(bytes: Buffer, mime: string): Promise<{ bytes: Buffer; mime: string }> {
    const formato = mime === 'image/png' ? 'png' : mime === 'image/jpeg' || mime === 'image/jpg' ? 'jpeg' : null;
    if (!formato) {
      throw new Error('mime');
    }

    const rotacionada = await sharp(bytes, { failOn: 'error' }).rotate().toBuffer();
    const meta = await sharp(rotacionada).metadata();
    if (!meta.width || !meta.height) {
      throw new Error('sem tamanho');
    }

    const lado = Math.min(meta.width, meta.height);
    const left = Math.floor((meta.width - lado) / 2);
    const top = Math.floor((meta.height - lado) / 2);
    const saida = await sharp(rotacionada)
      .extract({ left, top, width: lado, height: lado })
      .resize(LADO, LADO)
      .toFormat(formato)
      .toBuffer();

    return { bytes: saida, mime: formato === 'png' ? 'image/png' : 'image/jpeg' };
  }
}
