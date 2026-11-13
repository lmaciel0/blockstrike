import { expect, test } from 'vitest';
import { criarMundo, posicionarParaRound, passo } from '../src/mundo.js';
import { criarBomba } from '../src/bomba.js';
import { pensar, criarCerebro } from '../src/bots.js';
import { criarGrafo } from '../src/navegacao.js';
import { MAPA } from '../src/mapa.js';
import { criarRng } from '../src/rng.js';
import type { Bomba, Cerebro, Comandos, Entidade, Evento, Grafo, Mundo, Rng, Time } from '../src/tipos.js';

interface Cena { mundo: Mundo & { bomba: Bomba }; grafo: Grafo; rng: Rng }

// `criarMundo` ainda é JS sem tipos (mundo.ts tem @ts-nocheck): o cast abaixo cai quando ele for tipado.
function cenario(seed = 3): Cena {
  const mundo = criarMundo({ mapa: MAPA, primariaJogador: 'rifle', dificuldade: 'medio', rng: criarRng(seed) }) as Mundo;
  mundo.entidades[0].bot = true; // o "jogador" também é um bot na simulação
  posicionarParaRound(mundo, 'A');
  const grafo = criarGrafo(MAPA.waypoints, MAPA.arestas);
  const rng = criarRng(seed * 31);
  mundo.bomba = criarBomba(mundo, 'laranja');
  for (const e of mundo.entidades) e.cerebro = criarCerebro(e, grafo, rng, MAPA.caixas, mundo);
  return { mundo: mundo as Cena['mundo'], grafo, rng };
}
const matar = (mundo: Mundo, time: Time): void => {
  for (const e of mundo.entidades) if (e.time === time) { e.vivo = false; e.hp = 0; }
};
// `fora`: ids vivos que não pensam (ficam parados onde o teste os pôs).
function rodar(
  { mundo, grafo, rng }: Cena, seg: number,
  { parar = () => false, fora = [] }: { parar?: () => boolean; fora?: number[] } = {},
): Evento[] {
  const eventos: Evento[] = [];
  for (let i = 0; i < seg / 0.05 && !parar(); i++) {
    const cmds = new Map<number, Comandos>();
    for (const e of mundo.entidades) {
      if (e.vivo && !fora.includes(e.id)) cmds.set(e.id, pensar(e, mundo, grafo, 'medio', 0.05, rng));
    }
    eventos.push(...passo(mundo, 0.05, cmds));
  }
  return eventos;
}

const SEEDS = [3, 4, 5, 6];
const ts = (mundo: Mundo): Entidade[] => mundo.entidades.filter((e) => e.vivo && e.time === 'laranja');
function mediaPares(lista: Entidade[]): number {
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
function menorPar(lista: Entidade[]): number {
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
    const porRota = rotas.map((id) => ts(c.mundo).filter((e) => (e.cerebro as Cerebro).rota.includes(id)).length);
    expect(porRota[0] >= 2 && porRota[1] >= 2, `seed ${seed}: Ts por rota ${porRota}`).toBeTruthy();
  }
});

test('no meio do caminho os Ts não andam em fila (distância média entre eles)', () => {
  for (const seed of SEEDS) {
    const c = cenario(seed);
    matar(c.mundo, 'azul');
    rodar(c, 9);
    const d = mediaPares(ts(c.mundo));
    expect(d >= 12, `seed ${seed}: distância média ${d.toFixed(1)} m`).toBeTruthy();
  }
});

test('no bombsite os Ts se espalham em vez de ficar todos no mesmo ponto', () => {
  for (const seed of SEEDS) {
    const c = cenario(seed);
    matar(c.mundo, 'azul');
    rodar(c, 70, { parar: () => c.mundo.bomba.plantada });
    rodar(c, 12);
    const lista = ts(c.mundo);
    expect(menorPar(lista) >= 1.5, `seed ${seed}: menor distância ${menorPar(lista).toFixed(2)} m`).toBeTruthy();
    expect(mediaPares(lista) >= 3, `seed ${seed}: distância média ${mediaPares(lista).toFixed(1)} m`).toBeTruthy();
  }
});
