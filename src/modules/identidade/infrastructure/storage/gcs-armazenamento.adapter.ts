import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { Storage } from '@google-cloud/storage';
import { storageConfig } from '../../../../config/storage.config';
import { ArmazenamentoDeArquivo } from '../../domain/ports/armazenamento.port';

@Injectable()
export class GcsArmazenamento implements ArmazenamentoDeArquivo {
  private cliente: Storage | null = null;

  constructor(@Inject(storageConfig.KEY) private readonly config: ConfigType<typeof storageConfig>) {}

  async guardar(chave: string, bytes: Buffer, mime: string): Promise<void> {
    await this.arquivo(chave).save(bytes, { contentType: mime, resumable: false });
  }

  async ler(chave: string): Promise<{ bytes: Buffer; mime: string } | null> {
    const arquivo = this.arquivo(chave);
    const [existe] = await arquivo.exists();
    if (!existe) return null;
    const [bytes] = await arquivo.download();
    const [meta] = await arquivo.getMetadata();
    return { bytes, mime: meta.contentType ?? 'application/octet-stream' };
  }

  async apagar(chave: string): Promise<void> {
    await this.arquivo(chave).delete({ ignoreNotFound: true });
  }

  private arquivo(chave: string) {
    if (!this.config.bucket) {
      throw new Error('GCS_BUCKET vazio');
    }
    this.cliente ??= new Storage();
    return this.cliente.bucket(this.config.bucket).file(chave);
  }
}
