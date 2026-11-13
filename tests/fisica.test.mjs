import test from 'node:test';
import assert from 'node:assert/strict';
import { mod } from './_repo.mjs';

const { moverComColisao, raycastCaixas, raycastEntidades, hitboxes, temVisada } =
  await mod('js/games/blockstrike/fisica.js');
const { criarRng } = await mod('js/games/blockstrike/rng.js');
const { JOGADOR, ARMAS, ROUND, MULT_PARTE, DIFICULDADE, NOMES_BOTS } =
  await mod('js/games/blockstrike/config.js');

const chao = { min: { x: -50, y: -1, z: -50 }, max: { x: 50, y: 0, z: 50 }, cor: 0x888888 };
const parede = { min: { x: 2, y: 0, z: -5 }, max: { x: 2.2, y: 3, z: 5 }, cor: 0x444444 };
const caixas = [chao, parede];
const R = JOGADOR.raio;
const H = JOGADOR.altura;
const LIMITE_X = 2 - R + 1e-6;

const ent = (extra = {}) => ({
  id: 'e1', time: 'azul', pos: { x: 5, y: 0, z: 0 }, agachado: false, vivo: true, ...extra,
});
const raioH = (y) => ({ origem: { x: 0, y, z: 0 }, dir: { x: 1, y: 0, z: 0 } });

test('config tem valores exatos', () => {
  assert.equal(JOGADOR.raio, 0.35);
  assert.equal(JOGADOR.hp, 100);
  assert.equal(ROUND.vencer, 13);
  assert.deepEqual(MULT_PARTE, { cabeca: 4, tronco: 1, pernas: 0.75 });
  assert.equal(ARMAS.faca.pente, Infinity);
  assert.equal(ARMAS.sniper.zoomFov, 25);
  assert.equal(ARMAS.escopeta.chumbos, 8);
  assert.equal(DIFICULDADE.dificil.reacao, 0.2);
  assert.equal(NOMES_BOTS.length, 9);
});

test('cai e para no chão', () => {
  const r = moverComColisao({ x: 0, y: 1, z: 0 }, { x: 0, y: -2, z: 0 }, R, H, caixas);
  assert.equal(r.pos.y, 0);
  assert.equal(r.noChao, true);
});

test('em pé no chão sem deslocar vertical continua noChao', () => {
  const r = moverComColisao({ x: 0, y: 0, z: 0 }, { x: 0.1, y: 0, z: 0 }, R, H, caixas);
  assert.ok(Math.abs(r.pos.x - 0.1) < 1e-9);
  assert.equal(r.pos.y, 0);
});

test('bate no teto', () => {
  const teto = { min: { x: -5, y: 2, z: -5 }, max: { x: 5, y: 3, z: 5 }, cor: 0 };
  const r = moverComColisao({ x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, R, H, [chao, teto]);
  assert.equal(r.bateuTeto, true);
  assert.ok(Math.abs(r.pos.y - (2 - H)) < 1e-9);
});

test('parede bloqueia em x', () => {
  const r = moverComColisao({ x: 0, y: 0, z: 0 }, { x: 5, y: 0, z: 0 }, R, H, caixas);
  assert.ok(r.pos.x <= LIMITE_X);
});

test('deslocamento grande não atravessa parede fina', () => {
  const d = 0.05 * 5.5 * 40;
  const r = moverComColisao({ x: 0, y: 0, z: 0 }, { x: d, y: 0, z: 0 }, R, H, caixas);
  assert.ok(r.pos.x <= LIMITE_X);
});

test('desliza na parede', () => {
  const r = moverComColisao({ x: 0, y: 0, z: 0 }, { x: 5, y: 0, z: 1 }, R, H, caixas);
  assert.ok(r.pos.x <= LIMITE_X);
  assert.ok(Math.abs(r.pos.z - 1) < 1e-6);
});

test('raycast acerta a parede', () => {
  const r = raycastCaixas({ x: 0, y: 1, z: 0 }, { x: 1, y: 0, z: 0 }, caixas, 100);
  assert.ok(Math.abs(r.dist - 2) < 1e-9);
  assert.equal(r.normal.x, -1);
  assert.ok(Math.abs(r.ponto.x - 2) < 1e-9);
});

test('raycast respeita maxDist', () => {
  assert.equal(raycastCaixas({ x: 0, y: 1, z: 0 }, { x: 1, y: 0, z: 0 }, caixas, 1), null);
});

test('raycast para baixo acerta o chão com normal +y', () => {
  const r = raycastCaixas({ x: 0, y: 1, z: 0 }, { x: 0, y: -1, z: 0 }, caixas, 10);
  assert.ok(Math.abs(r.dist - 1) < 1e-9);
  assert.equal(r.normal.y, 1);
});

test('hitbox de cabeça e pernas', () => {
  const a = raioH(1.6);
  assert.equal(raycastEntidades(a.origem, a.dir, [ent()], 50, null).parte, 'cabeca');
  const b = raioH(0.4);
  assert.equal(raycastEntidades(b.origem, b.dir, [ent()], 50, null).parte, 'pernas');
  const c = raioH(1.0);
  assert.equal(raycastEntidades(c.origem, c.dir, [ent()], 50, null).parte, 'tronco');
});

test('hitboxes em pé e agachado', () => {
  const hs = hitboxes(ent());
  const por = Object.fromEntries(hs.map((h) => [h.parte, h]));
  assert.ok(Math.abs(por.pernas.max.y - 0.8) < 1e-9);
  assert.ok(Math.abs(por.cabeca.max.y - 1.8) < 1e-9);
  const ag = Object.fromEntries(hitboxes(ent({ agachado: true })).map((h) => [h.parte, h]));
  assert.ok(Math.abs(ag.cabeca.max.y - 1.2) < 1e-9);
});

test('agachado abaixa a cabeça', () => {
  const a = raioH(1.6);
  assert.equal(raycastEntidades(a.origem, a.dir, [ent({ agachado: true })], 50, null), null);
});

test('ignora morto e o próprio atirador', () => {
  const a = raioH(1.6);
  assert.equal(raycastEntidades(a.origem, a.dir, [ent({ vivo: false })], 50, null), null);
  assert.equal(raycastEntidades(a.origem, a.dir, [ent()], 50, 'e1'), null);
});

test('raycastEntidades retorna o mais próximo', () => {
  const a = raioH(1.0);
  const longe = ent({ id: 'longe', pos: { x: 9, y: 0, z: 0 } });
  const perto = ent({ id: 'perto', pos: { x: 4, y: 0, z: 0 } });
  const r = raycastEntidades(a.origem, a.dir, [longe, perto], 50, null);
  assert.equal(r.ent.id, 'perto');
  assert.ok(Math.abs(r.dist - 3.75) < 1e-9);
});

test('temVisada falsa através da parede e verdadeira sem ela', () => {
  const a = { x: 0, y: 1.6, z: 0 };
  const b = { x: 5, y: 1.6, z: 0 };
  assert.equal(temVisada(a, b, caixas), false);
  assert.equal(temVisada(a, b, [chao]), true);
});

test('criarRng(1) é determinístico e em [0,1)', () => {
  const a = criarRng(1);
  const b = criarRng(1);
  const sa = Array.from({ length: 5 }, a);
  const sb = Array.from({ length: 5 }, b);
  assert.deepEqual(sa, sb);
  for (const v of sa) assert.ok(v >= 0 && v < 1);
  assert.notDeepEqual(sa, Array.from({ length: 5 }, criarRng(2)));
});
