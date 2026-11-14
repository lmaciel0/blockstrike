/**
 * RNG determinístico (mulberry32) — mesma seed, mesma sequência.
 */

import type { Rng } from './tipos.js';

export function criarRng(seed: number): Rng {
  let estado = seed >>> 0;
  return function proximo() {
    estado = (estado + 0x6d2b79f5) >>> 0;
    let t = estado;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Normal padrão (Box-Muller) com o `rng` dado; consome sempre dois sorteios, na ordem. */
export function gauss(rng: Rng): number {
  const u = Math.max(rng(), 1e-12);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
}
