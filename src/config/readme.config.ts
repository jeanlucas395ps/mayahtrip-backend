import { registerAs } from '@nestjs/config';

export interface ReadmeConfig {
  apiKey: string;
}

export const readmeConfig = registerAs(
  'readme',
  (): ReadmeConfig => ({
    apiKey: process.env.README_API_KEY ?? '',
  }),
);
