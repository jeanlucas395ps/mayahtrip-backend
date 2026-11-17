import { build } from 'esbuild';

/**
 * `tsc` com `module: esnext` não reescreve especificadores relativos sem
 * extensão (`./app.module`), e o loader ESM nativo do Node exige extensão
 * explícita — `node dist/main.js` falhava com `ERR_MODULE_NOT_FOUND`.
 * `esbuild` em modo bundle resolve e embute o grafo de import relativo da
 * aplicação; `packages: 'external'` deixa as dependências de
 * `node_modules` de fora do bundle, resolvidas normalmente em runtime.
 *
 * `emitDecoratorMetadata` não é suportado por este bundler (mesma
 * limitação de `tsx`); por isso todo provider deste projeto usa
 * `@Inject()` explícito e os DTOs de borda usam `expectedType` explícito
 * no `ValidationPipe`, em vez de depender de reflexão implícita.
 */
await build({
  entryPoints: ['src/main.ts'],
  outfile: 'dist/main.js',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  packages: 'external',
  sourcemap: true,
  logLevel: 'info',
});
