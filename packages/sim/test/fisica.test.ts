import { expect, test } from 'vitest';
import { moverComColisao, raycastCaixas, raycastEntidades, hitboxes, temVisada } from '../src/fisica.js';
import { criarRng } from '../src/rng.js';
import { JOGADOR, ARMAS, ROUND, MULT_PARTE, DIFICULDADE, NOMES_BOTS } from '../src/config.js';
import type { AlvoFisico, Caixa, HitboxParte, Vec3 } from '../src/tipos.js';

const chao: Caixa = { min: { x: -50, y: -1, z: -50 }, max: { x: 50, y: 0, z: 50 }, cor: 0x888888 };
const parede: Caixa = { min: { x: 2, y: 0, z: -5 }, max: { x: 2.2, y: 3, z: 5 }, cor: 0x444444 };
const caixas = [chao, parede];
const R = JOGADOR.raio;
const H = JOGADOR.altura;
const LIMITE_X = 2 - R + 1e-6;

// `id` é número (`Entidade.id` é o índice em `mundo.entidades`); no .mjs eram strings ('e1', 'longe', 'perto').
const ent = (extra: Partial<AlvoFisico> = {}): AlvoFisico => ({
  id: 1, pos: { x: 5, y: 0, z: 0 }, agachado: false, vivo: true, ...extra,
});
const raioH = (y: number): { origem: Vec3; dir: Vec3 } => ({ origem: { x: 0, y, z: 0 }, dir: { x: 1, y: 0, z: 0 } });

test('config tem valores exatos', () => {
  expect(JOGADOR.raio).toBe(0.35);
  expect(JOGADOR.hp).toBe(100);
  expect(ROUND.vencer).toBe(13);
  expect(MULT_PARTE).toStrictEqual({ cabeca: 4, tronco: 1, pernas: 0.75 });
  expect(ARMAS.faca.pente).toBe(Infinity);
  expect(ARMAS.sniper.zoomFov).toBe(25);
  expect(ARMAS.escopeta.chumbos).toBe(8);
  expect(DIFICULDADE.dificil.reacao).toBe(0.2);
  expect(NOMES_BOTS.length).toBe(9);
});

test('cai e para no chão', () => {
  const r = moverComColisao({ x: 0, y: 1, z: 0 }, { x: 0, y: -2, z: 0 }, R, H, caixas);
  expect(r.pos.y).toBe(0);
  expect(r.noChao).toBe(true);
});

test('em pé no chão sem deslocar vertical continua noChao', () => {
  const r = moverComColisao({ x: 0, y: 0, z: 0 }, { x: 0.1, y: 0, z: 0 }, R, H, caixas);
  expect(Math.abs(r.pos.x - 0.1) < 1e-9).toBeTruthy();
  expect(r.pos.y).toBe(0);
});

