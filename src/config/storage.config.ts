import { registerAs } from '@nestjs/config';

export interface StorageConfig {
  bucket: string;
  /** Bucket de mídia de lugares (`GCS_BUCKET_PLACES`, ex.: mayahtrip-places). */
  bucketPlaces: string;
}

/** Bucket do Cloud Storage. Vazio recusa o upload. O nome não é decisão de produto. */
export const storageConfig = registerAs('storage', (): StorageConfig => ({
  bucket: process.env.GCS_BUCKET ?? process.env.GCS_BUCKET_PLACES ?? '',
  bucketPlaces: process.env.GCS_BUCKET_PLACES || process.env.GCS_BUCKET || '',
}));
