import { expect, test } from 'vitest';
import { pensar, criarCerebro } from '../src/bots.js';
import { criarMundo, posicionarParaRound, passo } from '../src/mundo.js';
import { criarGrafo } from '../src/navegacao.js';
import { MAPA } from '../src/mapa.js';
import { criarRng } from '../src/rng.js';
import type { Comandos, Evento, Mundo, NomeDificuldade } from '../src/tipos.js';

// O sim não carrega tipos de DOM nem de Node: só o `console.log` que o teste original usa.
declare const console: { log(...dados: unknown[]): void };

const DT = 1 / 20;
const ROUNDS = 100;
const SEGUNDOS = 60;
const grafo = criarGrafo(MAPA.waypoints, MAPA.arestas);

interface Fatia { acertos: number; fatia: number }

// Bots contra bots (os 10, inclusive o "jogador") em rounds seedados; devolve a fatia de acertos na cabeça.
// `criarMundo` ainda é JS sem tipos (mundo.ts tem @ts-nocheck): o cast abaixo cai quando ele for tipado.
function fatiaCabeca(dif: NomeDificuldade): Fatia {
  let acertos = 0;
  let cabecas = 0;
  for (let r = 0; r < ROUNDS; r++) {
    const mundo = criarMundo({ mapa: MAPA, primariaJogador: 'rifle', dificuldade: dif, rng: criarRng(100 + r) }) as Mundo;
    mundo.entidades[0].bot = true;
    posicionarParaRound(mundo, r % 2 ? 'A' : 'B');
    const rng = criarRng(500 + r);
    for (const e of mundo.entidades) e.cerebro = criarCerebro(e, grafo, rng, MAPA.caixas);
    for (let i = 0; i < SEGUNDOS / DT; i++) {
      const comandos = new Map<number, Comandos>();
      for (const e of mundo.entidades) if (e.vivo) comandos.set(e.id, pensar(e, mundo, grafo, dif, DT, rng));
      const eventos: Evento[] = passo(mundo, DT, comandos);
      for (const ev of eventos) {
        if (ev.tipo !== 'acerto') continue;
        acertos += 1;
        if (ev.parte === 'cabeca') cabecas += 1;
      }
    }
  }
  return { acertos, fatia: cabecas / acertos };
}

// Simula 300 rounds de 60 s: sem limite de tempo do Vitest (o `node:test` original não tinha).
test('fatia de acertos na cabeça cresce: fácil < médio < difícil', () => {
  const f = fatiaCabeca('facil');
  const m = fatiaCabeca('medio');
  const d = fatiaCabeca('dificil');
  const pct = (x: Fatia): string => `${(100 * x.fatia).toFixed(1)}% de ${x.acertos}`;
  console.log(`cabeça: fácil ${pct(f)}, médio ${pct(m)}, difícil ${pct(d)}`);
  for (const x of [f, m, d]) expect(x.acertos > 800, `amostra pequena: ${x.acertos}`).toBeTruthy();
  expect(f.fatia + 0.01 < m.fatia, 'médio deve ter ao menos 1 ponto a mais que fácil').toBeTruthy();
  expect(m.fatia + 0.01 < d.fatia, 'difícil deve ter ao menos 1 ponto a mais que médio').toBeTruthy();
}, 0);
