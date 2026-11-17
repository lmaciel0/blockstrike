import { expect, test } from 'vitest';
import { criarMundo, posicionarParaRound, passo } from '../src/mundo.js';
import { criarBomba } from '../src/bomba.js';
import { pensar, criarCerebro, pontoDoPosto } from '../src/bots.js';
import { criarGrafo } from '../src/navegacao.js';
import { temVisada } from '../src/fisica.js';
import { MAPA } from '../src/mapa.js';
import { criarRng } from '../src/rng.js';
import type { Bomba, Cerebro, Comandos, Entidade, Evento, Grafo, Mundo, PontoXZ, Rng, Site, Time } from '../src/tipos.js';

interface Cena { mundo: Mundo & { bomba: Bomba }; grafo: Grafo; rng: Rng }

function cenario(seed = 3): Cena {
  const mundo = criarMundo({ mapa: MAPA, primariaJogador: 'rifle', dificuldade: 'medio', rng: criarRng(seed) });
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

const yawPara = (d: PontoXZ, p: PontoXZ): number => Math.atan2(-(p.x - d.x), -(p.z - d.z));
const angulo = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));
const dist = (a: PontoXZ, b: PontoXZ): number => Math.hypot(a.x - b.x, a.z - b.z);
const siteDe = (e: Entidade): Site => (e.id % 2 === 0 ? 'A' : 'B');
const esperaDe = (e: Entidade) => MAPA.waypoints[MAPA.bombsites[siteDe(e)].espera[0]];
const miraDe = (e: Entidade): PontoXZ => MAPA.bombsites[siteDe(e)].mira[0];
const cts = (mundo: Mundo): Entidade[] => mundo.entidades.filter((e) => e.time === 'azul' && e.vivo);
const cerebroDe = (e: Entidade): Cerebro => e.cerebro as Cerebro;

// CTs no posto, sem nenhum T vivo.
function noPosto(seed = 3): Cena {
  const c = cenario(seed);
  matar(c.mundo, 'laranja');
  rodar(c, 30);
  return c;
}

// Revive um T parado no ponto pedido (fora do `pensar`).
function reviverT(mundo: Mundo, pos: PontoXZ): Entidade {
  const t = mundo.entidades.find((e) => e.time === 'laranja')!;
  Object.assign(t, { vivo: true, hp: 100, pos: { x: pos.x, y: 0, z: pos.z }, velY: 0, velHoriz: 0 });
  return t;
}

test('os pontos de mira têm visada do posto', () => {
  for (const nome of ['A', 'B'] as const) {
    const s = MAPA.bombsites[nome];
    for (const casa of [0, 1] as const) {
      const w = MAPA.waypoints[s.espera[casa]];
      expect(temVisada({ x: w.x, y: 1.6, z: w.z }, { ...s.mira[casa], y: 1.6 }, MAPA.caixas), `${nome}[${casa}] sem visada`).toBeTruthy();
    }
  }
});

test('CT chega ao posto e mira a entrada', () => {
  for (const seed of [3, 4, 5, 6]) {
    const { mundo } = noPosto(seed);
    for (const e of cts(mundo)) {
      const tag = `seed ${seed}, bot ${e.id}`;
      expect(cerebroDe(e).estado, `${tag}: estado ${cerebroDe(e).estado}`).toBe('posto');
      // Cada CT fica no seu ponto em volta do `espera` (pontoDoPosto), não todos em cima dele.
      const meu = pontoDoPosto(e, mundo, siteDe(e));
      expect(dist(e.pos, meu) < 1.5, `${tag}: a ${dist(e.pos, meu).toFixed(2)} m do seu ponto no posto`).toBeTruthy();
      const erro = Math.abs(angulo(e.yaw - yawPara(e.pos, miraDe(e))));
      expect(erro < 0.3, `${tag}: mira fora da entrada (${erro.toFixed(2)} rad)`).toBeTruthy();
    }
  }
});

test('CT no posto atira do lugar sem avançar', () => {
  const c = noPosto(3);
  const t = reviverT(c.mundo, { x: 28, z: -19.5 });
  const ctsB = cts(c.mundo).filter((e) => siteDe(e) === 'B');
  const antes = new Map(ctsB.map((e) => [e.id, { ...e.pos }]));
  const ev = rodar(c, 3, { fora: [t.id] });
  for (const e of ctsB) {
    expect(dist(e.pos, antes.get(e.id)!) < 0.5, `bot ${e.id} andou ${dist(e.pos, antes.get(e.id)!).toFixed(2)} m`).toBeTruthy();
  }
  expect(ev.some((x) => x.tipo === 'tiro' && ctsB.some((e) => e.id === x.atirador)), 'nenhum CT do B atirou').toBeTruthy();
});

test('C4 plantada tira o CT do posto', () => {
  const c = noPosto(3);
  const b = c.mundo.bomba;
  const centro = MAPA.bombsites.A.centro;
  Object.assign(b, { plantada: true, portador: null, site: 'A', pos: { x: centro.x, y: 0, z: centro.z }, restante: 40 });
  const ctB = cts(c.mundo).find((e) => siteDe(e) === 'B')!;
  const antes = dist(ctB.pos, b.pos!);
  rodar(c, 15);
  expect(cerebroDe(ctB).estado).not.toBe('posto');
  expect(antes - dist(ctB.pos, b.pos!) >= 10, `aproximou só ${(antes - dist(ctB.pos, b.pos!)).toFixed(1)} m`).toBeTruthy();
});

