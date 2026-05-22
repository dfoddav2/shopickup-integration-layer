import { defineConfig } from 'vitest/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: rootDir,
  test: {
    include: ['src/tests/live/**/*.live.spec.ts'],
    environment: 'node',
    globals: false,
    testTimeout: 30000,
  },
});
