import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/hono/**/*.test.ts', 'src/__tests__/integration/**/*.test.ts'],
    environment: 'node',
    globals: false,
    setupFiles: ['src/__tests__/integration/setup-env.ts'],
  },
});
