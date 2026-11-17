import { expect, test } from 'vitest';
import { criarArma, podeAtirar, disparar, atualizarArma, iniciarRecarga, danoDe } from '../src/armas.js';
import { criarRng } from '../src/rng.js';
import { ARMAS, RECUO_MAX } from '../src/config.js';
import type { Desvio, EstadoTiro, TipoArma } from '../src/tipos.js';

const PARADO: EstadoTiro = { velHoriz: 0, velMax: 5.5, noChao: true, agachado: false, zoom: false };
const media = (lista: number[]): number => lista.reduce((s, v) => s + Math.abs(v), 0) / lista.length;

function espalhamento(tipo: TipoArma, estado: EstadoTiro, n = 200): number {
  const rng = criarRng(7);
  const dxs: number[] = [];
  for (let i = 0; i < n; i++) {
    const arma = criarArma(tipo); // recuo zerado a cada disparo: mede só o spread
    dxs.push(...disparar(arma, 0, estado, rng).map((d) => d.dx));
  }
  return media(dxs);
}

test('criarArma começa cheia', () => {
  const a = criarArma('rifle');
  expect(a).toStrictEqual({
    tipo: 'rifle', municao: 30, reserva: 90, prontaEm: 0, recarregandoAte: 0, recuoAcum: 0, gatilhoSolto: true,
  });
  expect(criarArma('faca').municao).toBe(Infinity);
});

test('danoDe aplica o multiplicador da parte', () => {
  expect(danoDe('rifle', 'cabeca')).toBe(90); // 36 × 2,5 (cabeça ×2,5)
  expect(danoDe('rifle', 'pernas')).toBe(27);
  expect(danoDe('sniper', 'tronco')).toBe(115);
  expect(danoDe('faca', 'tronco')).toBe(40);
});

test('cadência do rifle', () => {
  const a = criarArma('rifle');
  const rng = criarRng(1);
  expect(podeAtirar(a, 0, true)).toBe(true);
  disparar(a, 0, PARADO, rng);
  expect(a.municao).toBe(29);
  expect(podeAtirar(a, 0.09, true)).toBe(false);
  expect(podeAtirar(a, 0.1, true)).toBe(true);
});

test('sem gatilho não atira', () => {
  expect(podeAtirar(criarArma('rifle'), 0, false)).toBe(false);
});

test('pistola é semi', () => {
  const a = criarArma('pistola');
  const rng = criarRng(1);
  expect(podeAtirar(a, 0, true)).toBe(true);
  disparar(a, 0, PARADO, rng);
  atualizarArma(a, 1, 1, true); // gatilho segurando
  expect(podeAtirar(a, 1, true)).toBe(false);
  atualizarArma(a, 1.1, 0.1, false); // solta
  expect(podeAtirar(a, 1.1, true)).toBe(true);
});

test('rifle é automático: segurar o gatilho continua atirando', () => {
  const a = criarArma('rifle');
  disparar(a, 0, PARADO, criarRng(1));
  atualizarArma(a, 0.2, 0.2, true);
  expect(podeAtirar(a, 0.2, true)).toBe(true);
});

test('escopeta devolve 8 desvios', () => {
  const d = disparar(criarArma('escopeta'), 0, PARADO, criarRng(3));
  expect(d.length).toBe(8);
  expect(d.every((v) => typeof v.dx === 'number' && typeof v.dy === 'number')).toBeTruthy();
  expect(disparar(criarArma('rifle'), 0, PARADO, criarRng(3)).length).toBe(1);
});

test('parado e agachado tem spread menor que correndo', () => {
  const correndo = espalhamento('rifle', { ...PARADO, velHoriz: 5.5 });
  const parado = espalhamento('rifle', PARADO);
  const agachado = espalhamento('rifle', { ...PARADO, agachado: true });
  expect(parado < correndo, `${parado} < ${correndo}`).toBeTruthy();
  expect(agachado < parado, `${agachado} < ${parado}`).toBeTruthy();
  const noAr = espalhamento('rifle', { ...PARADO, noChao: false });
  expect(noAr > parado).toBeTruthy();
});

