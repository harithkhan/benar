import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { include: ['test/**/*.test.ts', '.claude/hooks/*.test.mjs'], environment: 'node' },
});
