import { defineConfig } from 'vitest/config';

// Os testes legados (tests/*.test.mjs) rodam com `tsx --test`; o Vitest só pega os portados (.test.ts).
export default defineConfig({
  test: {
    include: ['packages/**/*.test.ts', 'tests/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    // Testes de tipo (`expectTypeOf`): sem isto o Vitest só checa `*.test-d.ts` e as asserções passam em branco.
    // Ligado sempre, para o `npm test` também barrar erro de tipo nos testes.
    typecheck: {
      enabled: true,
      include: ['packages/*/test/**/*.test.ts'],
      tsconfig: './tsconfig.test.json',
    },
  },
});
