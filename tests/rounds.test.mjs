import test from 'node:test';
import assert from 'node:assert/strict';
import { mod } from './_repo.mjs';

const { criarPartida, ladoAzul, vencedorPorTempo, tickPartida } = await mod('packages/sim/src/rounds.js');
const { ROUND } = await mod('packages/sim/src/config.js');

const V = (a, ha, l, hl) => ({ azul: { n: a, hp: ha }, laranja: { n: l, hp: hl } });
const CHEIO = V(5, 500, 5, 500);

// Roda `segundos` em passos de 0,05 e devolve todos os eventos.
function rodar(p, segundos, vivos) {
  const eventos = [];
  const n = Math.round(segundos / 0.05);
  for (let i = 0; i < n; i++) {
    const v = typeof vivos === 'function' ? vivos(p) : vivos;
    eventos.push(...tickPartida(p, 0.05, v));
  }
  return eventos;
}

// Avança até a fase pedida (com tempo máximo de segurança).
function ate(p, fase, vivos) {
  const eventos = [];
  for (let i = 0; i < 20000 && p.fase !== fase; i++) eventos.push(...tickPartida(p, 0.05, vivos));
  return eventos;
}

// Joga um round inteiro: freeze, uma eliminação (venceu = 'azul'|'laranja'|null) e fim-round.
function jogarRound(p, venceu) {
  ate(p, 'jogo', CHEIO);
  const v = venceu === 'azul' ? V(3, 300, 0, 0)
    : venceu === 'laranja' ? V(0, 0, 3, 300)
      : V(0, 0, 0, 0);
  tickPartida(p, 0.05, v);
  return rodar(p, ROUND.fimRound + 0.1, CHEIO);
}

test('estado inicial', () => {
  const p = criarPartida();
  assert.deepEqual(p.placar, { azul: 0, laranja: 0 });
  assert.equal(p.round, 1);
  assert.equal(p.fase, 'freeze');
  assert.equal(p.tempo, ROUND.freeze);
  assert.equal(p.vencedorRound, undefined);
  assert.equal(p.motivo, null);
  assert.equal(p.resultado, null);
});

test('freeze dura 5 s', () => {
  const p = criarPartida();
  const ev = rodar(p, 4.8, CHEIO);
  assert.equal(p.fase, 'freeze');
  ev.push(...rodar(p, 0.3, CHEIO));
  assert.equal(p.fase, 'jogo');
  assert.ok(Math.abs(p.tempo - ROUND.duracao) < 0.5);
  assert.ok(ev.includes('inicio-round'));
});

test('inicio da fase jogo tem tempo exato 115', () => {
  const p = criarPartida();
  tickPartida(p, 0.05, CHEIO);
  p.tempo = 0.01;
  tickPartida(p, 0.05, CHEIO);
  assert.equal(p.fase, 'jogo');
  assert.equal(p.tempo, ROUND.duracao);
});

test('eliminação dá o round', () => {
  const p = criarPartida();
  ate(p, 'jogo', CHEIO);
  const ev = tickPartida(p, 0.05, V(3, 200, 0, 0));
  assert.deepEqual(p.placar, { azul: 1, laranja: 0 });
  assert.equal(p.vencedorRound, 'azul');
  assert.equal(p.motivo, 'eliminacao');
  assert.equal(p.fase, 'fim-round');
  assert.equal(p.tempo, ROUND.fimRound);
  assert.ok(ev.includes('fim-round'));
});

test('laranja vence por eliminação', () => {
  const p = criarPartida();
  ate(p, 'jogo', CHEIO);
  tickPartida(p, 0.05, V(0, 0, 2, 150));
  assert.deepEqual(p.placar, { azul: 0, laranja: 1 });
});

test('eliminação simultânea não pontua e a partida segue', () => {
  const p = criarPartida();
  ate(p, 'jogo', CHEIO);
  tickPartida(p, 0.05, V(0, 0, 0, 0));
  assert.deepEqual(p.placar, { azul: 0, laranja: 0 });
  assert.equal(p.vencedorRound, null);
  assert.equal(p.motivo, 'eliminacao');
  const ev = rodar(p, ROUND.fimRound + 0.1, CHEIO);
  assert.equal(p.round, 2);
  assert.equal(p.fase, 'freeze');
  assert.ok(ev.includes('novo-round'));
});

