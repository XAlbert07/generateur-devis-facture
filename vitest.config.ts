import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      'frontend/e2e/**',
      '**/e2e-results/**',
    ],
  },
});
