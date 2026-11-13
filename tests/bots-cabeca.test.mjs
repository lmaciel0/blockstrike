import test from 'node:test';
import assert from 'node:assert/strict';
import { mod } from './_repo.mjs';

const { pensar, criarCerebro } = await mod('packages/sim/src/bots.js');
const { criarMundo, posicionarParaRound, passo } = await mod('packages/sim/src/mundo.js');
const { criarGrafo } = await mod('packages/sim/src/navegacao.js');
const { MAPA } = await mod('packages/sim/src/mapa.js');
const { criarRng } = await mod('packages/sim/src/rng.js');

const DT = 1 / 20;
const ROUNDS = 100;
const SEGUNDOS = 60;
const grafo = criarGrafo(MAPA.waypoints, MAPA.arestas);

// Bots contra bots (os 10, inclusive o "jogador") em rounds seedados; devolve a fatia de acertos na cabeça.
function fatiaCabeca(dif) {
  let acertos = 0;
  let cabecas = 0;
  for (let r = 0; r < ROUNDS; r++) {
    const mundo = criarMundo({ mapa: MAPA, primariaJogador: 'rifle', dificuldade: dif, rng: criarRng(100 + r) });
    mundo.entidades[0].bot = true;
    posicionarParaRound(mundo, r % 2 ? 'A' : 'B');
    const rng = criarRng(500 + r);
    for (const e of mundo.entidades) e.cerebro = criarCerebro(e, grafo, rng, MAPA.caixas);
    for (let i = 0; i < SEGUNDOS / DT; i++) {
      const comandos = new Map();
      for (const e of mundo.entidades) if (e.vivo) comandos.set(e.id, pensar(e, mundo, grafo, dif, DT, rng));
      for (const ev of passo(mundo, DT, comandos)) {
        if (ev.tipo !== 'acerto') continue;
        acertos += 1;
        if (ev.parte === 'cabeca') cabecas += 1;
      }
    }
  }
  return { acertos, fatia: cabecas / acertos };
}

test('fatia de acertos na cabeça cresce: fácil < médio < difícil', () => {
  const f = fatiaCabeca('facil');
  const m = fatiaCabeca('medio');
  const d = fatiaCabeca('dificil');
  const pct = (x) => `${(100 * x.fatia).toFixed(1)}% de ${x.acertos}`;
  console.log(`cabeça: fácil ${pct(f)}, médio ${pct(m)}, difícil ${pct(d)}`);
  for (const x of [f, m, d]) assert.ok(x.acertos > 800, `amostra pequena: ${x.acertos}`);
  assert.ok(f.fatia + 0.01 < m.fatia, 'médio deve ter ao menos 1 ponto a mais que fácil');
  assert.ok(m.fatia + 0.01 < d.fatia, 'difícil deve ter ao menos 1 ponto a mais que médio');
});