test('tempo esgotado: mais vivos vence', () => {
  const p = criarPartida();
  ate(p, 'jogo', CHEIO);
  p.tempo = 0.02;
  tickPartida(p, 0.05, V(3, 90, 2, 200));
  assert.equal(p.vencedorRound, 'azul');
  assert.equal(p.motivo, 'tempo');
  assert.equal(p.placar.azul, 1);
});

test('empate em vivos: mais HP vence', () => {
  assert.equal(vencedorPorTempo(V(3, 100, 3, 250)), 'laranja');
  assert.equal(vencedorPorTempo(V(3, 300, 3, 250)), 'azul');
});

test('empate total: ninguém', () => {
  assert.equal(vencedorPorTempo(V(3, 250, 3, 250)), null);
  const p = criarPartida();
  ate(p, 'jogo', CHEIO);
  p.tempo = 0.02;
  tickPartida(p, 0.05, V(3, 250, 3, 250));
  assert.equal(p.vencedorRound, null);
  assert.equal(p.motivo, 'tempo');
  assert.deepEqual(p.placar, { azul: 0, laranja: 0 });
});

test('fim-round dura 3 s e incrementa o round', () => {
  const p = criarPartida();
  ate(p, 'jogo', CHEIO);
  tickPartida(p, 0.05, V(3, 300, 0, 0));
  const ev = rodar(p, 2.8, CHEIO);
  assert.equal(p.fase, 'fim-round');
  ev.push(...rodar(p, 0.3, CHEIO));
  assert.equal(p.fase, 'freeze');
  assert.equal(p.round, 2);
  assert.equal(p.tempo > ROUND.freeze - 0.5, true);
  assert.ok(ev.includes('novo-round'));
  assert.ok(!ev.includes('troca-lados'));
});

test('troca de lados', () => {
  assert.equal(ladoAzul(1), 'A');
  assert.equal(ladoAzul(12), 'A');
  assert.equal(ladoAzul(13), 'B');
  const p = criarPartida();
  let eventos = [];
  for (let r = 1; r <= 12; r++) eventos = jogarRound(p, r % 2 ? 'azul' : 'laranja');
  assert.equal(p.round, 13);
  assert.ok(eventos.includes('troca-lados'));
});

test('13 vitórias encerra', () => {
  const p = criarPartida();
  let ev = [];
  for (let r = 1; r <= 13; r++) {
    assert.equal(p.resultado, null);
    ev = jogarRound(p, 'azul');
  }
  assert.equal(p.fase, 'fim-partida');
  assert.equal(p.resultado, 'azul');
  assert.deepEqual(p.placar, { azul: 13, laranja: 0 });
  assert.ok(ev.includes('fim-partida'));
  assert.ok(!ev.includes('novo-round'));
});

test('12×12 é empate', () => {
  const p = criarPartida();
  for (let r = 1; r <= 24; r++) jogarRound(p, r % 2 ? 'azul' : 'laranja');
  assert.deepEqual(p.placar, { azul: 12, laranja: 12 });
  assert.equal(p.fase, 'fim-partida');
  assert.equal(p.resultado, 'empate');
});

test('round 24 com rounds nulos: 11×12 dá laranja', () => {
  const p = criarPartida();
  for (let r = 1; r <= 24; r++) {
    // 12 vitórias laranja, 11 azul, e um round nulo
    const venceu = r <= 11 ? 'azul' : r <= 23 ? 'laranja' : null;
    jogarRound(p, venceu);
  }
  assert.deepEqual(p.placar, { azul: 11, laranja: 12 });
  assert.equal(p.resultado, 'laranja');
});

test('fim-partida não faz nada', () => {
  const p = criarPartida();
  for (let r = 1; r <= 13; r++) jogarRound(p, 'azul');
  const antes = JSON.stringify(p);
  const ev = rodar(p, 5, CHEIO);
  assert.deepEqual(ev, []);
  assert.equal(JSON.stringify(p), antes);
});

test('dt gigante limitado a 0,05', () => {
  const p = criarPartida();
  tickPartida(p, 10, CHEIO);
  assert.ok(Math.abs(p.tempo - 4.95) < 1e-9);
  assert.equal(p.fase, 'freeze');
});
