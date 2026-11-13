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
// `fora`: ids vivos que não pensam (ficam parados onde o teste os pôs).
function rodar({ mundo, grafo, rng }, seg, { parar = () => false, fora = [] } = {}) {
  const eventos = [];
  for (let i = 0; i < seg / 0.05 && !parar(); i++) {
    const cmds = new Map();
    for (const e of mundo.entidades) {
      if (e.vivo && !fora.includes(e.id)) cmds.set(e.id, pensar(e, mundo, grafo, 'medio', 0.05, rng));
    }
    eventos.push(...passo(mundo, 0.05, cmds));
  }
  return eventos;
}

const SEEDS = [3, 4, 5, 6];
const ts = (mundo) => mundo.entidades.filter((e) => e.vivo && e.time === 'laranja');
function mediaPares(lista) {
  let soma = 0;
  let n = 0;
  for (let i = 0; i < lista.length; i++) {
    for (let j = i + 1; j < lista.length; j++) {
      soma += Math.hypot(lista[i].pos.x - lista[j].pos.x, lista[i].pos.z - lista[j].pos.z);
      n += 1;
    }
  }
  return n ? soma / n : 0;
}
function menorPar(lista) {
  let m = Infinity;
  for (let i = 0; i < lista.length; i++) {
    for (let j = i + 1; j < lista.length; j++) {
      m = Math.min(m, Math.hypot(lista[i].pos.x - lista[j].pos.x, lista[i].pos.z - lista[j].pos.z));
    }
  }
  return m;
}

test('os Ts saem por duas rotas até o bombsite (a do site e o meio)', () => {
  for (const seed of SEEDS) {
    const c = cenario(seed);
    const { rotas } = MAPA.bombsites[c.mundo.bomba.siteAlvo];
    const porRota = rotas.map((id) => ts(c.mundo).filter((e) => e.cerebro.rota.includes(id)).length);
    assert.ok(porRota[0] >= 2 && porRota[1] >= 2, `seed ${seed}: Ts por rota ${porRota}`);
  }
});

test('no meio do caminho os Ts não andam em fila (distância média entre eles)', () => {
  for (const seed of SEEDS) {
    const c = cenario(seed);
    matar(c.mundo, 'azul');
    rodar(c, 9);
    const d = mediaPares(ts(c.mundo));
    assert.ok(d >= 12, `seed ${seed}: distância média ${d.toFixed(1)} m`);
  }
});

test('no bombsite os Ts se espalham em vez de ficar todos no mesmo ponto', () => {
  for (const seed of SEEDS) {
    const c = cenario(seed);
    matar(c.mundo, 'azul');
    rodar(c, 70, { parar: () => c.mundo.bomba.plantada });
    rodar(c, 12);
    const lista = ts(c.mundo);
    assert.ok(menorPar(lista) >= 1.5, `seed ${seed}: menor distância ${menorPar(lista).toFixed(2)} m`);
    assert.ok(mediaPares(lista) >= 3, `seed ${seed}: distância média ${mediaPares(lista).toFixed(1)} m`);
  }
});
