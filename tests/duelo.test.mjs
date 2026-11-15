import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mod } from './_repo.mjs';

const { dueloEntrada } = await mod('tools/bs-duelo.mjs');
const carregar = (nome) => mod(`packages/sim/src/${nome}.js`);
const SEEDS = Array.from({ length: 20 }, (_, i) => i + 1);
async function duelos(dificuldade) {
  return Promise.all(SEEDS.map((s) => dueloEntrada(carregar, dificuldade, s)));
}
const minimo = (xs) => Math.min(...xs.filter((x) => x !== null));

test('dueloEntrada determinístico pela seed', async () => {
  const a = await dueloEntrada(carregar, 'medio', 7);
  const b = await dueloEntrada(carregar, 'medio', 7);
  assert.deepEqual(a, b);
  assert.ok(a.inicioMira !== null && a.primeiroTiro !== null, `o alvo foi visto e o bot reagiu: ${JSON.stringify(a)}`);
});

test('médio: nenhum tiro antes de 0,35 s', async () => {
  const ds = await duelos('medio');
  assert.ok(ds.some((d) => d.primeiroTiro !== null), 'algum duelo teve tiro');
  assert.ok(minimo(ds.map((d) => d.primeiroTiro)) >= 0.35, `min = ${minimo(ds.map((d) => d.primeiroTiro))}`);
});

test('difícil: mira nunca começa antes de 0,2 s', async () => {
  const ds = await duelos('dificil');
  assert.ok(ds.some((d) => d.inicioMira !== null), 'algum duelo teve mira');
  assert.ok(minimo(ds.map((d) => d.inicioMira)) >= 0.2, `min = ${minimo(ds.map((d) => d.inicioMira))}`);
});

// Task 9: medianas do duelo de entrada (seeds 1..50) nas faixas do spec. Duelo sem acerto conta como +∞
// (puxa a mediana para cima: bot que quase nunca acerta não passa).
const FAIXAS = {
  facil: { inicioMira: [0.45, 0.65], primeiroAcerto: [0.9, 1.5] },
  medio: { inicioMira: [0.32, 0.48], primeiroAcerto: [0.6, 1.0] },
  dificil: { inicioMira: [0.2, 0.3], primeiroAcerto: [0.38, 0.62] },
};
const medianaOuInf = (xs) => {
  const o = xs.map((x) => (x === null ? Infinity : x)).sort((a, b) => a - b);
  const m = o.length >> 1;
  return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2;
};

test('medianas do duelo dentro das faixas', async () => {
  const seeds = Array.from({ length: 50 }, (_, i) => i + 1);
  for (const [dif, faixas] of Object.entries(FAIXAS)) {
    const ds = await Promise.all(seeds.map((s) => dueloEntrada(carregar, dif, s)));
    for (const [campo, [min, max]] of Object.entries(faixas)) {
      const med = medianaOuInf(ds.map((d) => d[campo]));
      assert.ok(med >= min && med <= max, `${dif} ${campo}: mediana ${med} fora de [${min}, ${max}]`);
    }
  }
});