test('bate no teto', () => {
  const teto: Caixa = { min: { x: -5, y: 2, z: -5 }, max: { x: 5, y: 3, z: 5 }, cor: 0 };
  const r = moverComColisao({ x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, R, H, [chao, teto]);
  expect(r.bateuTeto).toBe(true);
  expect(Math.abs(r.pos.y - (2 - H)) < 1e-9).toBeTruthy();
});

test('parede bloqueia em x', () => {
  const r = moverComColisao({ x: 0, y: 0, z: 0 }, { x: 5, y: 0, z: 0 }, R, H, caixas);
  expect(r.pos.x <= LIMITE_X).toBeTruthy();
});

test('deslocamento grande não atravessa parede fina', () => {
  const d = 0.05 * 5.5 * 40;
  const r = moverComColisao({ x: 0, y: 0, z: 0 }, { x: d, y: 0, z: 0 }, R, H, caixas);
  expect(r.pos.x <= LIMITE_X).toBeTruthy();
});

test('desliza na parede', () => {
  const r = moverComColisao({ x: 0, y: 0, z: 0 }, { x: 5, y: 0, z: 1 }, R, H, caixas);
  expect(r.pos.x <= LIMITE_X).toBeTruthy();
  expect(Math.abs(r.pos.z - 1) < 1e-6).toBeTruthy();
});

test('raycast acerta a parede', () => {
  const r = raycastCaixas({ x: 0, y: 1, z: 0 }, { x: 1, y: 0, z: 0 }, caixas, 100)!;
  expect(Math.abs(r.dist - 2) < 1e-9).toBeTruthy();
  expect(r.normal.x).toBe(-1);
  expect(Math.abs(r.ponto.x - 2) < 1e-9).toBeTruthy();
});

test('raycast respeita maxDist', () => {
  expect(raycastCaixas({ x: 0, y: 1, z: 0 }, { x: 1, y: 0, z: 0 }, caixas, 1)).toBe(null);
});

test('raycast para baixo acerta o chão com normal +y', () => {
  const r = raycastCaixas({ x: 0, y: 1, z: 0 }, { x: 0, y: -1, z: 0 }, caixas, 10)!;
  expect(Math.abs(r.dist - 1) < 1e-9).toBeTruthy();
  expect(r.normal.y).toBe(1);
});

test('hitbox de cabeça e pernas', () => {
  const a = raioH(1.6);
  expect(raycastEntidades(a.origem, a.dir, [ent()], 50, null)!.parte).toBe('cabeca');
  const b = raioH(0.4);
  expect(raycastEntidades(b.origem, b.dir, [ent()], 50, null)!.parte).toBe('pernas');
  const c = raioH(1.0);
  expect(raycastEntidades(c.origem, c.dir, [ent()], 50, null)!.parte).toBe('tronco');
});

test('hitboxes em pé e agachado', () => {
  const hs = hitboxes(ent());
  const por: Record<string, HitboxParte> = Object.fromEntries(hs.map((h) => [h.parte, h]));
  expect(Math.abs(por.pernas.max.y - 0.8) < 1e-9).toBeTruthy();
  expect(Math.abs(por.cabeca.max.y - 1.8) < 1e-9).toBeTruthy();
  const ag: Record<string, HitboxParte> = Object.fromEntries(hitboxes(ent({ agachado: true })).map((h) => [h.parte, h]));
  expect(Math.abs(ag.cabeca.max.y - 1.2) < 1e-9).toBeTruthy();
});

test('agachado abaixa a cabeça', () => {
  const a = raioH(1.6);
  expect(raycastEntidades(a.origem, a.dir, [ent({ agachado: true })], 50, null)).toBe(null);
});

test('ignora morto e o próprio atirador', () => {
  const a = raioH(1.6);
  expect(raycastEntidades(a.origem, a.dir, [ent({ vivo: false })], 50, null)).toBe(null);
  expect(raycastEntidades(a.origem, a.dir, [ent()], 50, 1)).toBe(null);
});

test('raycastEntidades retorna o mais próximo', () => {
  const a = raioH(1.0);
  const longe = ent({ id: 2, pos: { x: 9, y: 0, z: 0 } });
  const perto = ent({ id: 3, pos: { x: 4, y: 0, z: 0 } });
  const r = raycastEntidades(a.origem, a.dir, [longe, perto], 50, null)!;
  expect(r.ent.id).toBe(3);
  expect(Math.abs(r.dist - 3.75) < 1e-9).toBeTruthy();
});

test('temVisada falsa através da parede e verdadeira sem ela', () => {
  const a = { x: 0, y: 1.6, z: 0 };
  const b = { x: 5, y: 1.6, z: 0 };
  expect(temVisada(a, b, caixas)).toBe(false);
  expect(temVisada(a, b, [chao])).toBe(true);
});

test('criarRng(1) é determinístico e em [0,1)', () => {
  const a = criarRng(1);
  const b = criarRng(1);
  const sa = Array.from({ length: 5 }, a);
  const sb = Array.from({ length: 5 }, b);
  expect(sa).toStrictEqual(sb);
  for (const v of sa) expect(v >= 0 && v < 1).toBeTruthy();
  expect(sa).not.toStrictEqual(Array.from({ length: 5 }, criarRng(2)));
});
