import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    globals: true,
  },
  resolve: {
    alias: {
      '@panel1/types': resolve(__dirname, '../types/src'),
    },
  },
});
