import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mod } from './_repo.mjs';

const { resumoPartida } = await mod('tools/baseline.mjs');
const carregar = (nome) => mod(`packages/sim/src/${nome}.js`);

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
  // Vitórias por papel: todo round com vencedor conta para T ou para CT, e o placar por time soma o mesmo.
  assert.ok(Number.isInteger(a.vitoriasT) && Number.isInteger(a.vitoriasCT));
  assert.equal(a.vitoriasT + a.vitoriasCT, a.placar.azul + a.placar.laranja);
  assert.ok(a.vitoriasT + a.vitoriasCT <= a.rounds);
});

test('resumoPartida: dt variável é determinístico pela seed', async () => {
  const a = await resumoPartida(carregar, 'facil', 2, { modo: 'variavel', seed: 2 });
  const b = await resumoPartida(carregar, 'facil', 2, { modo: 'variavel', seed: 2 });
  assert.deepEqual(a, b);
  assert.match(a.hash, /^[0-9a-f]{8}$/);
  assert.ok(a.rounds >= 13, `rounds=${a.rounds}`);
});

test('resumoPartida: relógio de passo fixo termina a partida e difere do dt variável só no passo', async () => {
  const a = await resumoPartida(carregar, 'facil', 2, { modo: 'relogio', seed: 2 });
  assert.match(a.hash, /^[0-9a-f]{8}$/);
  assert.ok(a.rounds >= 13 && a.rounds <= 24, `rounds=${a.rounds}`);
  assert.ok(a.mortes > 0);
  assert.equal(a.vitoriasT + a.vitoriasCT, a.placar.azul + a.placar.laranja);
});

// Regenera as seeds 1..5 com `--dt=relogio` e confere byte a byte com tools/baseline/ts-plano2.json:
// é o que garante que o passo fixo segue determinístico (mesma seed, mesma partida).
test('baseline:check imprime IDENTICO', { timeout: 900_000 }, () => {
  const saida = execFileSync('npm', ['run', '--silent', 'baseline:check'], {
    cwd: process.env.REPO ?? process.cwd(),
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  assert.match(saida, /IDENTICO/);
});
