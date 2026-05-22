import { defineConfig } from 'vitest/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: rootDir,
  test: {
    include: [
      'src/tests/unit/**/*.{spec,test}.ts',
      'src/tests/mock/**/*.{spec,test}.ts',
    ],
    environment: 'node',
    globals: false,
  },
});
