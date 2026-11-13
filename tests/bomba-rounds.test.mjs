import test from 'node:test';
import assert from 'node:assert/strict';
import { mod } from './_repo.mjs';

const { criarPartida, tickPartida, terroristasDe } = await mod('js/games/blockstrike/rounds.js');
const { ROUND } = await mod('js/games/blockstrike/config.js');

const vivos = (a, l) => ({ azul: { n: a, hp: a * 100 }, laranja: { n: l, hp: l * 100 } });
const noJogo = () => {
  const p = criarPartida();
  p.fase = 'jogo';
  p.tempo = ROUND.duracao;
  return p;
};
const sem = { plantada: false, explodiu: false, desarmada: false };

test('terroristas: laranja até o round 12, azul depois da troca', () => {
  assert.equal(terroristasDe(1), 'laranja');
  assert.equal(terroristasDe(12), 'laranja');
  assert.equal(terroristasDe(13), 'azul');
  assert.equal(terroristasDe(24), 'azul');
  assert.equal(criarPartida().terroristas, 'laranja');
});

test('sem plantar: tempo esgotado dá o round aos CTs, não ao com mais vivos', () => {
  const p = noJogo();
  p.tempo = 0.01;
  assert.deepEqual(tickPartida(p, 0.05, vivos(1, 5), sem), ['fim-round']);
  assert.equal(p.vencedorRound, 'azul'); // azul é CT no round 1
  assert.equal(p.motivo, 'tempo');
});

test('sem plantar: eliminar os terroristas vence; eliminar os CTs dá aos terroristas', () => {
  const a = noJogo();
  tickPartida(a, 0.05, vivos(2, 0), sem);
  assert.equal(a.vencedorRound, 'azul');
  assert.equal(a.motivo, 'eliminacao');
  const b = noJogo();
  tickPartida(b, 0.05, vivos(0, 3), sem);
  assert.equal(b.vencedorRound, 'laranja');
});

test('plantada: o tempo do round deixa de valer e matar os terroristas não encerra', () => {
  const p = noJogo();
  p.tempo = 0.01;
  const plantada = { ...sem, plantada: true };
  assert.deepEqual(tickPartida(p, 0.05, vivos(3, 0), plantada), []);
  assert.equal(p.fase, 'jogo');
  assert.deepEqual(tickPartida(p, 0.05, vivos(0, 2), plantada), ['fim-round']);
  assert.equal(p.vencedorRound, 'laranja');
});

test('explosão dá o round aos terroristas; desarme, aos CTs', () => {
  const a = noJogo();
  tickPartida(a, 0.05, vivos(2, 2), { ...sem, plantada: true, explodiu: true });
  assert.equal(a.vencedorRound, 'laranja');
  assert.equal(a.motivo, 'bomba-explodiu');
  const b = noJogo();
  tickPartida(b, 0.05, vivos(2, 2), { ...sem, plantada: true, desarmada: true });
  assert.equal(b.vencedorRound, 'azul');
  assert.equal(b.motivo, 'bomba-desarmada');
});

test('depois da troca de lados o azul é terrorista', () => {
  const p = criarPartida();
  p.round = ROUND.trocaLados;
  p.fase = 'fim-round';
  p.tempo = 0.01;
  assert.deepEqual(tickPartida(p, 0.05, vivos(5, 5)), ['novo-round', 'troca-lados']);
  assert.equal(p.terroristas, 'azul');
  p.fase = 'jogo';
  p.tempo = 0.01;
  tickPartida(p, 0.05, vivos(5, 5), sem);
  assert.equal(p.vencedorRound, 'laranja'); // o tempo esgotou: CT (laranja agora) vence
});

test('sem o argumento bomba as regras antigas continuam valendo', () => {
  const p = noJogo();
  p.tempo = 0.01;
  tickPartida(p, 0.05, vivos(1, 5));
  assert.equal(p.vencedorRound, 'laranja');
});
