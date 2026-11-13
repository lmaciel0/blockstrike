import { expect, test } from 'vitest';
import { DT_SIM, MAX_PASSOS_POR_QUADRO, TICK_HZ, criarRelogio } from '@blockstrike/sim';

// Relógio de passo fixo: o quadro entrega o tempo real que passou e recebe de volta quantos passos de
// `DT_SIM` a simulação deve rodar. O resto fica acumulado para o quadro seguinte.

test('constantes do passo fixo: 60 Hz, DT_SIM = 1/60 e teto de 5 passos por quadro', () => {
  expect(TICK_HZ).toBe(60);
  expect(DT_SIM).toBe(1 / 60);
  expect(MAX_PASSOS_POR_QUADRO).toBe(5);
});

test('um quadro de 1/60 s roda 1 passo; um de 1/30 s roda 2', () => {
  const relogio = criarRelogio(60, 5);
  expect(relogio.avancar(1 / 60)).toBe(1);
  expect(relogio.avancar(1 / 30)).toBe(2);
});

test('sem tempo passado não há passo', () => {
  const relogio = criarRelogio(60, 5);
  expect(relogio.avancar(0)).toBe(0);
  expect(relogio.alfa()).toBe(0);
});

test('dt enorme (aba voltou do segundo plano com 5 s): para no teto e não deixa dívida', () => {
  const relogio = criarRelogio(60, 5);
  expect(relogio.avancar(5)).toBe(5);
  // O excedente foi descartado: o quadro seguinte roda 1 passo, não outros 5.
  expect(relogio.alfa()).toBe(0);
  expect(relogio.avancar(1 / 60)).toBe(1);
  expect(relogio.avancar(1 / 60)).toBe(1);
});

test('vários dt enormes seguidos nunca passam do teto nem travam o relógio', () => {
  const relogio = criarRelogio(60, 5);
  for (let i = 0; i < 100; i++) expect(relogio.avancar(5)).toBe(5);
  expect(relogio.avancar(1 / 60)).toBe(1);
});

test('exatamente o teto de passos não descarta nada', () => {
  const relogio = criarRelogio(60, 5);
  expect(relogio.avancar(5 / 60 + 1 / 120)).toBe(5);
  expect(relogio.alfa()).toBeCloseTo(0.5, 6);
});

test('alfa é a fração do passo corrente: meio passo acumulado dá 0,5', () => {
  const relogio = criarRelogio(60, 5);
  expect(relogio.avancar(1 / 120)).toBe(0);
  expect(relogio.alfa()).toBeCloseTo(0.5, 9);
  // A outra metade completa o passo e zera a fração.
  expect(relogio.avancar(1 / 120)).toBe(1);
  expect(relogio.alfa()).toBeCloseTo(0, 9);
});

test('alfa fica sempre em [0, 1) e nenhum tempo se perde abaixo do teto', () => {
  const relogio = criarRelogio(60, 5);
  let passos = 0;
  // 144 quadros de 1/144 s somam 1 s: 60 passos (com folga de 1 pelo arredondamento de ponto flutuante).
  for (let i = 0; i < 144; i++) {
    passos += relogio.avancar(1 / 144);
    expect(relogio.alfa()).toBeGreaterThanOrEqual(0);
    expect(relogio.alfa()).toBeLessThan(1);
  }
  expect(passos).toBeGreaterThanOrEqual(59);
  expect(passos).toBeLessThanOrEqual(60);
});

test('dt negativo ou inválido é ignorado', () => {
  const relogio = criarRelogio(60, 5);
  expect(relogio.avancar(-1)).toBe(0);
  expect(relogio.avancar(Number.NaN)).toBe(0);
  expect(relogio.avancar(1 / 60)).toBe(1);
});
