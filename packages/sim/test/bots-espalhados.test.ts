import { expect, test } from 'vitest';
import { criarMundo, posicionarParaRound, passo } from '../src/mundo.js';
import { criarBomba } from '../src/bomba.js';
import { pensar, criarCerebro, pontoDoPosto, pontosLivresDoPosto } from '../src/bots.js';
import { criarGrafo } from '../src/navegacao.js';
import { MAPA } from '../src/mapa.js';
import { criarRng } from '../src/rng.js';
import type { Bomba, Cerebro, Comandos, Entidade, Evento, Grafo, Mapa, Mundo, Rng, Time } from '../src/tipos.js';

interface Cena { mundo: Mundo & { bomba: Bomba }; grafo: Grafo; rng: Rng }

function cenario(seed = 3, mapa: Mapa = MAPA): Cena {
  const mundo = criarMundo({ mapa, primariaJogador: 'rifle', dificuldade: 'medio', rng: criarRng(seed) });
  mundo.entidades[0].bot = true; // o "jogador" também é um bot na simulação
  posicionarParaRound(mundo, 'A');
  const grafo = criarGrafo(mapa.waypoints, mapa.arestas);
  const rng = criarRng(seed * 31);
  mundo.bomba = criarBomba(mundo, 'laranja');
  for (const e of mundo.entidades) e.cerebro = criarCerebro(e, grafo, rng, mapa.caixas, mundo);
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

// ---------- CTs no posto: cada um no seu ponto em volta do `espera` ----------
const cts = (mundo: Mundo): Entidade[] => mundo.entidades.filter((e) => e.vivo && e.time === 'azul');
const ctsDoA = (mundo: Mundo): Entidade[] => cts(mundo).filter((e) => e.id % 2 === 0);
const distXZ = (a: Entidade, b: { x: number; z: number }): number => Math.hypot(a.pos.x - b.x, a.pos.z - b.z);

test('no posto os CTs do mesmo site ficam a pelo menos 2 m uns dos outros', () => {
  for (const seed of SEEDS) {
    const c = cenario(seed);
    matar(c.mundo, 'laranja');
    rodar(c, 20);
    const noPosto = cts(c.mundo).filter((e) => (e.cerebro as Cerebro).estado === 'posto');
    expect(noPosto.some((e) => e.id % 2 === 0), `seed ${seed}: nenhum CT do A em posto`).toBeTruthy();
    for (let i = 0; i < noPosto.length; i++) {
      for (let j = i + 1; j < noPosto.length; j++) {
        const a = noPosto[i];
        const b = noPosto[j];
        if ((a.cerebro as Cerebro).chaveBomba !== (b.cerebro as Cerebro).chaveBomba) continue;
        const d = distXZ(a, b.pos);
        expect(d >= 2, `seed ${seed}: CTs ${a.id} e ${b.id} a ${d.toFixed(2)} m`).toBeTruthy();
      }
    }
  }
});

test('posto: índice do CT não muda quando um colega morre', () => {
  for (const seed of SEEDS) {
    const c = cenario(seed);
    matar(c.mundo, 'laranja');
    rodar(c, 20);
    const guardadas = new Map(ctsDoA(c.mundo).map((e) => [e.id, { ...e.pos }]));
    expect(guardadas.size >= 2, `seed ${seed}: CTs do A`).toBeTruthy();
    const posicoes = [...guardadas.values()];
    expect(Math.max(...posicoes.map((a) => Math.max(...posicoes.map((b) => Math.hypot(a.x - b.x, a.z - b.z))))) >= 2,
      `seed ${seed}: CTs do A empilhados, o teste não prova nada`).toBeTruthy();
    const menor = ctsDoA(c.mundo).reduce((m, e) => (e.id < m.id ? e : m));
    menor.vivo = false;
    menor.hp = 0;
    rodar(c, 3);
    for (const e of ctsDoA(c.mundo)) {
      const p = guardadas.get(e.id)!;
      expect(distXZ(e, p) < 0.6, `seed ${seed}: CT ${e.id} andou ${distXZ(e, p).toFixed(2)} m`).toBeTruthy();
    }
  }
});

test('posto: pontos bloqueados são pulados e os CTs seguem espalhados', () => {
  // Caixas altas sobre os pontos de +3 m e -3 m do `espera` (cópia de MAPA: MAPA não muda).
  const caixas = [...MAPA.caixas];
  for (const site of ['A'] as const) {
    const { espera, mira } = MAPA.bombsites[site];
    for (const k of [0, 1] as const) {
      const w = MAPA.waypoints[espera[k]];
      const dx = mira[k].x - w.x;
      const dz = mira[k].z - w.z;
      const n = Math.hypot(dx, dz);
      const px = -dz / n;
      const pz = dx / n;
      for (const off of [3, -3]) {
        const x = w.x + px * off;
        const z = w.z + pz * off;
        caixas.push({ min: { x: x - 0.8, y: 0, z: z - 0.8 }, max: { x: x + 0.8, y: 4, z: z + 0.8 }, cor: 0x888888 });
      }
    }
  }
  const mapa: Mapa = { ...MAPA, caixas };
  expect(MAPA.caixas.length).toBeLessThan(caixas.length);
  for (const seed of SEEDS) {
    // Controle: sem as caixas os CTs do A também se espalham.
    const livre = cenario(seed);
    matar(livre.mundo, 'laranja');
    rodar(livre, 20);
    expect(menorPar(ctsDoA(livre.mundo)) >= 2, `seed ${seed}: controle sem caixas`).toBeTruthy();

    const c = cenario(seed, mapa);
    matar(c.mundo, 'laranja');
    rodar(c, 18);
    let moveu = 0;
    for (let i = 0; i < 40; i++) { // últimos 2 s
      const cmds = new Map<number, Comandos>();
      for (const e of c.mundo.entidades) if (e.vivo) cmds.set(e.id, pensar(e, c.mundo, c.grafo, 'medio', 0.05, c.rng));
      for (const e of ctsDoA(c.mundo)) {
        const m = cmds.get(e.id)!;
        if (m.frente !== 0 || m.lado !== 0) moveu += 1;
      }
      passo(c.mundo, 0.05, cmds);
    }
    const doA = ctsDoA(c.mundo);
    for (const e of doA) {
      expect((e.cerebro as Cerebro).estado, `seed ${seed}: CT ${e.id}`).toBe('posto');
      const dentro = caixas.slice(MAPA.caixas.length).some((b) => e.pos.x > b.min.x && e.pos.x < b.max.x &&
        e.pos.z > b.min.z && e.pos.z < b.max.z);
      expect(dentro, `seed ${seed}: CT ${e.id} dentro da caixa`).toBe(false);
    }
    expect(menorPar(doA) >= 2, `seed ${seed}: menor distância ${menorPar(doA).toFixed(2)} m`).toBeTruthy();
    expect(moveu, `seed ${seed}: passos com movimento`).toBe(0);
  }
});

test('posto: sem ponto livre, o ponto do CT é o próprio waypoint', () => {
  // Cópia de MAPA com uma caixa alta cobrindo o `espera` do A (casaZ 0) e toda a volta (candidatos): nenhum livre.
  // O ponto do CT cai no próprio `espera`; testado direto no helper (pontosLivresDoPosto/pontoDoPosto).
  const w = MAPA.waypoints[MAPA.bombsites.A.espera[0]];
  const caixa = { min: { x: w.x - 12, y: 0, z: w.z - 12 }, max: { x: w.x + 12, y: 4, z: w.z + 12 }, cor: 0x888888 };
  const mapa: Mapa = { ...MAPA, caixas: [...MAPA.caixas, caixa] };
  const c = cenario(3, mapa);
  expect(pontosLivresDoPosto(c.mundo, 'A', 0)).toEqual([]);
  const ct = ctsDoA(c.mundo).find((e) => (e.cerebro as Cerebro).casaZ === 0)!;
  expect(pontoDoPosto(ct, c.mundo, 'A')).toEqual({ x: w.x, z: w.z });
  expect(MAPA.caixas.length).toBe(mapa.caixas.length - 1);

  // Sem a caixa há candidatos livres e o ponto não é o waypoint para quem tem índice > 0.
  const livre = cenario(3);
  expect(pontosLivresDoPosto(livre.mundo, 'A', 0).length).toBeGreaterThan(1);
});
