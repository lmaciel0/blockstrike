import { expect, test } from 'vitest';
import { criarMundo, posicionarParaRound, passo } from '../src/mundo.js';
import { criarBomba } from '../src/bomba.js';
import { pensar, criarCerebro } from '../src/bots.js';
import { criarGrafo } from '../src/navegacao.js';
import { MAPA } from '../src/mapa.js';
import { criarRng } from '../src/rng.js';
import type { Bomba, Cerebro, Comandos, Evento, Grafo, Mundo, Rng, Site, Time } from '../src/tipos.js';

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
function rodar({ mundo, grafo, rng }: Cena, seg: number, parar: () => boolean = () => false): Evento[] {
  const eventos: Evento[] = [];
  for (let i = 0; i < seg / 0.05 && !parar(); i++) {
    const cmds = new Map<number, Comandos>();
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
    expect(c.mundo.bomba.plantada, `seed ${seed}: não plantou`).toBeTruthy();
    expect(c.mundo.bomba.site, `seed ${seed}: plantou no site errado`).toBe(sorteado);
  }
});

test('terroristas sem a C4 vão para o mesmo bombsite e esperam lá', () => {
  const c = cenario(4);
  matar(c.mundo, 'azul');
  const portador = c.mundo.bomba.portador;
  rodar(c, 70, () => c.mundo.bomba.plantada);
  rodar(c, 5);
  const s = MAPA.bombsites[c.mundo.bomba.site as Site];
  const outros = c.mundo.entidades.filter((e) => e.time === 'laranja' && e.id !== portador);
  const noSite = outros.filter((e) => Math.hypot(e.pos.x - s.centro.x, e.pos.z - s.centro.z) < 10);
  expect(noSite.length >= 3, `só ${noSite.length} de ${outros.length} chegaram ao site`).toBeTruthy();
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
    expect(b.desarmada, `seed ${seed}: ninguém desarmou (restante ${b.restante.toFixed(1)})`).toBeTruthy();
    expect(ev.some((e) => e.tipo === 'desarmada')).toBeTruthy();
  }
});

test('C4 solta: o terrorista mais perto a pega', () => {
  const c = cenario(5);
  matar(c.mundo, 'azul');
  const b = c.mundo.bomba;
  const antigo = c.mundo.entidades[b.portador!];
  antigo.vivo = false;
  antigo.hp = 0;
  const ponto = { x: 0, y: 0, z: 10 };
  b.portador = null;
  b.pos = ponto;
  rodar(c, 40, () => b.portador !== null);
  expect(b.portador, 'ninguém pegou a C4').not.toBe(null);
  expect(b.portador).not.toBe(antigo.id);
});

// Armadilha da Task 9 (R10): a reta do centro do bot até a C4 passa a 0,3 m da quina da caixa
// x -1,5..1,5, z -16..-14, mas o corpo (raio 0,35) encosta nela. O `direto` sobrepunha a rota e o
// desencalhe não tirava o bot dali (29 desencalhes em 30 s, nunca pegava a C4).
test('C4 solta atrás da quina: o desencalhe larga o caminho direto e o bot pega a C4', () => {
  const c = cenario(3);
  const b = c.mundo.bomba;
  const bot = c.mundo.entidades.find((e) => e.time === 'laranja')!;
  for (const e of c.mundo.entidades) if (e !== bot) { e.vivo = false; e.hp = 0; }
  Object.assign(b, { portador: null, pos: { x: -1.82, y: 0, z: -12.04 } });
  bot.pos.x = 1.75;
  bot.pos.z = -16.4;
  rodar(c, 20, () => b.portador !== null);
  const desenc = (bot.cerebro as Cerebro).desencalhes;
  expect(b.portador, `não pegou a C4 (pos ${bot.pos.x.toFixed(2)}, ${bot.pos.z.toFixed(2)}; desencalhes ${desenc})`).toBe(bot.id);
  expect(desenc).toBeLessThanOrEqual(2);
});

test('sem mundo.bomba os bots seguem o comportamento antigo', () => {
  const c = cenario(3);
  (c.mundo as Mundo).bomba = null;
  for (const e of c.mundo.entidades) e.cerebro = criarCerebro(e, c.grafo, c.rng, MAPA.caixas, c.mundo);
  const cmd = pensar(c.mundo.entidades[6], c.mundo, c.grafo, 'medio', 0.05, c.rng);
  expect(cmd.usar).toBe(false);
});
