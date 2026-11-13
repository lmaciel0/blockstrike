import { expect, test } from 'vitest';
import { criarPartida, ladoAzul, vencedorPorTempo, tickPartida } from '../src/rounds.js';
import { ROUND } from '../src/config.js';
import type { EventoPartida, Partida, Time, Vivos } from '../src/tipos.js';

const V = (a: number, ha: number, l: number, hl: number): Vivos => ({ azul: { n: a, hp: ha }, laranja: { n: l, hp: hl } });
const CHEIO = V(5, 500, 5, 500);

// Roda `segundos` em passos de 0,05 e devolve todos os eventos.
function rodar(p: Partida, segundos: number, vivos: Vivos | ((p: Partida) => Vivos)): EventoPartida[] {
  const eventos: EventoPartida[] = [];
  const n = Math.round(segundos / 0.05);
  for (let i = 0; i < n; i++) {
    const v = typeof vivos === 'function' ? vivos(p) : vivos;
    eventos.push(...tickPartida(p, 0.05, v));
  }
  return eventos;
}

// Avança até a fase pedida (com tempo máximo de segurança).
function ate(p: Partida, fase: Partida['fase'], vivos: Vivos): EventoPartida[] {
  const eventos: EventoPartida[] = [];
  for (let i = 0; i < 20000 && p.fase !== fase; i++) eventos.push(...tickPartida(p, 0.05, vivos));
  return eventos;
}

// Joga um round inteiro: freeze, uma eliminação (venceu = 'azul'|'laranja'|null) e fim-round.
function jogarRound(p: Partida, venceu: Time | null): EventoPartida[] {
  ate(p, 'jogo', CHEIO);
  const v = venceu === 'azul' ? V(3, 300, 0, 0)
    : venceu === 'laranja' ? V(0, 0, 3, 300)
      : V(0, 0, 0, 0);
  tickPartida(p, 0.05, v);
  return rodar(p, ROUND.fimRound + 0.1, CHEIO);
}

test('estado inicial', () => {
  const p = criarPartida();
  expect(p.placar).toStrictEqual({ azul: 0, laranja: 0 });
  expect(p.round).toBe(1);
  expect(p.fase).toBe('freeze');
  expect(p.tempo).toBe(ROUND.freeze);
  expect(p.vencedorRound).toBe(undefined);
  expect(p.motivo).toBe(null);
  expect(p.resultado).toBe(null);
});

test('freeze dura 5 s', () => {
  const p = criarPartida();
  const ev = rodar(p, 4.8, CHEIO);
  expect(p.fase).toBe('freeze');
  ev.push(...rodar(p, 0.3, CHEIO));
  expect(p.fase).toBe('jogo');
  expect(Math.abs(p.tempo - ROUND.duracao) < 0.5).toBeTruthy();
  expect(ev.includes('inicio-round')).toBeTruthy();
});

test('inicio da fase jogo tem tempo exato 115', () => {
  const p = criarPartida();
  tickPartida(p, 0.05, CHEIO);
  p.tempo = 0.01;
  tickPartida(p, 0.05, CHEIO);
  expect(p.fase).toBe('jogo');
  expect(p.tempo).toBe(ROUND.duracao);
});

test('eliminação dá o round', () => {
  const p = criarPartida();
  ate(p, 'jogo', CHEIO);
  const ev = tickPartida(p, 0.05, V(3, 200, 0, 0));
  expect(p.placar).toStrictEqual({ azul: 1, laranja: 0 });
  expect(p.vencedorRound).toBe('azul');
  expect(p.motivo).toBe('eliminacao');
  expect(p.fase).toBe('fim-round');
  expect(p.tempo).toBe(ROUND.fimRound);
  expect(ev.includes('fim-round')).toBeTruthy();
});

test('laranja vence por eliminação', () => {
  const p = criarPartida();
  ate(p, 'jogo', CHEIO);
  tickPartida(p, 0.05, V(0, 0, 2, 150));
  expect(p.placar).toStrictEqual({ azul: 0, laranja: 1 });
});

test('eliminação simultânea não pontua e a partida segue', () => {
  const p = criarPartida();
  ate(p, 'jogo', CHEIO);
  tickPartida(p, 0.05, V(0, 0, 0, 0));
  expect(p.placar).toStrictEqual({ azul: 0, laranja: 0 });
  expect(p.vencedorRound).toBe(null);
  expect(p.motivo).toBe('eliminacao');
  const ev = rodar(p, ROUND.fimRound + 0.1, CHEIO);
  expect(p.round).toBe(2);
  expect(p.fase).toBe('freeze');
  expect(ev.includes('novo-round')).toBeTruthy();
});

