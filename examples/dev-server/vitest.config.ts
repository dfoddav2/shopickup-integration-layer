import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/tests/**/*.{test,spec}.{ts,tsx,js,mjs}'],
    environment: 'node',
    globals: true,
  },
});
