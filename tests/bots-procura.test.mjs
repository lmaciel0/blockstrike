import test from 'node:test';
import assert from 'node:assert/strict';
import { mod } from './_repo.mjs';

const { criarMundo, posicionarParaRound, passo } = await mod('js/games/blockstrike/mundo.js');
const { criarBomba } = await mod('js/games/blockstrike/bomba.js');
const { pensar, criarCerebro } = await mod('js/games/blockstrike/bots.js');
const { criarGrafo } = await mod('js/games/blockstrike/navegacao.js');
const { MAPA } = await mod('js/games/blockstrike/mapa.js');
const { criarRng } = await mod('js/games/blockstrike/rng.js');

function cenario(seed = 3) {
  const mundo = criarMundo({ mapa: MAPA, primariaJogador: 'rifle', dificuldade: 'medio', rng: criarRng(seed) });
  mundo.entidades[0].bot = true; // o "jogador" também é um bot na simulação
  posicionarParaRound(mundo, 'A');
  const grafo = criarGrafo(MAPA.waypoints, MAPA.arestas);
  const rng = criarRng(seed * 31);
  mundo.bomba = criarBomba(mundo, 'laranja');
  for (const e of mundo.entidades) e.cerebro = criarCerebro(e, grafo, rng, MAPA.caixas, mundo);
  return { mundo, grafo, rng };
}
const matar = (mundo, time) => {
  for (const e of mundo.entidades) if (e.time === time) { e.vivo = false; e.hp = 0; }
};
function rodar({ mundo, grafo, rng }, seg, { parar = () => false } = {}) {
  for (let i = 0; i < seg / 0.05 && !parar(); i++) {
    const cmds = new Map();
    for (const e of mundo.entidades) if (e.vivo) cmds.set(e.id, pensar(e, mundo, grafo, 'medio', 0.05, rng));
    passo(mundo, 0.05, cmds);
  }
}
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

test('T sem a C4 que perde o alvo volta para o bombsite', () => {
  for (const seed of [3, 4, 5]) {
    const c = cenario(seed);
    matar(c.mundo, 'azul');
    const b = c.mundo.bomba;
    const t = c.mundo.entidades.find((e) => e.time === 'laranja' && e.id !== b.portador);
    t.cerebro = { ...t.cerebro, estado: 'combate', ultimaPos: { x: 0, y: 0, z: 8 }, perdidoHa: 2, rota: [] };
    rodar(c, 40);
    // Os Ts se espalham pelo bombsite (ESPALHAR em bots.js): vale qualquer ponto dentro dele (com 1 m de folga).
    const s = MAPA.bombsites[b.plantada ? b.site : b.siteAlvo];
    const dentro = t.pos.x >= s.min.x - 1 && t.pos.x <= s.max.x + 1 && t.pos.z >= s.min.z - 1 && t.pos.z <= s.max.z + 1;
    assert.ok(dentro, `seed ${seed}: fora do bombsite em (${t.pos.x.toFixed(1)}, ${t.pos.z.toFixed(1)})`);
  }
});

test('CT a caminho do posto que perde o alvo volta ao posto', () => {
  for (const seed of [3, 4, 5]) {
    const c = cenario(seed);
    matar(c.mundo, 'laranja');
    const ct = c.mundo.entidades.find((e) => e.time === 'azul' && e.id !== 0) ?? c.mundo.entidades.find((e) => e.time === 'azul');
    ct.cerebro = { ...ct.cerebro, estado: 'combate', ultimaPos: { x: 0, y: 0, z: -6 }, perdidoHa: 2, rota: [] };
    rodar(c, 40);
    const site = ct.id % 2 === 0 ? 'A' : 'B';
    const espera = MAPA.waypoints[MAPA.bombsites[site].espera[ct.cerebro.casaZ]];
    assert.equal(ct.cerebro.estado, 'posto', `seed ${seed}: estado ${ct.cerebro.estado}`);
    assert.ok(dist(ct.pos, espera) < 1.5, `seed ${seed}: a ${dist(ct.pos, espera).toFixed(2)} m do posto`);
  }
});

test('procura vira combate quando aparece inimigo', () => {
  const c = cenario(3);
  const t = c.mundo.entidades.find((e) => e.time === 'laranja' && e.id !== c.mundo.bomba.portador);
  const ct = c.mundo.entidades.find((e) => e.time === 'azul');
  Object.assign(ct, { pos: { x: t.pos.x + 6, y: 0, z: t.pos.z }, vivo: true, hp: 100 });
  t.cerebro = { ...t.cerebro, estado: 'procura', rota: [], chegou: true, esperaAte: 1e9, ultimaPos: { ...t.pos } };
  t.yaw = Math.atan2(-(ct.pos.x - t.pos.x), -(ct.pos.z - t.pos.z));
  for (let i = 0; i < 20 && t.cerebro.estado === 'procura'; i++) pensar(t, c.mundo, c.grafo, 'medio', 0.05, c.rng);
  assert.notEqual(t.cerebro.estado, 'procura');
});
