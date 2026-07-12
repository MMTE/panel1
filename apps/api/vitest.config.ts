import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      'src/hono/**/*.test.ts',
      'src/__tests__/integration/**/*.test.ts',
      'src/lib/auth/**/*.test.ts',
      'src/lib/**/*.test.ts',
      'src/*.test.ts',
    ],
    environment: 'node',
    globals: false,
    setupFiles: ['src/__tests__/integration/setup-env.ts'],
  },
});
