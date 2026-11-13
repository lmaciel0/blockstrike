import test from 'node:test';
import assert from 'node:assert/strict';
import { mod } from './_repo.mjs';

const { criarArma, podeAtirar, disparar, atualizarArma, iniciarRecarga, danoDe } =
  await mod('js/games/blockstrike/armas.js');
const { criarRng } = await mod('js/games/blockstrike/rng.js');
const { ARMAS } = await mod('js/games/blockstrike/config.js');

const PARADO = { velHoriz: 0, velMax: 5.5, noChao: true, agachado: false, zoom: false };
const media = (lista) => lista.reduce((s, v) => s + Math.abs(v), 0) / lista.length;

function espalhamento(tipo, estado, n = 200) {
  const rng = criarRng(7);
  const dxs = [];
  for (let i = 0; i < n; i++) {
    const arma = criarArma(tipo); // recuo zerado a cada disparo: mede só o spread
    dxs.push(...disparar(arma, 0, estado, rng).map((d) => d.dx));
  }
  return media(dxs);
}

test('criarArma começa cheia', () => {
  const a = criarArma('rifle');
  assert.deepEqual(a, {
    tipo: 'rifle', municao: 30, reserva: 90, prontaEm: 0, recarregandoAte: 0, recuoAcum: 0, gatilhoSolto: true,
  });
  assert.equal(criarArma('faca').municao, Infinity);
});

test('danoDe aplica o multiplicador da parte', () => {
  assert.equal(danoDe('rifle', 'cabeca'), 144);
  assert.equal(danoDe('rifle', 'pernas'), 27);
  assert.equal(danoDe('sniper', 'tronco'), 115);
  assert.equal(danoDe('faca', 'tronco'), 40);
});

test('cadência do rifle', () => {
  const a = criarArma('rifle');
  const rng = criarRng(1);
  assert.equal(podeAtirar(a, 0, true), true);
  disparar(a, 0, PARADO, rng);
  assert.equal(a.municao, 29);
  assert.equal(podeAtirar(a, 0.09, true), false);
  assert.equal(podeAtirar(a, 0.1, true), true);
});

test('sem gatilho não atira', () => {
  assert.equal(podeAtirar(criarArma('rifle'), 0, false), false);
});

test('pistola é semi', () => {
  const a = criarArma('pistola');
  const rng = criarRng(1);
  assert.equal(podeAtirar(a, 0, true), true);
  disparar(a, 0, PARADO, rng);
  atualizarArma(a, 1, 1, true); // gatilho segurando
  assert.equal(podeAtirar(a, 1, true), false);
  atualizarArma(a, 1.1, 0.1, false); // solta
  assert.equal(podeAtirar(a, 1.1, true), true);
});

test('rifle é automático: segurar o gatilho continua atirando', () => {
  const a = criarArma('rifle');
  disparar(a, 0, PARADO, criarRng(1));
  atualizarArma(a, 0.2, 0.2, true);
  assert.equal(podeAtirar(a, 0.2, true), true);
});

test('escopeta devolve 8 desvios', () => {
  const d = disparar(criarArma('escopeta'), 0, PARADO, criarRng(3));
  assert.equal(d.length, 8);
  assert.ok(d.every((v) => typeof v.dx === 'number' && typeof v.dy === 'number'));
  assert.equal(disparar(criarArma('rifle'), 0, PARADO, criarRng(3)).length, 1);
});

test('parado e agachado tem spread menor que correndo', () => {
  const correndo = espalhamento('rifle', { ...PARADO, velHoriz: 5.5 });
  const parado = espalhamento('rifle', PARADO);
  const agachado = espalhamento('rifle', { ...PARADO, agachado: true });
  assert.ok(parado < correndo, `${parado} < ${correndo}`);
  assert.ok(agachado < parado, `${agachado} < ${parado}`);
  const noAr = espalhamento('rifle', { ...PARADO, noChao: false });
  assert.ok(noAr > parado);
});

test('sniper sem zoom espalha mais que com zoom', () => {
  const sem = espalhamento('sniper', PARADO);
  const com = espalhamento('sniper', { ...PARADO, zoom: true });
  assert.ok(sem > com * 10, `${sem} > ${com}`);
});

test('recarga', () => {
  const a = criarArma('rifle');
  a.municao = 0;
  assert.equal(iniciarRecarga(a, 0), true);
  atualizarArma(a, 2.4, 0.1, false);
  assert.equal(a.municao, 0);
  assert.equal(podeAtirar(a, 2.4, true), false);
  atualizarArma(a, 2.5, 0.1, false);
  assert.equal(a.municao, 30);
  assert.equal(a.reserva, 60);
  assert.equal(a.recarregandoAte, 0);
});

test('recarga com reserva parcial', () => {
  const a = criarArma('rifle');
  a.municao = 5;
  a.reserva = 10;
  iniciarRecarga(a, 0);
  atualizarArma(a, 2.5, 0.1, false);
  assert.equal(a.municao, 15);
  assert.equal(a.reserva, 0);
});

test('iniciarRecarga recusa pente cheio, reserva vazia ou recarga em curso', () => {
  const cheia = criarArma('rifle');
  assert.equal(iniciarRecarga(cheia, 0), false);
  const seca = criarArma('rifle');
  seca.municao = 3;
  seca.reserva = 0;
  assert.equal(iniciarRecarga(seca, 0), false);
  const meio = criarArma('rifle');
  meio.municao = 3;
  assert.equal(iniciarRecarga(meio, 0), true);
  assert.equal(iniciarRecarga(meio, 0.5), false);
  assert.equal(iniciarRecarga(criarArma('faca'), 0), false);
});

test('pente vazio com gatilho recarrega sozinho', () => {
  const a = criarArma('pistola');
  a.municao = 0;
  atualizarArma(a, 0, 0.016, true);
  assert.equal(a.recarregandoAte, ARMAS.pistola.recarga);
});

test('recuo acumula e volta', () => {
  const a = criarArma('rifle');
  const rng = criarRng(1);
  disparar(a, 0, PARADO, rng);
  disparar(a, 0.1, PARADO, rng);
  assert.ok(Math.abs(a.recuoAcum - 0.024) < 1e-9);
  atualizarArma(a, 0.2, 0.1, false);
  assert.ok(Math.abs(a.recuoAcum - 0.014) < 1e-9);
  atualizarArma(a, 2, 1.8, false);
  assert.equal(a.recuoAcum, 0);
});

test('o recuo desloca a mira para cima a cada tiro seguido', () => {
  const a = criarArma('rifle');
  const rng = () => 0.5; // spread nulo: dx = dy = 0 antes do recuo
  const d1 = disparar(a, 0, PARADO, rng)[0];
  const d2 = disparar(a, 0.1, PARADO, rng)[0];
  assert.ok(d2.dy > d1.dy);
  assert.ok(d1.dy > 0);
});

test('recuo tem teto', async () => {
  const { RECUO_MAX } = await mod('js/games/blockstrike/config.js');
  const a = criarArma('rifle');
  const rng = criarRng(5);
  let ultimo;
  for (let i = 0; i < 30; i++) ultimo = disparar(a, i * 0.1, PARADO, rng)[0];
  assert.ok(a.recuoAcum <= RECUO_MAX + 1e-9, `acum=${a.recuoAcum}`);
  assert.ok(Math.abs(a.recuoAcum - RECUO_MAX) < 1e-9);
  assert.ok(ultimo.dy <= RECUO_MAX + ARMAS.rifle.spreadBase + 1e-9, `dy=${ultimo.dy}`);
});
