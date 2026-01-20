import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      'src/**/*.spec.ts',
      'src/**/*.test.ts',
      'src/**/__tests__/**/*.{spec,test}.{ts,js}',
    ],
    environment: 'node',
    globals: false,

  },
});
