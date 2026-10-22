import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: { alias: { '@': path.resolve(import.meta.dirname) } },
  // PGlite (Postgres em WebAssembly) demora a subir quando vários arquivos de banco rodam juntos: o limite padrão de 10 s do beforeAll estoura de vez em quando.
  test: { include: ['tests/**/*.test.ts'], hookTimeout: 60_000, testTimeout: 30_000 },
});
