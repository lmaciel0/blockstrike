import { expect, test, vi } from 'vitest';

// Conta as chamadas da mão virtual; o comportamento continua o real.
const chamadas = vi.hoisted(() => ({ n: 0 }));
vi.mock('../src/mao.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../src/mao.js')>();
  return { ...real, moverMao: (...a: Parameters<typeof real.moverMao>) => { chamadas.n++; return real.moverMao(...a); } };
});

import { criarMundo, posicionarParaRound, passo } from '../src/mundo.js';
import { criarBomba } from '../src/bomba.js';
import { pensar, criarCerebro } from '../src/bots.js';
import { criarGrafo } from '../src/navegacao.js';
import { MAPA } from '../src/mapa.js';
import { PITCH_MAX } from '../src/fisica.js';
import { criarRng } from '../src/rng.js';
import type { Cerebro, Comandos, Mundo } from '../src/tipos.js';

// Uma só atualização da mão por bot e por passo: a velocidade da mão é integrada uma vez por dt. Duas chamadas
// no mesmo passo (olhar o ponto percebido e olhar o ruído) faziam a mira girar até ~2x mais rápido e sortear tremor a mais.
const DT = 0.05;

function postoSemT(): { mundo: Mundo; grafo: ReturnType<typeof criarGrafo> } {
  const mundo = criarMundo({ mapa: MAPA, primariaJogador: 'rifle', dificuldade: 'medio', rng: criarRng(3) });
  mundo.entidades[0].bot = true;
  posicionarParaRound(mundo, 'A');
  const grafo = criarGrafo(MAPA.waypoints, MAPA.arestas);
  const rng = criarRng(93);
  mundo.bomba = criarBomba(mundo, 'laranja');
  for (const e of mundo.entidades) e.cerebro = criarCerebro(e, grafo, rng, MAPA.caixas, mundo);
  for (const e of mundo.entidades) if (e.time === 'laranja') { e.vivo = false; e.hp = 0; }
  for (let i = 0; i < 600; i++) {
    const cmds = new Map<number, Comandos>();
    for (const e of mundo.entidades) if (e.vivo) cmds.set(e.id, pensar(e, mundo, grafo, 'medio', DT, rng));
    passo(mundo, DT, cmds);
  }
  return { mundo, grafo };
}

test('posto sem alvo à vista: no máximo uma atualização da mão por passo (alvo guardado + ruído vivo)', () => {
  const { mundo, grafo } = postoSemT();
  const bot = mundo.entidades.find((e) => e.time === 'azul' && e.vivo && (e.cerebro as Cerebro).estado === 'posto')!;
  expect(bot, 'um CT no posto').toBeTruthy();
  const c = bot.cerebro as Cerebro;
  const rng = criarRng(5);
  for (let i = 0; i < 10; i++) {
    const agora = mundo.tempo;
    // Alvo guardado com amostras dentro da janela, passadas o bastante do atraso (0,35 s); ruído ainda vivo.
    c.alvoId = 5;
    c.perdidoHa = 0;
    c.percepcao.push(
      { id: 5, t: agora - 0.8, pos: { x: bot.pos.x + 6, y: 0, z: bot.pos.z + 6 }, agachado: false },
      { id: 5, t: agora - 0.7, pos: { x: bot.pos.x + 6, y: 0, z: bot.pos.z + 6.2 }, agachado: false },
    );
    c.ouvidoPos = { x: bot.pos.x - 8, z: bot.pos.z + 8 };
    c.ouvidoAte = agora + 1;
    chamadas.n = 0;
    pensar(bot, mundo, grafo, 'medio', DT, rng);
    expect(chamadas.n, `passo ${i}`).toBeLessThanOrEqual(1);
    mundo.tempo += DT;
  }
});

// Quando o limite de pitch (±PITCH_MAX) corta a saída, a velocidade da mão que empurra para fora do limite zera;
// senão ela fica acumulando e a mira demora a descer quando o alvo volta.
test('pitch no limite: a velocidade da mão que empurra para fora zera', () => {
  for (const sinal of [1, -1]) {
    const { mundo, grafo } = postoSemT();
    const bot = mundo.entidades.find((e) => e.time === 'azul' && e.vivo && (e.cerebro as Cerebro).estado === 'posto')!;
    const c = bot.cerebro as Cerebro;
    const agora = mundo.tempo;
    bot.pitch = sinal * PITCH_MAX;
    c.alvoId = 5;
    c.perdidoHa = 0;
    c.ouvidoPos = null;
    c.ouvidoAte = 0;
    // Ponto percebido muito acima (ou abaixo) do olho: a mola empurra o pitch para fora do limite.
    c.percepcao.push({ id: 5, t: agora - 0.8, pos: { x: bot.pos.x + 3, y: sinal * 40, z: bot.pos.z }, agachado: false });
    c.mao.vPitch = sinal * 3;
    c.mao.usadaEm = agora - DT;
    const cmd = pensar(bot, mundo, grafo, 'medio', DT, criarRng(5));
    expect(cmd.pitch).toBeCloseTo(sinal * PITCH_MAX, 9);
    expect(c.mao.vPitch * sinal, `sinal ${sinal}`).toBeLessThanOrEqual(0);
  }
});