test('tempo esgotado: mais vivos vence', () => {
  const p = criarPartida();
  ate(p, 'jogo', CHEIO);
  p.tempo = 0.02;
  tickPartida(p, 0.05, V(3, 90, 2, 200));
  expect(p.vencedorRound).toBe('azul');
  expect(p.motivo).toBe('tempo');
  expect(p.placar.azul).toBe(1);
});

test('empate em vivos: mais HP vence', () => {
  expect(vencedorPorTempo(V(3, 100, 3, 250))).toBe('laranja');
  expect(vencedorPorTempo(V(3, 300, 3, 250))).toBe('azul');
});

test('empate total: ninguém', () => {
  expect(vencedorPorTempo(V(3, 250, 3, 250))).toBe(null);
  const p = criarPartida();
  ate(p, 'jogo', CHEIO);
  p.tempo = 0.02;
  tickPartida(p, 0.05, V(3, 250, 3, 250));
  expect(p.vencedorRound).toBe(null);
  expect(p.motivo).toBe('tempo');
  expect(p.placar).toStrictEqual({ azul: 0, laranja: 0 });
});

test('fim-round dura 3 s e incrementa o round', () => {
  const p = criarPartida();
  ate(p, 'jogo', CHEIO);
  tickPartida(p, 0.05, V(3, 300, 0, 0));
  const ev = rodar(p, 2.8, CHEIO);
  expect(p.fase).toBe('fim-round');
  ev.push(...rodar(p, 0.3, CHEIO));
  expect(p.fase).toBe('freeze');
  expect(p.round).toBe(2);
  expect(p.tempo > ROUND.freeze - 0.5).toBe(true);
  expect(ev.includes('novo-round')).toBeTruthy();
  expect(!ev.includes('troca-lados')).toBeTruthy();
});

test('troca de lados', () => {
  expect(ladoAzul(1)).toBe('A');
  expect(ladoAzul(12)).toBe('A');
  expect(ladoAzul(13)).toBe('B');
  const p = criarPartida();
  let eventos: EventoPartida[] = [];
  for (let r = 1; r <= 12; r++) eventos = jogarRound(p, r % 2 ? 'azul' : 'laranja');
  expect(p.round).toBe(13);
  expect(eventos.includes('troca-lados')).toBeTruthy();
});

test('13 vitórias encerra', () => {
  const p = criarPartida();
  let ev: EventoPartida[] = [];
  for (let r = 1; r <= 13; r++) {
    expect(p.resultado).toBe(null);
    ev = jogarRound(p, 'azul');
  }
  expect(p.fase).toBe('fim-partida');
  expect(p.resultado).toBe('azul');
  expect(p.placar).toStrictEqual({ azul: 13, laranja: 0 });
  expect(ev.includes('fim-partida')).toBeTruthy();
  expect(!ev.includes('novo-round')).toBeTruthy();
});

test('12×12 é empate', () => {
  const p = criarPartida();
  for (let r = 1; r <= 24; r++) jogarRound(p, r % 2 ? 'azul' : 'laranja');
  expect(p.placar).toStrictEqual({ azul: 12, laranja: 12 });
  expect(p.fase).toBe('fim-partida');
  expect(p.resultado).toBe('empate');
});

test('round 24 com rounds nulos: 11×12 dá laranja', () => {
  const p = criarPartida();
  for (let r = 1; r <= 24; r++) {
    // 12 vitórias laranja, 11 azul, e um round nulo
    const venceu = r <= 11 ? 'azul' : r <= 23 ? 'laranja' : null;
    jogarRound(p, venceu);
  }
  expect(p.placar).toStrictEqual({ azul: 11, laranja: 12 });
  expect(p.resultado).toBe('laranja');
});

test('fim-partida não faz nada', () => {
  const p = criarPartida();
  for (let r = 1; r <= 13; r++) jogarRound(p, 'azul');
  const antes = JSON.stringify(p);
  const ev = rodar(p, 5, CHEIO);
  expect(ev).toStrictEqual([]);
  expect(JSON.stringify(p)).toBe(antes);
});

test('dt gigante limitado a 0,05', () => {
  const p = criarPartida();
  tickPartida(p, 10, CHEIO);
  expect(Math.abs(p.tempo - 4.95) < 1e-9).toBeTruthy();
  expect(p.fase).toBe('freeze');
});
