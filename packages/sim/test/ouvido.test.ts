import { expect, test } from 'vitest';
import { criarMundo, posicionarParaRound, passo } from '../src/mundo.js';
import { pensar, ouvir } from '../src/bots.js';
import { criarGrafo } from '../src/navegacao.js';
import { MAPA } from '../src/mapa.js';
import { criarRng } from '../src/rng.js';
import type { Caixa, Comandos, Mundo } from '../src/tipos.js';

const chao: Caixa = { min: { x: -50, y: -1, z: -50 }, max: { x: 50, y: 0, z: 50 }, cor: 0x888888 };
// Sem `usar` e `granada`, como no teste original: os campos que faltam valem undefined (falso) no `passo`.
const cmd = (extra: Partial<Comandos> = {}): Comandos => ({
  frente: 0, lado: 0, pular: false, agachar: false, devagar: false, atirar: false,
  zoom: false, recarregar: false, slot: null, yaw: 0, pitch: 0, ...extra,
}) as Comandos;

function cenario(): Mundo {
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
  expect(m.ruidos.length > 0, 'correndo faz barulho').toBeTruthy();
  expect(m.ruidos.every((r) => r.time === 'azul' && r.id === 0)).toBeTruthy();

  const m2 = cenario();
  m2.entidades[0].pos = { x: 0, y: 0, z: 0 };
  for (let i = 0; i < 40; i++) passo(m2, 0.05, new Map([[0, cmd({ frente: 1, devagar: true })]]));
  expect(m2.ruidos.length, 'Shift é silencioso').toBe(0);

  const m3 = cenario();
  m3.entidades[0].pos = { x: 0, y: 0, z: 0 };
  for (let i = 0; i < 40; i++) passo(m3, 0.05, new Map([[0, cmd({ frente: 1, agachar: true })]]));
  expect(m3.ruidos.length, 'agachado é silencioso').toBe(0);
});

test('ruídos velhos somem', () => {
  const m = cenario();
  m.entidades[0].pos = { x: 0, y: 0, z: 0 };
  for (let i = 0; i < 20; i++) passo(m, 0.05, new Map([[0, cmd({ frente: 1 })]]));
  expect(m.ruidos.length > 0).toBeTruthy();
  for (let i = 0; i < 80; i++) passo(m, 0.05, new Map());
  expect(m.ruidos.length).toBe(0);
});

test('bot laranja vira a mira para passos de azul a menos de 15 m', () => {
  const m = cenario();
  const bot = m.entidades[5];
  bot.pos = { x: 0, y: 0, z: 0 };
  bot.yaw = 0; // olha para -z
  m.ruidos.push({ id: 0, time: 'azul', x: 10, z: 0, em: m.tempo }); // à direita (+x), yaw negativo
  const grafo = criarGrafo(MAPA.waypoints, MAPA.arestas);
  const rng = criarRng(7);
  const c = pensar(bot, m, grafo, 'medio', 0.05, rng);
  expect(c.yaw < 0, `deveria virar para +x (yaw<0), veio ${c.yaw}`).toBeTruthy();
  expect(bot.cerebro!.ouvidoPos, 'guardou de onde veio o som').toBeTruthy();
});

test('bot ignora passos longe, de aliado e já tratados', () => {
  const m = cenario();
  const bot = m.entidades[5];
  bot.pos = { x: 0, y: 0, z: 0 };
  const grafo = criarGrafo(MAPA.waypoints, MAPA.arestas);
  pensar(bot, m, grafo, 'medio', 0.05, criarRng(3));
  const c = bot.cerebro!;
  m.ruidos.push({ id: 0, time: 'azul', x: 30, z: 0, em: 1 });
  expect(ouvir(bot, m, c), 'longe demais').toBe(null);
  m.ruidos.push({ id: 6, time: 'laranja', x: 3, z: 0, em: 1 });
  expect(ouvir(bot, m, c), 'aliado').toBe(null);
  m.ruidos.push({ id: 0, time: 'azul', x: 3, z: 0, em: 1 });
  expect(ouvir(bot, m, c)).toBeTruthy();
  c.ouvidoEm = 1;
  expect(ouvir(bot, m, c), 'já tratado').toBe(null);
});