test('tiro de quem não vê manda para a cobertura e depois de volta ao posto', () => {
  const c = noPosto(3);
  const t = reviverT(c.mundo, { x: 0, z: -26 }); // na base T, atrás da barreira
  const ct = cts(c.mundo).find((e) => siteDe(e) === 'B')!;
  // Plano 2: o CT só recebe a direção do tiro (yaw da vítima para o atirador), não o id nem a posição do T.
  cerebroDe(ct).ultimoDano = { angulo: yawPara(ct.pos, t.pos), em: c.mundo.tempo };
  pensar(ct, c.mundo, c.grafo, 'medio', 0.05, c.rng);
  expect(cerebroDe(ct).estado).toBe('cobertura');
  rodar(c, 15, { fora: [t.id] });
  expect(cerebroDe(ct).estado).toBe('posto');
  expect(dist(ct.pos, esperaDe(ct)) < 1.5, `a ${dist(ct.pos, esperaDe(ct)).toFixed(2)} m do posto`).toBeTruthy();
});

// Na troca de lados (round 13), o cérebro novo era montado lendo o `casaZ` do cérebro do round anterior,
// da outra metade do mapa: o CT ia para o `espera` errado e nunca entrava no posto.
test('cérebro novo usa a metade de onde o bot nasceu, não a do round anterior', () => {
  for (const seed of [3, 4, 5]) {
    const c = cenario(seed);
    matar(c.mundo, 'laranja');
    for (const e of cts(c.mundo)) {
      e.cerebro = { ...cerebroDe(e), casaZ: 1 }; // sobra do round anterior, quando nasceu em z < 0
      e.cerebro = criarCerebro(e, c.grafo, c.rng, MAPA.caixas, c.mundo);
    }
    rodar(c, 30);
    for (const e of cts(c.mundo)) {
      const tag = `seed ${seed}, bot ${e.id}`;
      expect(cerebroDe(e).estado, `${tag}: estado ${cerebroDe(e).estado}`).toBe('posto');
      // Cada CT fica no seu ponto em volta do `espera` (pontoDoPosto), não todos em cima dele.
      const meu = pontoDoPosto(e, c.mundo, siteDe(e));
      expect(dist(e.pos, meu) < 1.5, `${tag}: a ${dist(e.pos, meu).toFixed(2)} m do seu ponto no posto`).toBeTruthy();
    }
  }
});

// Plano 2 (mira humana): o CT no posto não gira mais no primeiro quadro em que vê alguém (a mão espera `mao.atraso`).
// Inimigo que aparece um instante na borda do cone e some: a mão vai para onde ele foi percebido, em vez de voltar
// para a entrada (antes, com o T oscilando na borda do cone, o CT nunca chegava a mirar nem atirar).
test('CT no posto vira para onde percebeu o inimigo que sumiu', () => {
  const c = noPosto(3);
  const e = cts(c.mundo)[0];
  const olhoE = { x: e.pos.x, y: e.pos.y + 1.6, z: e.pos.z };
  const yawVisto = e.yaw + (50 * Math.PI) / 180;
  let ponto: PontoXZ | null = null;
  for (let d = 12; d >= 4 && !ponto; d -= 0.5) {
    const p = { x: e.pos.x - Math.sin(yawVisto) * d, z: e.pos.z - Math.cos(yawVisto) * d };
    if (temVisada(olhoE, { x: p.x, y: 1.6, z: p.z }, MAPA.caixas)) ponto = p;
  }
  expect(ponto, 'sem ponto com visada a 50° do posto').not.toBe(null);
  const t = reviverT(c.mundo, ponto!);
  const umPasso = (): void => {
    const cmd = pensar(e, c.mundo, c.grafo, 'medio', 1 / 60, c.rng);
    passo(c.mundo, 1 / 60, new Map([[e.id, cmd]]));
  };
  umPasso(); // vê o T por um quadro
  expect(cerebroDe(e).alvoId).toBe(t.id);
  t.pos = { x: e.pos.x + Math.sin(e.yaw) * 10, y: 0, z: e.pos.z + Math.cos(e.yaw) * 10 }; // some: 10 m às costas
  const alvoYaw = yawPara(e.pos, ponto!);
  for (let i = 0; i < 48; i++) umPasso(); // 0,8 s: passa o atraso (0,4 s) e a mão gira
  const erro = Math.abs(angulo(e.yaw - alvoYaw));
  expect(erro < 0.25, `mira a ${erro.toFixed(2)} rad do ponto percebido`).toBeTruthy();
});

// Task 10 (balanceamento): no fácil o CT segura o ângulo mal, a mira parada do posto fica até 0,6 rad (~34°)
// fora da entrada; no médio e no difícil continua até 0,15 rad. Com 0,15 no fácil o CT de mira pronta ganhava
// quase todo duelo de quem entrava (vitória T 40%).
test('a mira parada do posto varia mais no fácil que no médio e no difícil', () => {
  const grafo = criarGrafo(MAPA.waypoints, MAPA.arestas);
  const maior = (dificuldade: 'facil' | 'medio' | 'dificil'): number => {
    const mundo = criarMundo({ mapa: MAPA, primariaJogador: 'rifle', dificuldade, rng: criarRng(7) });
    const rng = criarRng(11);
    let m = 0;
    for (let i = 0; i < 40; i++) {
      for (const e of mundo.entidades) m = Math.max(m, Math.abs(criarCerebro(e, grafo, rng, MAPA.caixas, mundo).desvioMira));
    }
    return m;
  };
  const facil = maior('facil');
  expect(facil > 0.45 && facil <= 0.6, `fácil: desvio máximo ${facil.toFixed(3)}`).toBeTruthy();
  expect(maior('medio')).toBeLessThanOrEqual(0.15);
  expect(maior('dificil')).toBeLessThanOrEqual(0.15);
});
