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
