import { defineConfig } from 'vitest/config';

// Os testes legados (tests/*.test.mjs) rodam com `tsx --test`; o Vitest só pega os portados (.test.ts).
export default defineConfig({
  test: {
    include: ['packages/**/*.test.ts', 'tests/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
  },
});
