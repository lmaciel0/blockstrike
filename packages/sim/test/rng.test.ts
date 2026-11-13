import { expect, test } from 'vitest';
import { criarRng } from '../src/rng.js';

// Sementes fora do caso comum (inteiro positivo): zero, negativa e fracionária.
test.each([0, -5, 1.5])('criarRng(%s) gera números finitos em [0, 1) e é determinístico', (seed) => {
  const a = criarRng(seed);
  const b = criarRng(seed);
  const sa = Array.from({ length: 20 }, () => a());
  const sb = Array.from({ length: 20 }, () => b());
  for (const v of sa) {
    expect(Number.isFinite(v)).toBe(true);
    expect(v >= 0 && v < 1).toBe(true);
  }
  expect(sa).toStrictEqual(sb);
});
