import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./app', import.meta.url)) } },
  oxc: { jsx: { runtime: 'automatic' } },
  test: { include: ['app/**/*.test.{ts,tsx}', '*.test.ts'] },
});
