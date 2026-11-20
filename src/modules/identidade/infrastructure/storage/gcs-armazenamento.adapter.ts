import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { Storage } from '@google-cloud/storage';
import { storageConfig } from '../../../../config/storage.config';
import { ArmazenamentoDeArquivo, OpcoesDeArmazenamento } from '../../domain/ports/armazenamento.port';

@Injectable()
export class GcsArmazenamento implements ArmazenamentoDeArquivo {
  private cliente: Storage | null = null;

  constructor(@Inject(storageConfig.KEY) private readonly config: ConfigType<typeof storageConfig>) {}

  async guardar(chave: string, bytes: Buffer, mime: string, opcoes?: OpcoesDeArmazenamento): Promise<void> {
    await this.arquivo(chave, opcoes).save(bytes, { contentType: mime, resumable: false });
  }

  async ler(chave: string, opcoes?: OpcoesDeArmazenamento): Promise<{ bytes: Buffer; mime: string } | null> {
    const arquivo = this.arquivo(chave, opcoes);
    const [existe] = await arquivo.exists();
    if (!existe) return null;
    const [bytes] = await arquivo.download();
    const [meta] = await arquivo.getMetadata();
    return { bytes, mime: meta.contentType ?? 'application/octet-stream' };
  }

  async apagar(chave: string, opcoes?: OpcoesDeArmazenamento): Promise<void> {
    await this.arquivo(chave, opcoes).delete({ ignoreNotFound: true });
  }

  private arquivo(chave: string, opcoes?: OpcoesDeArmazenamento) {
    const bucket = (opcoes?.bucket || this.config.bucket || '').trim();
    if (!bucket) {
      throw new Error('GCS_BUCKET / GCS_BUCKET_PLACES vazio');
    }
    this.cliente ??= new Storage();
    return this.cliente.bucket(bucket).file(chave);
  }
}
