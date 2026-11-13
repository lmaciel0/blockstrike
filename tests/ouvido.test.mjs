import test from 'node:test';
import assert from 'node:assert/strict';
import { mod } from './_repo.mjs';

const { criarMundo, posicionarParaRound, passo } = await mod('js/games/blockstrike/mundo.js');
const { pensar, ouvir } = await mod('js/games/blockstrike/bots.js');
const { criarGrafo } = await mod('js/games/blockstrike/navegacao.js');
const { MAPA } = await mod('js/games/blockstrike/mapa.js');
const { criarRng } = await mod('js/games/blockstrike/rng.js');

const chao = { min: { x: -50, y: -1, z: -50 }, max: { x: 50, y: 0, z: 50 }, cor: 0x888888 };
const cmd = (extra = {}) => ({
  frente: 0, lado: 0, pular: false, agachar: false, devagar: false, atirar: false,
  zoom: false, recarregar: false, slot: null, yaw: 0, pitch: 0, ...extra,
});

function cenario() {
  const mundo = criarMundo({
    mapa: { ...MAPA, caixas: [chao] }, primariaJogador: 'rifle', dificuldade: 'medio', rng: criarRng(1),
  });
  posicionarParaRound(mundo, 'A');
  for (const e of mundo.entidades) e.pos = { x: 40, y: 0, z: 40 + e.id * 0.01 }; // todos longe
  return mundo;
}

test('correr emite ruído; Shift e agachado não', () => {
  const m = cenario();
  const eu = m.entidades[0];
  eu.pos = { x: 0, y: 0, z: 0 };
  for (let i = 0; i < 40; i++) passo(m, 0.05, new Map([[0, cmd({ frente: 1, yaw: Math.PI })]]));
  assert.ok(m.ruidos.length > 0, 'correndo faz barulho');
  assert.ok(m.ruidos.every((r) => r.time === 'azul' && r.id === 0));

  const m2 = cenario();
  m2.entidades[0].pos = { x: 0, y: 0, z: 0 };
  for (let i = 0; i < 40; i++) passo(m2, 0.05, new Map([[0, cmd({ frente: 1, devagar: true })]]));
  assert.equal(m2.ruidos.length, 0, 'Shift é silencioso');

  const m3 = cenario();
  m3.entidades[0].pos = { x: 0, y: 0, z: 0 };
  for (let i = 0; i < 40; i++) passo(m3, 0.05, new Map([[0, cmd({ frente: 1, agachar: true })]]));
  assert.equal(m3.ruidos.length, 0, 'agachado é silencioso');
});

test('ruídos velhos somem', () => {
  const m = cenario();
  m.entidades[0].pos = { x: 0, y: 0, z: 0 };
  for (let i = 0; i < 20; i++) passo(m, 0.05, new Map([[0, cmd({ frente: 1 })]]));
  assert.ok(m.ruidos.length > 0);
  for (let i = 0; i < 80; i++) passo(m, 0.05, new Map());
  assert.equal(m.ruidos.length, 0);
});

test('bot laranja vira a mira para passos de azul a menos de 15 m', () => {
  const m = cenario();
  const bot = m.entidades[5];
  bot.pos = { x: 0, y: 0, z: 0 };
  bot.yaw = 0; // olha para -z
  m.ruidos.push({ id: 0, time: 'azul', x: 10, z: 0, em: m.tempo }); // à direita (+x), yaw negativo
  const grafo = criarGrafo(MAPA.waypoints, MAPA.arestas);
  const rng = criarRng(7);
  let c = pensar(bot, m, grafo, 'medio', 0.05, rng);
  assert.ok(c.yaw < 0, `deveria virar para +x (yaw<0), veio ${c.yaw}`);
  assert.ok(bot.cerebro.ouvidoPos, 'guardou de onde veio o som');
});

test('bot ignora passos longe, de aliado e já tratados', () => {
  const m = cenario();
  const bot = m.entidades[5];
  bot.pos = { x: 0, y: 0, z: 0 };
  const grafo = criarGrafo(MAPA.waypoints, MAPA.arestas);
  pensar(bot, m, grafo, 'medio', 0.05, criarRng(3));
  const c = bot.cerebro;
  m.ruidos.push({ id: 0, time: 'azul', x: 30, z: 0, em: 1 });
  assert.equal(ouvir(bot, m, c), null, 'longe demais');
  m.ruidos.push({ id: 6, time: 'laranja', x: 3, z: 0, em: 1 });
  assert.equal(ouvir(bot, m, c), null, 'aliado');
  m.ruidos.push({ id: 0, time: 'azul', x: 3, z: 0, em: 1 });
  assert.ok(ouvir(bot, m, c));
  c.ouvidoEm = 1;
  assert.equal(ouvir(bot, m, c), null, 'já tratado');
});
