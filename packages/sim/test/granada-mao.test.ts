import { expect, test } from 'vitest';
import { criarMundo, posicionarParaRound } from '../src/mundo.js';
import * as G from '../src/granadas.js';
import * as E from '../src/economia.js';
import * as C from '../src/config.js';
import * as A from '../src/armas.js';
import { MAPA } from '../src/mapa.js';
import { criarRng } from '../src/rng.js';
import type { Caixa, Comandos, Entidade, Equip, ForcaGranada, Mundo, TipoGranada } from '../src/tipos.js';

const chao: Caixa = { min: { x: -60, y: -1, z: -60 }, max: { x: 60, y: 0, z: 60 }, cor: 0x888888 };
const cmd = (extra: Partial<Comandos> = {}): Comandos => ({
  frente: 0, lado: 0, pular: false, agachar: false, devagar: false, atirar: false,
  zoom: false, recarregar: false, usar: false, granada: null, slot: null, yaw: 0, pitch: 0, ...extra,
});
// `criarMundo` ainda é JS sem tipos (mundo.ts tem @ts-nocheck): o cast abaixo cai quando ele for tipado.
function cenario(caixas: Caixa[] = [chao], economia = true): Mundo {
  const mundo = criarMundo({
    mapa: { ...MAPA, caixas }, primariaJogador: 'rifle', dificuldade: 'medio', rng: criarRng(9),
  }) as Mundo;
  if (economia) E.iniciarEconomia(mundo);
  posicionarParaRound(mundo, 'A');
  mundo.entidades.forEach((e, i) => { e.pos = { x: 50, y: 0, z: 50 - i * 0.5 }; e.noChao = true; });
  return mundo;
}
const dar = (e: Entidade, tipo: TipoGranada, n = 1): void => { (e.equip as Equip).granadas[tipo] = n; };

test('proximaGranada segue HE → flash → smoke e pula estoque zero', () => {
  // `molotov: 0` explícito: o tipo exige as quatro chaves (ausente ou zero, o resultado é o mesmo).
  expect(G.proximaGranada({ he: 1, molotov: 0, flash: 2, smoke: 1 }, null)).toBe('he');
  expect(G.proximaGranada({ he: 1, molotov: 0, flash: 2, smoke: 1 }, 'he')).toBe('flash');
  expect(G.proximaGranada({ he: 1, molotov: 0, flash: 2, smoke: 1 }, 'smoke')).toBe('he');
  expect(G.proximaGranada({ he: 0, molotov: 0, flash: 1, smoke: 0 }, 'flash')).toBe('flash');
  expect(G.proximaGranada({ he: 0, molotov: 0, flash: 0, smoke: 0 }, 'he')).toBe(null);
});
test('lancar usa a força pedida (mira reta)', () => {
  const casos: [ForcaGranada, number, number][] = [['longe', 18, 4], ['medio', 12, 3], ['curto', 7, 2]];
  for (const [forca, v, s] of casos) {
    const m = cenario(); const eu = m.entidades[0]; dar(eu, 'he'); eu.yaw = 0; eu.pitch = 0;
    expect(G.lancar(m, eu, 'he', [], null, forca)).toBeTruthy();
    const g = m.granadas[0];
    expect(Math.abs(Math.hypot(g.vel.x, g.vel.z) - v) < 1e-6, forca).toBeTruthy();
    expect(Math.abs(g.vel.y - s) < 1e-6, forca).toBeTruthy();
  }
});
test('atualizarMao: segurar e soltar o esquerdo joga longe; o direito, curto; os dois, médio', () => {
  const casos: [Partial<Comandos>[], number][] = [
    [[{ atirar: true }], 18], [[{ zoom: true }], 7], [[{ atirar: true }, { atirar: true, zoom: true }, { zoom: true }], 12],
  ];
  for (const [seq, v] of casos) {
    const m = cenario(); const eu = m.entidades[0]; dar(eu, 'he');
    const armas = eu.armas!;
    armas.granada = G.criarMao(); armas.granada.sel = 'he';
    for (const c of seq) expect(G.atualizarMao(m, eu, cmd(c), [])).toBe(false);
    expect(m.granadas?.length ?? 0).toBe(0); // ainda segurando: nada saiu
    expect(G.atualizarMao(m, eu, cmd(), [])).toBe(true);
    expect(Math.abs(Math.hypot(m.granadas[0].vel.x, m.granadas[0].vel.z) - v) < 1e-6).toBeTruthy();
    expect(eu.equip!.granadas.he).toBe(0);
  }
});
test('atualizarMao sem botão não faz nada', () => {
  const m = cenario(); const eu = m.entidades[0]; dar(eu, 'he');
  const armas = eu.armas!;
  armas.granada = G.criarMao(); armas.granada.sel = 'he';
  expect(G.atualizarMao(m, eu, cmd(), [])).toBe(false);
  expect(armas.granada.pino).toBe(null);
});
test('criarMao, ARMAS.granada, SAQUE e ORDEM_GRANADAS', () => {
  expect(C.ORDEM_GRANADAS).toStrictEqual(['he', 'molotov', 'flash', 'smoke']);
  expect(C.ARMAS.granada.slot).toBe('granada');
  expect(C.ARMAS.granada.vel).toBe(6.2);
  expect(A.SAQUE.granada).toBe(0.3);
  const mao = G.criarMao();
  expect(mao.tipo).toBe('granada'); expect(mao.sel).toBe(null); expect(mao.pino).toBe(null);
});
test('curto sai 0,3 m mais baixo', () => {
  const alt: Partial<Record<ForcaGranada, number>> = {};
  for (const f of ['longe', 'curto'] as const) {
    const m = cenario(); const eu = m.entidades[0]; dar(eu, 'he'); eu.yaw = 0; eu.pitch = 0;
    G.lancar(m, eu, 'he', [], null, f); alt[f] = m.granadas[0].pos.y;
  }
  expect(Math.abs(alt.longe! - alt.curto! - 0.3) < 1e-6).toBeTruthy();
});
