import { defineConfig } from 'vitest/config';
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
  // Optional: tune Vite for Node/ESM specifics
  // esm: { ... }, // not needed for most cases
});