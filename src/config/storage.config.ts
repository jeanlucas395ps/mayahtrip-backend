import { registerAs } from '@nestjs/config';

export interface StorageConfig {
  bucket: string;
}

/** Bucket do Cloud Storage. Vazio recusa o upload. O nome não é decisão de produto. */
export const storageConfig = registerAs('storage', (): StorageConfig => ({
  bucket: process.env.GCS_BUCKET ?? '',
}));
