import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    include: ['packages/**/src/**/*.{test,spec}.{ts,tsx,js,mjs}'],
    environment: 'node',
    globals: true,          // allows describe/it without importing
    isolate: false,         // share Vite context across tests (faster, avoids some module issues)
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
    },
    // If you have tsconfig path aliases, Vitest will pick up root tsconfig by default.
  },
  resolve: {
    alias: {
        '@shopickup/core': path.resolve(__dirname, 'packages/core/src/index.ts'),
    }
  }
  // Optional: tune Vite for Node/ESM specifics
  // esm: { ... }, // not needed for most cases
});