test('sniper sem zoom espalha mais que com zoom', () => {
  const sem = espalhamento('sniper', PARADO);
  const com = espalhamento('sniper', { ...PARADO, zoom: true });
  expect(sem > com * 10, `${sem} > ${com}`).toBeTruthy();
});

test('recarga', () => {
  const a = criarArma('rifle');
  a.municao = 0;
  expect(iniciarRecarga(a, 0)).toBe(true);
  atualizarArma(a, 2.4, 0.1, false);
  expect(a.municao).toBe(0);
  expect(podeAtirar(a, 2.4, true)).toBe(false);
  atualizarArma(a, 2.5, 0.1, false);
  expect(a.municao).toBe(30);
  expect(a.reserva).toBe(60);
  expect(a.recarregandoAte).toBe(0);
});

test('recarga com reserva parcial', () => {
  const a = criarArma('rifle');
  a.municao = 5;
  a.reserva = 10;
  iniciarRecarga(a, 0);
  atualizarArma(a, 2.5, 0.1, false);
  expect(a.municao).toBe(15);
  expect(a.reserva).toBe(0);
});

test('iniciarRecarga recusa pente cheio, reserva vazia ou recarga em curso', () => {
  const cheia = criarArma('rifle');
  expect(iniciarRecarga(cheia, 0)).toBe(false);
  const seca = criarArma('rifle');
  seca.municao = 3;
  seca.reserva = 0;
  expect(iniciarRecarga(seca, 0)).toBe(false);
  const meio = criarArma('rifle');
  meio.municao = 3;
  expect(iniciarRecarga(meio, 0)).toBe(true);
  expect(iniciarRecarga(meio, 0.5)).toBe(false);
  expect(iniciarRecarga(criarArma('faca'), 0)).toBe(false);
});

test('pente vazio com gatilho recarrega sozinho', () => {
  const a = criarArma('pistola');
  a.municao = 0;
  atualizarArma(a, 0, 0.016, true);
  expect(a.recarregandoAte).toBe(ARMAS.pistola.recarga);
});

test('recuo acumula e volta', () => {
  const a = criarArma('rifle');
  const rng = criarRng(1);
  disparar(a, 0, PARADO, rng);
  disparar(a, 0.1, PARADO, rng);
  expect(Math.abs(a.recuoAcum - 0.024) < 1e-9).toBeTruthy();
  atualizarArma(a, 0.2, 0.1, false);
  expect(Math.abs(a.recuoAcum - 0.014) < 1e-9).toBeTruthy();
  atualizarArma(a, 2, 1.8, false);
  expect(a.recuoAcum).toBe(0);
});

test('o recuo desloca a mira para cima a cada tiro seguido', () => {
  const a = criarArma('rifle');
  const rng = () => 0.5; // spread nulo: dx = dy = 0 antes do recuo
  const d1 = disparar(a, 0, PARADO, rng)[0];
  const d2 = disparar(a, 0.1, PARADO, rng)[0];
  expect(d2.dy > d1.dy).toBeTruthy();
  expect(d1.dy > 0).toBeTruthy();
});

test('recuo tem teto', () => {
  const a = criarArma('rifle');
  const rng = criarRng(5);
  let ultimo!: Desvio;
  for (let i = 0; i < 30; i++) ultimo = disparar(a, i * 0.1, PARADO, rng)[0];
  expect(a.recuoAcum <= RECUO_MAX + 1e-9, `acum=${a.recuoAcum}`).toBeTruthy();
  expect(Math.abs(a.recuoAcum - RECUO_MAX) < 1e-9).toBeTruthy();
  expect(ultimo.dy <= RECUO_MAX + ARMAS.rifle.spreadBase + 1e-9, `dy=${ultimo.dy}`).toBeTruthy();
});
