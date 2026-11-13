import { expect, test } from 'vitest';
import { criarPartida, tickPartida, terroristasDe } from '../src/rounds.js';
import { ROUND } from '../src/config.js';
import type { EstadoBomba, Partida, Vivos } from '../src/tipos.js';

const vivos = (a: number, l: number): Vivos => ({ azul: { n: a, hp: a * 100 }, laranja: { n: l, hp: l * 100 } });
const noJogo = (): Partida => {
  const p = criarPartida();
  p.fase = 'jogo';
  p.tempo = ROUND.duracao;
  return p;
};
const sem: EstadoBomba = { plantada: false, explodiu: false, desarmada: false };

test('terroristas: laranja até o round 12, azul depois da troca', () => {
  expect(terroristasDe(1)).toBe('laranja');
  expect(terroristasDe(12)).toBe('laranja');
  expect(terroristasDe(13)).toBe('azul');
  expect(terroristasDe(24)).toBe('azul');
  expect(criarPartida().terroristas).toBe('laranja');
});

test('sem plantar: tempo esgotado dá o round aos CTs, não ao com mais vivos', () => {
  const p = noJogo();
  p.tempo = 0.01;
  expect(tickPartida(p, 0.05, vivos(1, 5), sem)).toStrictEqual(['fim-round']);
  expect(p.vencedorRound).toBe('azul'); // azul é CT no round 1
  expect(p.motivo).toBe('tempo');
});

test('sem plantar: eliminar os terroristas vence; eliminar os CTs dá aos terroristas', () => {
  const a = noJogo();
  tickPartida(a, 0.05, vivos(2, 0), sem);
  expect(a.vencedorRound).toBe('azul');
  expect(a.motivo).toBe('eliminacao');
  const b = noJogo();
  tickPartida(b, 0.05, vivos(0, 3), sem);
  expect(b.vencedorRound).toBe('laranja');
});

test('plantada: o tempo do round deixa de valer e matar os terroristas não encerra', () => {
  const p = noJogo();
  p.tempo = 0.01;
  const plantada = { ...sem, plantada: true };
  expect(tickPartida(p, 0.05, vivos(3, 0), plantada)).toStrictEqual([]);
  expect(p.fase).toBe('jogo');
  expect(tickPartida(p, 0.05, vivos(0, 2), plantada)).toStrictEqual(['fim-round']);
  expect(p.vencedorRound).toBe('laranja');
});

test('explosão dá o round aos terroristas; desarme, aos CTs', () => {
  const a = noJogo();
  tickPartida(a, 0.05, vivos(2, 2), { ...sem, plantada: true, explodiu: true });
  expect(a.vencedorRound).toBe('laranja');
  expect(a.motivo).toBe('bomba-explodiu');
  const b = noJogo();
  tickPartida(b, 0.05, vivos(2, 2), { ...sem, plantada: true, desarmada: true });
  expect(b.vencedorRound).toBe('azul');
  expect(b.motivo).toBe('bomba-desarmada');
});

test('depois da troca de lados o azul é terrorista', () => {
  const p = criarPartida();
  p.round = ROUND.trocaLados;
  p.fase = 'fim-round';
  p.tempo = 0.01;
  expect(tickPartida(p, 0.05, vivos(5, 5))).toStrictEqual(['novo-round', 'troca-lados']);
  expect(p.terroristas).toBe('azul');
  p.fase = 'jogo';
  p.tempo = 0.01;
  tickPartida(p, 0.05, vivos(5, 5), sem);
  expect(p.vencedorRound).toBe('laranja'); // o tempo esgotou: CT (laranja agora) vence
});

test('sem o argumento bomba as regras antigas continuam valendo', () => {
  const p = noJogo();
  p.tempo = 0.01;
  tickPartida(p, 0.05, vivos(1, 5));
  expect(p.vencedorRound).toBe('laranja');
});
