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
function rodar({ mundo, grafo, rng }, seg, parar = () => false) {
  const eventos = [];
  for (let i = 0; i < seg / 0.05 && !parar(); i++) {
    const cmds = new Map();
    for (const e of mundo.entidades) if (e.vivo) cmds.set(e.id, pensar(e, mundo, grafo, 'medio', 0.05, rng));
    eventos.push(...passo(mundo, 0.05, cmds));
  }
  return eventos;
}

test('o portador chega ao bombsite sorteado e planta sozinho (CTs fora do caminho)', () => {
  for (const seed of [3, 4, 5, 6]) {
    const c = cenario(seed);
    matar(c.mundo, 'azul');
    const sorteado = c.mundo.bomba.siteAlvo;
    rodar(c, 70, () => c.mundo.bomba.plantada);
    assert.ok(c.mundo.bomba.plantada, `seed ${seed}: não plantou`);
    assert.equal(c.mundo.bomba.site, sorteado, `seed ${seed}: plantou no site errado`);
  }
});

test('terroristas sem a C4 vão para o mesmo bombsite e esperam lá', () => {
  const c = cenario(4);
  matar(c.mundo, 'azul');
  const portador = c.mundo.bomba.portador;
  rodar(c, 70, () => c.mundo.bomba.plantada);
  rodar(c, 5);
  const s = MAPA.bombsites[c.mundo.bomba.site];
  const outros = c.mundo.entidades.filter((e) => e.time === 'laranja' && e.id !== portador);
  const noSite = outros.filter((e) => Math.hypot(e.pos.x - s.centro.x, e.pos.z - s.centro.z) < 10);
  assert.ok(noSite.length >= 3, `só ${noSite.length} de ${outros.length} chegaram ao site`);
});

test('CTs vão ao bombsite da C4 plantada e um deles desarma', () => {
  for (const seed of [3, 4, 5]) {
    const c = cenario(seed);
    matar(c.mundo, 'laranja');
    const b = c.mundo.bomba;
    const nome = seed % 2 ? 'A' : 'B';
    const site = MAPA.bombsites[nome];
    Object.assign(b, { plantada: true, portador: null, site: nome, pos: { x: site.centro.x + 2, y: 0, z: site.centro.z + 1 }, restante: 40 });
    const ev = rodar(c, 38, () => b.desarmada || b.explodiu);
    assert.ok(b.desarmada, `seed ${seed}: ninguém desarmou (restante ${b.restante.toFixed(1)})`);
    assert.ok(ev.some((e) => e.tipo === 'desarmada'));
  }
});

test('C4 solta: o terrorista mais perto a pega', () => {
  const c = cenario(5);
  matar(c.mundo, 'azul');
  const b = c.mundo.bomba;
  const antigo = c.mundo.entidades[b.portador];
  antigo.vivo = false;
  antigo.hp = 0;
  const ponto = { x: 0, y: 0, z: 10 };
  b.portador = null;
  b.pos = ponto;
  rodar(c, 40, () => b.portador !== null);
  assert.notEqual(b.portador, null, 'ninguém pegou a C4');
  assert.notEqual(b.portador, antigo.id);
});

test('sem mundo.bomba os bots seguem o comportamento antigo', () => {
  const c = cenario(3);
  c.mundo.bomba = null;
  for (const e of c.mundo.entidades) e.cerebro = criarCerebro(e, c.grafo, c.rng, MAPA.caixas, c.mundo);
  const cmd = pensar(c.mundo.entidades[6], c.mundo, c.grafo, 'medio', 0.05, c.rng);
  assert.equal(cmd.usar, false);
});
