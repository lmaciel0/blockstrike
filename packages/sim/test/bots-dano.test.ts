import { expect, test } from 'vitest';
import { criarCerebro, pensar } from '../src/bots.js';
import { aplicarDano, criarMundo, posicionarParaRound } from '../src/mundo.js';
import { criarGrafo } from '../src/navegacao.js';
import { MAPA } from '../src/mapa.js';
import { criarRng } from '../src/rng.js';
import { atualizarGranadas, visadaLivre } from '../src/granadas.js';
import { GRANADA } from '../src/config.js';
import type { Caixa, Entidade, Mundo } from '../src/tipos.js';

// Dano de quem não vê: o bot recebe só a direção (±15°) de onde veio o tiro, nunca a posição do atirador.

const DT = 0.05;
const GRAU = Math.PI / 180;
const chao: Caixa = { min: { x: -50, y: -1, z: -50 }, max: { x: 50, y: 0, z: 50 }, cor: 0x888888 };
// Parede larga entre o bot (0,0) e os atiradores (z < -6): ninguém atrás dela é visto.
const muro: Caixa = { min: { x: -30, y: 0, z: -6 }, max: { x: 30, y: 3, z: -5 }, cor: 1 };
const grafo = criarGrafo(
  [{ id: 0, x: 0, z: 0 }, { id: 1, x: -4, z: 2, cobertura: true }, { id: 2, x: 4, z: 2, cobertura: true }],
  [[0, 1], [0, 2]],
);
const angulo = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));
const yawDe = (x: number, z: number): number => Math.atan2(-x, -z); // da origem para (x, z)

function cena(caixas: Caixa[], atirador: { x: number; z: number }): { mundo: Mundo; b: Entidade; t: Entidade } {
  const mundo = criarMundo({
    mapa: { ...MAPA, caixas }, primariaJogador: 'rifle', dificuldade: 'medio', rng: criarRng(1),
  });
  posicionarParaRound(mundo, 'A');
  for (const e of mundo.entidades) e.vivo = false;
  const b = mundo.entidades[1];
  const t = mundo.entidades[5];
  b.vivo = true;
  t.vivo = true;
  b.pos = { x: 0, y: 0, z: 0 };
  b.yaw = 0;
  t.pos = { x: atirador.x, y: 0, z: atirador.z };
  b.cerebro = criarCerebro(b, grafo, criarRng(2), caixas, mundo);
  return { mundo, b, t };
}

const levarTiro = (mundo: Mundo, b: Entidade, t: Entidade): void => {
  aplicarDano(mundo, t, 'rifle', { ent: b, parte: 'tronco', ponto: { x: 0, y: 1, z: 0 } }, []);
};

test('dano: distância do atirador não muda a decisão', () => {
  const resultado = [10, 40].map((d) => {
    const { mundo, b, t } = cena([chao, muro], { x: 0, z: -d }); // mesma direção, 10 m e 40 m
    levarTiro(mundo, b, t);
    pensar(b, mundo, grafo, 'medio', DT, criarRng(7));
    return { rota: b.cerebro!.rota, ouvidoPos: b.cerebro!.ouvidoPos, estado: b.cerebro!.estado };
  });
  expect(resultado[0].estado).toBe('cobertura');
  expect(resultado[0].ouvidoPos).not.toBe(null);
  expect(resultado[1]).toEqual(resultado[0]);
});

test('dano: direção percebida fica a até 15° da real', () => {
  let maiorErro = 0;
  for (let seed = 1; seed <= 200; seed++) {
    const { mundo, b, t } = cena([chao, muro], { x: 10, z: -20 });
    const real = yawDe(10, -20);
    levarTiro(mundo, b, t);
    pensar(b, mundo, grafo, 'medio', DT, criarRng(seed));
    const p = b.cerebro!.ouvidoPos!;
    const erro = Math.abs(angulo(yawDe(p.x, p.z) - real));
    expect(erro, `seed ${seed}`).toBeLessThanOrEqual(15 * GRAU + 1e-9);
    maiorErro = Math.max(maiorErro, erro);
  }
  expect(maiorErro, 'o erro existe').toBeGreaterThan(5 * GRAU);
});

test('dano: atirador visível continua em combate', () => {
  const { mundo, b, t } = cena([chao], { x: 0, z: -10 }); // na frente, sem parede
  levarTiro(mundo, b, t);
  pensar(b, mundo, grafo, 'medio', DT, criarRng(7));
  expect(b.cerebro!.estado).toBe('combate');
});

// Atirador (ou HE) atrás do bot, com uma fumaça no meio: o dano dá só a direção (±15°), nunca a posição.
// O ponto da ameaça fica sempre a 15 m do bot, qualquer que seja a distância real do atirador.
test('dano por trás através de fumaça: só direção ±15° e ponto a 15 m, qualquer distância', () => {
  for (const d of [12, 40]) {
    const { mundo, b, t } = cena([chao], { x: 5, z: d }); // atrás do bot (ele olha para -z)
    mundo.granadas.push({
      tipo: 'smoke', dono: t.id, time: t.time, nasceEm: mundo.tempo, fusivel: 0.05,
      pos: { x: 0, y: 0.2, z: 4 }, vel: { x: 0, y: 0, z: 0 }, quiques: 0,
    });
    const semDano = (): void => undefined;
    mundo.tempo += 0.1; // o fusível estoura e a nuvem nasce
    atualizarGranadas(mundo, 0.1, [], semDano);
    mundo.tempo += GRANADA.fumaca.abrir + 0.1; // nuvem aberta
    expect(mundo.fumacas.length, 'fumaça ativa').toBe(1);
    expect(visadaLivre(mundo, { x: 0, y: 1.6, z: 0 }, { x: 5, y: 1.6, z: d }), 'fumaça corta a visada').toBe(false);

    levarTiro(mundo, b, t);
    pensar(b, mundo, grafo, 'medio', DT, criarRng(7));
    const p = b.cerebro!.ouvidoPos!;
    expect(p, `d=${d}`).not.toBe(null);
    expect(Math.hypot(p.x - b.pos.x, p.z - b.pos.z), `d=${d}: ameaça a 15 m`).toBeCloseTo(15, 6);
    const erro = Math.abs(angulo(yawDe(p.x, p.z) - yawDe(5, d)));
    expect(erro, `d=${d}: direção`).toBeLessThanOrEqual(15 * GRAU + 1e-9);
  }
});
