import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mod } from './_repo.mjs';

const { resumoPartida } = await mod('tools/baseline.mjs');
const carregar = (nome) => mod(`js/games/blockstrike/${nome}.js`);

test('resumoPartida: dt fixo é determinístico e bem formado', async () => {
  const a = await resumoPartida(carregar, 'medio', 3, { modo: 'fixo', dt: 1 / 60 });
  const b = await resumoPartida(carregar, 'medio', 3, { modo: 'fixo', dt: 1 / 60 });
  assert.deepEqual(a, b);
  assert.match(a.hash, /^[0-9a-f]{8}$/);
  assert.ok(a.rounds >= 13, `rounds=${a.rounds}`);
  assert.equal(typeof a.placar.azul, 'number');
  assert.equal(typeof a.placar.laranja, 'number');
  assert.ok(a.mortes > 0);
  assert.ok(a.cabecas <= a.mortes);
  assert.ok(Number.isInteger(a.presos) && a.presos >= 0);
  assert.ok(Array.isArray(a.dinheiroFinal) && a.dinheiroFinal.length > 0);
});

test('resumoPartida: dt variável é determinístico pela seed', async () => {
  const a = await resumoPartida(carregar, 'facil', 2, { modo: 'variavel', seed: 2 });
  const b = await resumoPartida(carregar, 'facil', 2, { modo: 'variavel', seed: 2 });
  assert.deepEqual(a, b);
  assert.match(a.hash, /^[0-9a-f]{8}$/);
  assert.ok(a.rounds >= 13, `rounds=${a.rounds}`);
});
