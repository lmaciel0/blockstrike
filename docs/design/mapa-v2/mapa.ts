/**
 * Block Strike — mapa v2 (inspirado em Dust II, ainda simétrico por espelho em z).
 *
 * DROP-IN para `packages/sim/src/mapa.ts`. Mantém IGUAIS ao mapa atual: spawns, bombsites (retângulos, waypoint,
 * espera, mira), waypoints, arestas e ids. Só as caixas de colisão mudam, mais a camada `decoracao`
 * (só visual: o sim nunca a lê). Por isso bots e baselines continuam válidos; o que o desenho mexe é a
 * visada e os gargalos. Ver docs/design/2026-11-16-visual-overhaul-design.md (seção Mapa).
 *
 * Pré-requisito em `tipos.ts`: `Mapa.decoracao?: Caixa[]` (e o render desenhar `caixas` + `decoracao`).
 *
 * Regras que o desenho respeita (e os testes de mapa.test.ts cobram):
 *  - faixa central |z| < 0,5 livre de caixas altas: as arestas do grafo correm por ela (sites, meio, saídas);
 *  - bombsites sem nenhuma caixa dentro do retângulo; cobertura só do lado de fora;
 *  - nada cruza z = 0 no lado A (o lado B é o espelho).
 */

import type { Caixa, Mapa, PontoXZ } from './tipos.js';

// Paleta (Dust II em blocos): areia e adobe nas paredes, azul nas portas e containers, madeira nas caixas.
const AREIA = 0xd9c08a;
const ADOBE = 0xc49a63;
const GESSO = 0xeadfc4;
const TIJOLO = 0xa8523b;
const MADEIRA = 0x8a5a2b;
const MADEIRA_ESC = 0x6e4521;
const AZUL = 0x3f6fb5;
const VERDE = 0x4d7a56;
const FERRO = 0x6b6f76;
const FERRO_CLARO = 0x9aa0a8;
const PEDRA = 0x9a9a8f;
const CHAO = 0xc8b27a;

// Caixa por planta (x0,z0)-(x1,z1), altura h a partir de y0.
function caixa(x0: number, z0: number, x1: number, z1: number, h: number, cor: number, y0 = 0): Caixa {
  return { min: { x: x0, y: y0, z: z0 }, max: { x: x1, y: y0 + h, z: z1 }, cor };
}

function espelhar(c: Caixa): Caixa {
  return { ...c, min: { ...c.min, z: -c.max.z }, max: { ...c.max, z: -c.min.z } };
}

function escurecer(cor: number, k: number): number {
  const r = Math.round(((cor >> 16) & 255) * k);
  const g = Math.round(((cor >> 8) & 255) * k);
  const b = Math.round((cor & 255) * k);
  return (r << 16) | (g << 8) | b;
}

// Lado A (z > 0). Nada cruza z = 0.
const ladoA: Caixa[] = [
  // muros externos (4 m)
  caixa(-40.5, 30, 40.5, 30.5, 4, PEDRA),
  caixa(-40.5, 0, -40, 30, 4, PEDRA),
  caixa(40, 0, 40.5, 30, 4, PEDRA),

  // ── Base (spawn): barreira na frente e paredes laterais
  caixa(-9, 19, 9, 19.5, 4, ADOBE),
  caixa(-12, 21, -11.5, 30, 4, ADOBE),
  caixa(11.5, 21, 12, 30, 4, ADOBE),
  caixa(-8, 27, -7, 28, 1.2, MADEIRA),
  caixa(7, 27, 8, 28, 1.2, MADEIRA),

  // ── Longa A (x -40..-33): portão azul na entrada, container azul, caixas
  caixa(-33, 3, -32.5, 17.4, 4, AREIA), // parede interna da Longa, prolongada até o portão (o vão fica livre de quina)
  caixa(-40, 16.6, -37.6, 17.4, 4, ADOBE), // portão: pilar esquerdo (vão de 4,6 m até a parede interna)
  caixa(-37.6, 16.6, -33, 17.4, 1.2, ADOBE, 2.8), // portão: verga (passa-se por baixo)
  caixa(-40, 11.5, -37, 13.5, 2.6, AZUL), // container azul
  caixa(-37, 6, -35, 8, 1.2, MADEIRA),
  caixa(-38, 0.5, -36, 2.5, 1.2, MADEIRA),
  caixa(-37, 22, -35, 24, 2, TIJOLO),
  caixa(-30, 24, -27, 25, 2, AREIA),

  // ── Arco do A (entrada do site pela Longa): dois pilares e a verga; a faixa z = 0 fica livre
  caixa(-32.2, 1.2, -31, 2.4, 4, PEDRA),
  caixa(-32.2, 0, -31, 2.4, 1, PEDRA, 2.9),

  // ── Site A: cobertura do lado de fora do retângulo (z > 4): carro, pilha e barris
  caixa(-28, 4.8, -24, 6.6, 1, FERRO), // carro: carroceria
  caixa(-27.2, 5, -24.8, 6.4, 0.6, FERRO_CLARO, 1), // carro: cabine
  caixa(-21, 4.8, -19.5, 6.3, 1.2, MADEIRA),
  caixa(-20.7, 4.95, -19.8, 5.7, 0.8, MADEIRA_ESC, 1.2),
  caixa(-18.2, 5, -17.6, 5.6, 0.9, FERRO), // barril
  caixa(-17.4, 5.4, -16.8, 6, 0.9, FERRO),

  // ── Meio: portas do meio (vão de 3,2 m em x = 0), caixas baixas (1,2 m) e altas (2 m)
  caixa(-7, 7.2, -1.6, 7.8, 4, AREIA),
  caixa(1.6, 7.2, 7, 7.8, 4, AREIA),
  caixa(-1.5, 14, 1.5, 16, 2, VERDE), // "xbox" do meio, na frente do spawn
  caixa(-8, 10, -5.5, 11.5, 1.2, MADEIRA),
  caixa(5.5, 10, 8, 11.5, 1.2, MADEIRA),
  caixa(-10, 4, -8, 6, 2, AREIA),
  caixa(8, 4, 10, 6, 2, AREIA),
  caixa(-3, 3, -1, 4.5, 1.2, MADEIRA),
  caixa(1, 3, 3, 4.5, 1.2, MADEIRA),
  caixa(-16, 13, -14, 15, 2, TIJOLO),
  caixa(-15.5, 13.5, -14.5, 14.5, 1, MADEIRA, 2),
  caixa(14, 13, 16, 15, 2, TIJOLO),
  caixa(14.5, 13.5, 15.5, 14.5, 1, MADEIRA, 2),
  caixa(-20, 8, -18, 9.5, 1.2, MADEIRA),

  // ── Túneis do B (x 25,5..31): parede interna com a janela do B, parede externa e teto
  caixa(25, 4, 25.5, 9, 4, PEDRA),
  caixa(25, 9, 25.5, 12, 1.3, PEDRA), // peitoril da janela (mais alto que um pulo)
  caixa(25, 9, 25.5, 12, 1, PEDRA, 3), // verga da janela
  caixa(25, 12, 25.5, 21, 4, PEDRA),
  caixa(31, 1.5, 31.5, 14, 4, PEDRA),
  caixa(26, 4, 31, 16, 1, PEDRA, 3), // teto do túnel
  caixa(35, 10, 37, 12, 2, TIJOLO),
  caixa(33, 3, 34.5, 4.5, 1.2, MADEIRA),
  caixa(27, 25, 29, 27, 2, MADEIRA),
  caixa(20, 24, 22, 25, 1.2, AREIA),

  // ── Arco do B e site B: pilares na saída do túnel, caixas e container verde do lado de fora do retângulo
  caixa(26, 1.2, 27.2, 2.4, 4, PEDRA),
  caixa(26, 0, 27.2, 2.4, 1, PEDRA, 2.9),
  caixa(15, 4.8, 17, 6.4, 2, MADEIRA),
  caixa(17, 4.8, 18.5, 6, 1.2, MADEIRA),
  caixa(20.5, 4.8, 23.5, 6.6, 2.4, VERDE), // container verde
];

// Waypoints do lado A: [x, z, cobertura?]. O lado B é o espelho (id + N). IGUAIS ao mapa v1.
const wpA: [number, number, boolean?][] = [
  [0, 23], [-10, 20.3], [10, 20.3], [-14, 17], [14, 17], // 0-4 base e saídas
  [-35, 19], [-34, 10], [-38, 15.2, true], [-38.5, 4.5, true], [-34, 3.5], // 5-9 corredor
  [-6.7, 12.8, true], [0, 17.5, true], [0, 12.5], [6.7, 12.8, true], // 10-13 meio
  [24, 23], [28, 19], [28, 11], [28, 2.5], [34, 19], [36, 13.2, true], // 14-19 túnel
];
const wpC: [number, number][] = [[-34, 0], [0, 0], [33, 0]];
const SITES: Record<'A' | 'B', { min: PontoXZ; max: PontoXZ; centro: PontoXZ }> = {
  A: { min: { x: -30, z: -4 }, max: { x: -19, z: 4 }, centro: { x: -24.5, z: 0 } },
  B: { min: { x: 14, z: -4 }, max: { x: 25, z: 4 }, centro: { x: 19.5, z: 0 } },
};
const N = wpA.length;
const espelharId = (i: number): number => (i >= N ? i : i + N);

const arestasA: [number, number][] = [
  [0, 1], [0, 2], [1, 3], [2, 4], [3, 5], [5, 6], [5, 7], [6, 9], [9, 8],
  [3, 10], [3, 11], [4, 11], [4, 13], [10, 12], [12, 13],
  [4, 14], [14, 15], [15, 16], [16, 17], [15, 18], [18, 19],
  [9, 2 * N], [12, 2 * N + 1], [17, 2 * N + 2],
];

// ═════════════════════════════════════════════════════════════════════════════════════════════════════
// DECORAÇÃO (só visual; o sim nunca lê). Regras: detalhe de parede sai no máximo 0,12 m; o que avança mais
// fica acima de 2,6 m; adereço de chão só em canto morto, colado numa caixa; nada na faixa |z| < 0,5.
// O lado A (z > 0) e o lado B (z < 0) têm listas próprias, escritas em coordenadas de z > 0 (decoB é
// espelhada no fim); letras e placas ficam em `decoCentro`, em coordenadas reais, para não saírem invertidas.
// ═════════════════════════════════════════════════════════════════════════════════════════════════════

// Tons só da decoração.
const PORTA = 0x3b7c8c; // azul-petróleo das portas (longe do azul do time)
const PANO_CRU = 0xeee3c8;
const PANO_TERRA = 0xb5533c;
const PANO_VERDE = 0x5d8a5e;
const PANO_AMARELO = 0xe0b040;
const FERRUGEM = 0x8a4b2f;
const ESCURO = 0x2e2a26;
const VIDRO = 0x39505c;
const OLIVA = 0x58633a;
const LUZ = 0xffe9a0;
const OCRE = 0xd6ad5c;
const ROSA = 0xcfa07a;
const AMARELO_A = 0xf2c94c;
const AZUL_B = 0x56b7e6;
const PALMA = 0x4f7d3a;
const ROCHA = 0xb59a6e;
const SOMBRA = 0x8b7c55; // chão na sombra (o sol é fixo: a sombra é uma chapa escura no piso)
const TUNEL = 0x6f6f66; // pedra do túnel, já escurecida (luz ambiente por cor de vértice)

// Alturas das chapas de piso (cada camada 1 cm acima da outra para não brigar no z-buffer).
const P_ZONA = 0.01;
const P_MANCHA = 0.015;
const P_SITE = 0.02;
const P_SOMBRA = 0.03;
const P_TINTA = 0.04;

type Eixo = 'x' | 'z';
type Dir = 1 | -1;

function clarear(cor: number, k: number): number {
  const f = (v: number): number => Math.round(v + (255 - v) * k);
  return (f((cor >> 16) & 255) << 16) | (f((cor >> 8) & 255) << 8) | f(cor & 255);
}

/** Painel numa face de parede: a face fica em `eixo` = pos e o painel sai `esp` para o lado `dir`; u corre no outro eixo. */
function painel(eixo: Eixo, pos: number, dir: Dir, u0: number, u1: number, y0: number, y1: number, cor: number, esp = 0.05): Caixa {
  const a = dir > 0 ? pos : pos - esp;
  const b = dir > 0 ? pos + esp : pos;
  const [ua, ub] = u0 < u1 ? [u0, u1] : [u1, u0];
  return eixo === 'x' ? caixa(a, ua, b, ub, y1 - y0, cor, y0) : caixa(ua, a, ub, b, y1 - y0, cor, y0);
}

/** Caixa centrada em (x, z). */
function cubo(x: number, z: number, lx: number, lz: number, h: number, cor: number, y0 = 0): Caixa {
  return caixa(x - lx / 2, z - lz / 2, x + lx / 2, z + lz / 2, h, cor, y0);
}

/** Casca: recobre uma caixa de colisão com outra cor (2 cm para fora), entre y0 e y1. */
function casca(c: Caixa, cor: number, y0 = c.min.y, y1 = c.max.y, e = 0.02): Caixa {
  return { min: { x: c.min.x - e, y: y0, z: c.min.z - e }, max: { x: c.max.x + e, y: y1 + (y1 === c.max.y ? e : 0), z: c.max.z + e }, cor };
}

// Gerador determinístico (a decoração tem de sair igual em toda máquina).
function semente(s: number): () => number {
  let a = s >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Peças ────────────────────────────────────────────────────────────────────────────────────────────

/** Coroa e rodapé das paredes altas. */
function molduras(c: Caixa): Caixa[] {
  const h = c.max.y - c.min.y;
  if (h < 3.9 || c.min.y > 0) return [];
  const e = 0.12;
  return [
    { min: { x: c.min.x - e, y: c.max.y, z: c.min.z - e }, max: { x: c.max.x + e, y: c.max.y + 0.3, z: c.max.z + e }, cor: escurecer(Number(c.cor), 0.7) },
    { min: { x: c.min.x - 0.05, y: 0, z: c.min.z - 0.05 }, max: { x: c.max.x + 0.05, y: 0.45, z: c.max.z + 0.05 }, cor: escurecer(Number(c.cor), 0.72) },
  ];
}

/** Aro escuro no topo de cada caixote de madeira (vira caixote, não cubo liso). */
function aros(c: Caixa): Caixa[] {
  if (c.cor !== MADEIRA && c.cor !== MADEIRA_ESC) return [];
  return [casca(c, escurecer(Number(c.cor), 0.68), c.max.y - 0.16, c.max.y, 0.03)];
}

/** Sombra no piso: o sol vem de +x a ~53° (0,75 m de sombra por metro de altura); a projeção é um retângulo exato. */
const K_SOMBRA = 0.75;
function sombra(c: Caixa): Caixa[] {
  if (c.min.y === 0 && c.max.z - c.min.z < 0.9 && c.max.x - c.min.x > 3) return []; // parede ao longo de x: sombra fica embaixo dela
  const x0 = Math.max(-40, c.min.x - K_SOMBRA * c.max.y);
  const x1 = Math.min(40, c.min.y === 0 ? c.min.x : c.max.x - K_SOMBRA * c.min.y);
  const z0 = Math.max(0, c.min.z);
  const z1 = Math.min(30, c.max.z);
  if (x1 - x0 < 0.25 || z1 - z0 < 0.25) return [];
  return [caixa(x0, z0, x1, z1, P_SOMBRA, SOMBRA)];
}

/** Janela de adobe fechada: moldura clara e veneziana de madeira pintada. */
function veneziana(eixo: Eixo, pos: number, dir: Dir, u: number, cor: number, y0 = 1.65, larg = 1.1, alt = 1.3, base = 0): Caixa[] {
  return [
    painel(eixo, pos, dir, u - larg / 2 - 0.12, u + larg / 2 + 0.12, y0 - 0.12, y0 + alt + 0.12, GESSO, base + 0.06),
    painel(eixo, pos, dir, u - larg / 2, u + larg / 2, y0, y0 + alt, cor, base + 0.1),
  ];
}

/** Vigas de madeira saindo da parede (acima de 2,6 m). */
function vigas(eixo: Eixo, pos: number, dir: Dir, us: number[], y = 3.3): Caixa[] {
  return us.map((u) => painel(eixo, pos, dir, u - 0.09, u + 0.09, y, y + 0.18, MADEIRA_ESC, 0.45));
}

/** Folha de porta de tábuas, deitada contra a parede (8 cm), com duas travessas. */
function porta(eixo: Eixo, pos: number, dir: Dir, u0: number, u1: number, h: number, cor = PORTA): Caixa[] {
  const esc = escurecer(cor, 0.7);
  return [
    painel(eixo, pos, dir, u0, u1, 0, h, cor, 0.07),
    painel(eixo, pos, dir, u0, u1, 0.45, 0.65, esc, 0.1),
    painel(eixo, pos, dir, u0, u1, h - 0.7, h - 0.5, esc, 0.1),
  ];
}

function barril(x: number, z: number, cor = FERRUGEM): Caixa[] {
  return [cubo(x, z, 0.6, 0.6, 0.9, cor), cubo(x, z, 0.65, 0.65, 0.12, escurecer(cor, 0.65), 0.5)];
}

function caixote(x: number, z: number, l: number, h: number, cor = MADEIRA, y0 = 0): Caixa[] {
  return [cubo(x, z, l, l, h, cor, y0), cubo(x, z, l + 0.06, l + 0.06, 0.12, escurecer(cor, 0.68), y0 + h - 0.12)];
}

/** Pilha de paletes (estrado claro sobre calços escuros). */
function paletes(x0: number, z0: number, x1: number, z1: number, n: number): Caixa[] {
  const r: Caixa[] = [];
  for (let i = 0; i < n; i++) {
    r.push(caixa(x0 + 0.08, z0 + 0.08, x1 - 0.08, z1 - 0.08, 0.1, MADEIRA_ESC, i * 0.2));
    r.push(caixa(x0, z0, x1, z1, 0.1, 0xb98f5a, i * 0.2 + 0.1));
  }
  return r;
}

/** Sacos de areia ao longo de x, em duas fiadas desencontradas. */
function sacos(x0: number, z0: number, z1: number, n: number): Caixa[] {
  const r: Caixa[] = [];
  for (let i = 0; i < n; i++) r.push(caixa(x0 + i * 0.85, z0, x0 + i * 0.85 + 0.8, z1, 0.3, i % 2 ? 0xb9a878 : 0xa8966a));
  for (let i = 0; i < n - 1; i++) r.push(caixa(x0 + 0.42 + i * 0.85, z0, x0 + 1.22 + i * 0.85, z1 - 0.06, 0.28, i % 2 ? 0xa8966a : 0xb9a878, 0.3));
  return r;
}

/** Toldo de pano em balanço (acima de 2,6 m): tiras de duas cores ao longo de u, com saia na frente. */
function toldo(eixo: Eixo, pos: number, dir: Dir, u0: number, u1: number, tiras: number, sai: number, y: number, c1: number, c2: number): Caixa[] {
  const r: Caixa[] = [];
  const du = (u1 - u0) / tiras;
  for (let i = 0; i < tiras; i++) r.push(painel(eixo, pos, dir, u0 + i * du, u0 + (i + 1) * du, y, y + 0.08, i % 2 ? c2 : c1, sai));
  r.push(painel(eixo, pos + dir * sai, dir, u0, u1, y - 0.26, y + 0.08, c1, 0.06)); // saia
  r.push(painel(eixo, pos, dir, u0 - 0.08, u0 + 0.04, y - 0.12, y, MADEIRA_ESC, sai)); // caibros
  r.push(painel(eixo, pos, dir, u1 - 0.04, u1 + 0.08, y - 0.12, y, MADEIRA_ESC, sai));
  return r;
}

/** Lâmpada pendurada: soquete escuro e bulbo claro, com o pé a 2,62 m ou mais. */
function lampada(x: number, z: number, yTeto: number): Caixa[] {
  return [cubo(x, z, 0.08, 0.08, yTeto - 2.9, ESCURO, 2.9), cubo(x, z, 0.3, 0.3, 0.26, LUZ, 2.64)];
}

/** Lampião de parede (acima de 2,6 m). */
function lampiao(eixo: Eixo, pos: number, dir: Dir, u: number): Caixa[] {
  return [
    painel(eixo, pos, dir, u - 0.05, u + 0.05, 3.3, 3.4, ESCURO, 0.6),
    painel(eixo, pos + dir * 0.42, dir, u - 0.14, u + 0.14, 2.95, 3.3, LUZ, 0.28),
  ];
}

// Letras em blocos: traços [s0, t0, s1, t1] numa grade 1×1 (s para a direita de quem olha, t para cima).
const TRACOS: Record<'A' | 'B', [number, number, number, number][]> = {
  A: [[0, 0, 0.26, 0.82], [0.74, 0, 1, 0.82], [0.1, 0.78, 0.9, 1], [0.26, 0.34, 0.74, 0.52]],
  B: [[0, 0, 0.26, 1], [0.26, 0.82, 0.82, 1], [0.26, 0.41, 0.82, 0.59], [0.26, 0, 0.82, 0.18], [0.74, 0.55, 1, 0.9], [0.74, 0.1, 1, 0.45]],
};
/** Sinal de u para a direita de quem olha a face de frente. */
const direita = (eixo: Eixo, dir: Dir): number => (eixo === 'x' ? -dir : dir);

function letra(ch: 'A' | 'B', eixo: Eixo, pos: number, dir: Dir, uc: number, y0: number, larg: number, alt: number, cor: number, esp = 0.05): Caixa[] {
  const r = direita(eixo, dir);
  return TRACOS[ch].map(([s0, t0, s1, t1]) =>
    painel(eixo, pos, dir, uc + r * (s0 - 0.5) * larg, uc + r * (s1 - 0.5) * larg, y0 + t0 * alt, y0 + t1 * alt, cor, esp));
}

/** Seta pintada (haste e ponta em dois degraus); `sentido` +1 aponta para a direita de quem olha. */
function seta(eixo: Eixo, pos: number, dir: Dir, uc: number, yc: number, comp: number, sentido: number, cor: number, esp = 0.05): Caixa[] {
  const r = direita(eixo, dir) * sentido;
  const p = (s0: number, s1: number, meia: number): Caixa => painel(eixo, pos, dir, uc + r * s0 * comp, uc + r * s1 * comp, yc - meia, yc + meia, cor, esp);
  return [p(-0.5, 0.15, 0.1), p(0.15, 0.34, 0.3), p(0.34, 0.5, 0.14)];
}

/** Placa alta com a letra do site nas duas faces, em cima da verga de um arco (tudo acima de 3,9 m). */
function placaDoSite(ch: 'A' | 'B', x0: number, x1: number, corPlaca: number): Caixa[] {
  const xm = (x0 + x1) / 2;
  return [
    caixa(xm - 0.12, -1.9, xm + 0.12, 1.9, 2.5, corPlaca, 4.15),
    caixa(xm - 0.18, -2.05, xm + 0.18, 2.05, 0.18, ESCURO, 6.65),
    caixa(xm - 0.1, -1.7, xm + 0.1, -1.5, 0.25, ESCURO, 3.9),
    caixa(xm - 0.1, 1.5, xm + 0.1, 1.7, 0.25, ESCURO, 3.9),
    ...letra(ch, 'x', xm + 0.12, 1, 0, 4.45, 1.7, 1.95, ESCURO, 0.05),
    ...letra(ch, 'x', xm - 0.12, -1, 0, 4.45, 1.7, 1.95, ESCURO, 0.05),
  ];
}

/** Palmeira atrás do muro: só a copa aparece por cima. */
function palmeira(x: number, z: number, h: number): Caixa[] {
  return [
    cubo(x, z, 0.45, 0.45, h, 0x8a6b45),
    cubo(x, z, 3.4, 0.7, 0.3, PALMA, h),
    cubo(x, z, 0.7, 3.4, 0.3, escurecer(PALMA, 0.85), h - 0.05),
    cubo(x, z, 1.5, 1.5, 0.5, PALMA, h + 0.25),
  ];
}

// Fachada: transforma um trecho do muro externo numa casa (reboco sobre a base de pedra, andar de cima atrás
// do muro e janelas). `andar` é a altura acima do muro; 0 deixa só o muro, com o horizonte aparecendo.
interface Fachada { u0: number; u1: number; cor: number; andar?: number; jan?: number; venez?: number[]; corVenez?: number }
function fachada(eixo: Eixo, pos: number, dir: Dir, f: Fachada, rnd: () => number): Caixa[] {
  const r: Caixa[] = [painel(eixo, pos, dir, f.u0, f.u1, 0.45, 4, f.cor, 0.04)];
  // gesso caído: uma mancha de tijolo ou de reboco velho por trecho
  const lm = 0.9 + rnd() * 1.4;
  const um = f.u0 + 0.6 + rnd() * Math.max(0.1, f.u1 - f.u0 - lm - 1.2);
  const ym = 0.5 + rnd() * 1.6;
  r.push(painel(eixo, pos, dir, um, um + lm, ym, ym + 0.5 + rnd() * 0.9, rnd() < 0.5 ? TIJOLO : escurecer(f.cor, 0.86), 0.055));
  for (const u of f.venez ?? []) r.push(...veneziana(eixo, pos, dir, u, f.corVenez ?? PORTA, 1.65, 1.1, 1.3, 0.04));
  if (f.andar) {
    const fora = pos - dir * 8;
    const dentro = pos + dir * 0.04;
    const cor = escurecer(f.cor, 0.96);
    r.push(eixo === 'x'
      ? caixa(Math.min(fora, dentro), f.u0, Math.max(fora, dentro), f.u1, f.andar, cor, 4)
      : caixa(f.u0, Math.min(fora, dentro), f.u1, Math.max(fora, dentro), f.andar, cor, 4));
    const n = f.jan ?? 0;
    for (let i = 0; i < n; i++) {
      const u = f.u0 + ((i + 0.5) * (f.u1 - f.u0)) / n;
      r.push(painel(eixo, dentro, dir, u - 0.55, u + 0.55, 4.9, Math.min(6.2, 4 + f.andar - 0.5), ESCURO, 0.05));
    }
  }
  return r;
}

/** Manchas nas paredes internas: gesso caído, tijolo à mostra e reboco de outra cor (2,5 cm). */
function manchas(paredes: Caixa[], rnd: () => number): Caixa[] {
  const r: Caixa[] = [];
  for (const c of paredes) {
    if (c.max.y - c.min.y < 3.9 || c.min.y > 0 || c.cor === PEDRA) continue;
    const aoLongoDeX = c.max.x - c.min.x > c.max.z - c.min.z;
    const [u0, u1] = aoLongoDeX ? [c.min.x, c.max.x] : [c.min.z, c.max.z];
    const tons = c.cor === ADOBE ? [GESSO, TIJOLO, escurecer(ADOBE, 0.85)] : [ADOBE, clarear(AREIA, 0.35), TIJOLO];
    for (const dir of [1, -1] as Dir[]) {
      const pos = aoLongoDeX ? (dir > 0 ? c.max.z : c.min.z) : (dir > 0 ? c.max.x : c.min.x);
      for (let u = u0 + 0.8; u < u1 - 2.2; u += 4.2) {
        const l = 0.8 + rnd() * 1.5;
        const y = 0.5 + rnd() * 1.9;
        const uu = u + rnd() * 1.6;
        r.push(painel(aoLongoDeX ? 'z' : 'x', pos, dir, uu, Math.min(u1 - 0.2, uu + l), y, y + 0.45 + rnd() * 0.9, tons[Math.floor(rnd() * 3)]!, 0.025));
      }
    }
  }
  return r;
}

/** Manchas de piso: lajes um pouco mais claras ou escuras, espalhadas. */
function lajes(n: number, rnd: () => number): Caixa[] {
  const r: Caixa[] = [];
  for (let i = 0; i < n; i++) {
    const x = -38 + rnd() * 74;
    const z = 1.5 + rnd() * 26;
    r.push(caixa(x, z, x + 1.2 + rnd() * 2.2, z + 1 + rnd() * 1.8, P_MANCHA, rnd() < 0.5 ? 0xbca672 : 0xd3bf8a));
  }
  return r;
}

// ── Achados nas caixas de colisão (para vestir sem repetir coordenadas) ─────────────────────────────
const achar = (x0: number, z0: number): Caixa => {
  const c = ladoA.find((k) => k.min.x === x0 && k.min.z === z0 && k.min.y === 0);
  if (!c) throw new Error(`caixa (${x0}, ${z0}) não existe`);
  return c;
};
const CONTAINER_LONGA = achar(-40, 11.5);
const CONTAINER_B = achar(20.5, 4.8);
const CARRO = achar(-28, 4.8);
const XBOX = achar(-1.5, 14);

/** Cintas e trancas de container. */
function cintas(c: Caixa, cor: number, portaEm: 'x+' | 'x-'): Caixa[] {
  const esc = escurecer(cor, 0.7);
  const xp = portaEm === 'x+' ? c.max.x : c.min.x;
  const d: Dir = portaEm === 'x+' ? 1 : -1;
  const zm = (c.min.z + c.max.z) / 2;
  return [
    casca(c, esc, 0.25, 0.4, 0.04),
    casca(c, esc, c.max.y - 0.35, c.max.y - 0.2, 0.04),
    painel('x', xp, d, zm - 0.3, zm - 0.2, 0.3, c.max.y - 0.3, FERRO_CLARO, 0.07),
    painel('x', xp, d, zm + 0.2, zm + 0.3, 0.3, c.max.y - 0.3, FERRO_CLARO, 0.07),
  ];
}

// ── Comum aos dois lados (funcional: molduras, pisos, portais, túnel) ───────────────────────────────
const comum: Caixa[] = [
  ...ladoA.flatMap(molduras),
  ...ladoA.flatMap(aros),
  // piso por zona
  caixa(-12, 19, 12, 30, P_ZONA, 0xb79f6c), // base
  caixa(-40, 0, -33, 16.6, P_ZONA, 0xb8a06e), // Longa
  caixa(-7, 0, 7, 14, P_ZONA, 0xcdb87f), // meio
  caixa(25.5, 4, 31, 21, P_ZONA, 0x9d8b61), // túnel
  // portão da Longa: batentes e travessa de madeira (a travessa fica a 2,68 m)
  painel('x', -37.6, 1, 16.6, 17.4, 0, 2.68, MADEIRA_ESC, 0.1),
  painel('x', -33, -1, 16.6, 17.4, 0, 2.68, MADEIRA_ESC, 0.1),
  caixa(-37.6, 16.52, -33, 17.48, 0.12, MADEIRA_ESC, 2.68),
  // portas do meio: batentes, verga de madeira por cima do vão e lâmpada pendurada nela
  painel('x', -1.6, 1, 7.14, 7.86, 0, 3.1, MADEIRA_ESC, 0.1),
  painel('x', 1.6, -1, 7.14, 7.86, 0, 3.1, MADEIRA_ESC, 0.1),
  caixa(-1.8, 7.1, 1.8, 7.9, 0.4, MADEIRA_ESC, 3.1),
  ...lampada(0, 7.5, 3.1),
  // túnel: forro escuro (luz ambiente por cor), três arcos de pedra, duas lâmpadas com poça de luz no piso
  painel('x', 25.5, 1, 4, 9, 0.45, 3, TUNEL, 0.03),
  painel('x', 25.5, 1, 12, 16, 0.45, 3, TUNEL, 0.03),
  painel('x', 31, -1, 4, 14, 0.45, 3, TUNEL, 0.03),
  caixa(26, 4, 31, 16, 0.03, escurecer(TUNEL, 0.8), 2.97),
  ...[4.3, 8.4, 13.2].flatMap((z) => [
    painel('x', 25.5, 1, z, z + 0.5, 0, 2.72, PEDRA, 0.12),
    painel('x', 31, -1, z, z + 0.5, 0, 2.72, PEDRA, 0.12),
    caixa(25.5, z, 31, z + 0.5, 0.28, PEDRA, 2.72),
  ]),
  ...lampada(28.5, 6.4, 2.97), cubo(28.5, 6.4, 2.6, 2.6, P_TINTA, 0xc9b27c),
  ...lampada(28.5, 11, 2.97), cubo(28.5, 11, 2.6, 2.6, P_TINTA, 0xc9b27c),
  // janela do B: moldura de madeira do lado do site e peitoril
  painel('x', 25, -1, 8.8, 12.2, 2.95, 3.2, MADEIRA_ESC, 0.1),
  painel('x', 25, -1, 8.8, 9, 1.3, 2.95, MADEIRA_ESC, 0.08),
  painel('x', 25, -1, 12, 12.2, 1.3, 2.95, MADEIRA_ESC, 0.08),
  painel('x', 25, -1, 8.8, 12.2, 1.2, 1.32, MADEIRA, 0.12),
  // arcos dos sites: aduela clara nos pilares
  painel('x', -31, 1, 1.2, 2.4, 2.5, 2.9, clarear(PEDRA, 0.25), 0.06),
  painel('x', 27.2, 1, 1.2, 2.4, 2.5, 2.9, clarear(PEDRA, 0.25), 0.06),
  painel('x', -32.2, -1, 1.2, 2.4, 2.5, 2.9, clarear(PEDRA, 0.25), 0.06),
  painel('x', 26, -1, 1.2, 2.4, 2.5, 2.9, clarear(PEDRA, 0.25), 0.06),
];

// ── Lado A (z > 0): acampamento e mercado, panos terracota e amarelo ────────────────────────────────
const toldosA: Caixa[] = [
  ...toldo('z', 30, -1, -6, 6, 6, 3.4, 3.2, PANO_TERRA, PANO_CRU), // base
  ...toldo('x', -32.5, 1, 8, 12, 4, 1.7, 2.95, PANO_AMARELO, PANO_CRU), // banca do site A
  ...toldo('z', 30, -1, -29, -23, 3, 1.7, 2.95, PANO_AMARELO, PANO_TERRA), // banca da lateral
];
const fachadasA: Caixa[] = (() => {
  const rnd = semente(11);
  const norte: Fachada[] = [
    { u0: -40, u1: -30, cor: ADOBE, andar: 3.2, jan: 2, venez: [-33.5] },
    { u0: -30, u1: -22, cor: GESSO },
    { u0: -22, u1: -12, cor: AREIA, andar: 5.6, jan: 2 },
    { u0: -12, u1: 12, cor: GESSO, andar: 2.7, jan: 4 },
    { u0: 12, u1: 22, cor: ADOBE, andar: 4.4, jan: 2, venez: [16.5], corVenez: PANO_VERDE },
    { u0: 22, u1: 31, cor: AREIA },
    { u0: 31, u1: 40, cor: GESSO, andar: 3, jan: 2 },
  ];
  const oeste: Fachada[] = [
    { u0: 0, u1: 8, cor: AREIA, andar: 2.8, jan: 2 },
    { u0: 8, u1: 17, cor: ADOBE },
    { u0: 17, u1: 30, cor: GESSO, andar: 4, jan: 2, venez: [21.5, 26], corVenez: PANO_TERRA },
  ];
  const leste: Fachada[] = [
    { u0: 0, u1: 13, cor: AREIA, andar: 3.5, jan: 2 },
    { u0: 13, u1: 22, cor: ROSA },
    { u0: 22, u1: 30, cor: ADOBE, andar: 5, jan: 2 },
  ];
  return [
    ...norte.flatMap((f) => fachada('z', 30, -1, f, rnd)),
    ...oeste.flatMap((f) => fachada('x', -40, 1, f, rnd)),
    ...leste.flatMap((f) => fachada('x', 40, -1, f, rnd)),
  ];
})();

const decoA: Caixa[] = [
  ...comum,
  ...fachadasA,
  ...manchas(ladoA, semente(3)),
  ...lajes(9, semente(5)),
  ...[...ladoA, ...toldosA.slice(0, 6)].flatMap(sombra),
  caixa(37, 0, 40, 30, P_SOMBRA, SOMBRA), // sombra do muro leste
  ...toldosA,

  // Base: toldo de pano, sacos de areia, mesa com mapa, barris, munição, mastro (o pano da bandeira é do render)
  ...sacos(-6.3, 19.5, 19.95, 5),
  caixa(-11.5, 23.2, -10.7, 25, 0.08, MADEIRA, 0.82),
  caixa(-11.45, 23.3, -10.8, 23.42, 0.82, MADEIRA_ESC),
  caixa(-11.45, 24.78, -10.8, 24.9, 0.82, MADEIRA_ESC),
  caixa(-11.35, 23.6, -10.85, 24.4, 0.02, PANO_CRU, 0.9),
  ...barril(11.0, 29.45), ...barril(10.25, 29.5, 0x4a6a7a), ...barril(11.05, 28.7, PANO_TERRA),
  caixa(-7.85, 27.2, -7.3, 27.55, 0.22, OLIVA, 1.2),
  caixa(7.2, 27.4, 7.8, 27.8, 0.22, OLIVA, 1.2),
  caixa(-8.78, 19.17, -8.62, 19.33, 3.4, MADEIRA_ESC, 4.3),
  painel('z', 19, -1, -9, 9, 1.0, 1.22, PANO_TERRA, 0.03),
  ...veneziana('z', 19, -1, -5.5, PORTA), ...veneziana('z', 19, -1, 5.5, PORTA),
  ...vigas('z', 19, -1, [-8, -5.5, -3, 3, 5.5, 8]),
  ...veneziana('x', -12, -1, 25.5, PANO_TERRA), ...vigas('x', -12, -1, [22.5, 28.5]),
  ...veneziana('x', 12, 1, 24, PANO_TERRA), ...lampiao('x', 12, 1, 27.5),

  // Longa A: portão de portas azuis, janelas e vigas, faixa de pano, ruína com entulho, barris
  ...porta('z', 17.4, 1, -39.95, -37.7, 2.68),
  ...porta('x', -33, -1, 14.3, 16.55, 2.68),
  ...vigas('x', -33, -1, [4.5, 7.5, 10.5, 13.5]),
  ...veneziana('x', -33, -1, 6, PORTA), ...veneziana('x', -33, -1, 12, PORTA),
  painel('x', -33, -1, 8.6, 9.4, 1.3, 3.2, PANO_TERRA, 0.05), painel('x', -33, -1, 8.5, 9.5, 3.2, 3.3, MADEIRA_ESC, 0.1),
  caixa(-40, 13.5, -39.1, 14.4, 0.5, TIJOLO), caixa(-39.9, 13.55, -39.4, 14.05, 0.35, ADOBE, 0.5),
  caixa(-39.1, 13.5, -38.65, 13.95, 0.25, ADOBE), caixa(-40, 14.4, -39.5, 15, 0.3, TIJOLO),
  painel('x', -40, 1, 13.6, 16.3, 0.45, 1.5, TIJOLO, 0.07), painel('x', -40, 1, 14.2, 16, 1.5, 2.4, TIJOLO, 0.07),
  painel('x', -40, 1, 14.9, 15.7, 2.4, 3, TIJOLO, 0.07),
  caixa(-42, 8, -39.96, 11, 1.7, escurecer(ADOBE, 0.9), 4), caixa(-42, 11, -39.96, 13, 0.8, escurecer(ADOBE, 0.9), 4),
  caixa(-42, 14.6, -39.96, 17, 2.6, escurecer(ADOBE, 0.9), 4),
  ...barril(-39.65, 9), ...barril(-39.65, 9.75, 0x4a6a7a),
  ...cintas(CONTAINER_LONGA, AZUL, 'x+'),

  // Site A: carro vermelho, banca com caixas de munição, barris pintados
  casca(CARRO, 0xa6452f, 0.3, 1),
  painel('z', 6.6, 1, -27.5, -26.7, 0, 0.6, ESCURO, 0.06), painel('z', 6.6, 1, -25.3, -24.5, 0, 0.6, ESCURO, 0.06),
  painel('z', 4.8, -1, -27.5, -26.7, 0, 0.6, ESCURO, 0.06), painel('z', 4.8, -1, -25.3, -24.5, 0, 0.6, ESCURO, 0.06),
  painel('z', 6.4, 1, -27, -25, 1.12, 1.5, VIDRO, 0.03), painel('z', 5, -1, -27, -25, 1.12, 1.5, VIDRO, 0.03),
  painel('x', -27.2, -1, 5.15, 6.25, 1.12, 1.5, VIDRO, 0.03), painel('x', -24.8, 1, 5.15, 6.25, 1.12, 1.5, VIDRO, 0.03),
  painel('x', -28, -1, 5, 5.35, 0.6, 0.8, LUZ, 0.04), painel('x', -28, -1, 6.05, 6.4, 0.6, 0.8, LUZ, 0.04),
  caixa(-32.5, 8.3, -31.8, 9.3, 0.42, OLIVA), caixa(-32.45, 8.4, -31.9, 9.15, 0.36, escurecer(OLIVA, 0.85), 0.42),
  painel('x', -31.8, 1, 8.3, 9.3, 0.16, 0.26, AMARELO_A, 0.02),
  ...caixote(-32.05, 10.4, 0.9, 0.7), caixa(-32.4, 10.05, -31.7, 10.75, 0.12, 0xd9772b, 0.7),
  casca(achar(-18.2, 5), PANO_TERRA), casca(achar(-17.4, 5.4), 0x4a6a7a),

  // Meio: portas azuis abertas contra a parede, varal de bandeirinhas, lixeira, caixote em cima do xbox, vasos
  ...porta('z', 7.8, 1, 1.7, 3.2, 3), ...porta('z', 7.8, 1, -3.2, -1.7, 3),
  caixa(-4.52, 7.8, -4.48, 19, 0.03, ESCURO, 3.8),
  ...[9, 10.4, 11.8, 13.2, 14.6, 16, 17.4].map((z, i) => caixa(-4.52, z, -4.48, z + 0.4, 0.38, [PANO_TERRA, PANO_CRU, PANO_AMARELO, PANO_VERDE][i % 4]!, 3.42)),
  caixa(4.2, 7.8, 5.9, 8.65, 1.05, 0x3f5d49), caixa(4.15, 7.8, 5.95, 8.7, 0.1, 0x55785f, 1.05),
  ...cintas(XBOX, VERDE, 'x+').slice(0, 2), ...caixote(0.4, 15.1, 1, 0.75, MADEIRA, 2),
  casca(achar(-10, 4), escurecer(AREIA, 0.75), 1.85, 2, 0.08), casca(achar(8, 4), escurecer(AREIA, 0.75), 1.85, 2, 0.08),
  cubo(-9.4, 4.6, 0.5, 0.5, 0.35, TIJOLO, 2.02), cubo(-9.4, 4.6, 0.7, 0.7, 0.45, PALMA, 2.37),
  cubo(-8.6, 5.4, 0.4, 0.4, 0.3, TIJOLO, 2.02), cubo(-8.6, 5.4, 0.5, 0.5, 0.3, escurecer(PALMA, 0.85), 2.32),

  // Túnel: cano enferrujado com descida e ralo no piso
  painel('x', 31, -1, 4, 14, 2.3, 2.42, FERRUGEM, 0.1), painel('x', 31, -1, 13.6, 13.72, 0, 2.3, FERRUGEM, 0.1),
  painel('x', 31, -1, 6.9, 7.05, 2.26, 2.46, ESCURO, 0.12), painel('x', 31, -1, 10.4, 10.55, 2.26, 2.46, ESCURO, 0.12),
  caixa(29.6, 14.4, 30.5, 15.2, P_TINTA, ESCURO), caixa(29.6, 14.62, 30.5, 14.7, 0.045, FERRO), caixa(29.6, 14.9, 30.5, 14.98, 0.045, FERRO),

  // Site B: container verde com cintas, caixote em cima, paletes e munição contra a parede do túnel
  ...cintas(CONTAINER_B, VERDE, 'x-'), ...caixote(21.6, 5.7, 1, 0.6, MADEIRA, 2.4),
  ...paletes(24.05, 13.6, 25, 14.9, 3),
  caixa(24.4, 15.3, 25, 16.3, 0.4, OLIVA), caixa(24.45, 15.4, 24.95, 16.1, 0.34, escurecer(OLIVA, 0.85), 0.4),
  painel('x', 25, -1, 4, 21, 3.4, 3.65, AZUL_B, 0.03),

  // Laterais: banca de frutas na parede norte, tralha no canto, lampiões
  ...caixote(-28, 29.5, 0.9, 0.6), cubo(-28, 29.5, 0.7, 0.7, 0.14, 0xd9772b, 0.6),
  ...caixote(-26.8, 29.5, 0.9, 0.6), cubo(-26.8, 29.5, 0.7, 0.7, 0.14, 0x7fa650, 0.6),
  ...caixote(-25, 29.55, 0.8, 0.9), cubo(-25, 29.55, 0.6, 0.6, 0.14, 0xb5352f, 0.9),
  ...barril(39.6, 29.6), ...barril(38.9, 29.6, OLIVA), ...paletes(38.9, 27.9, 40, 28.9, 2),
  ...lampiao('z', 30, -1, -17), ...lampiao('z', 30, -1, 26.5), ...lampiao('x', 40, -1, 17.5),
  casca(achar(-30, 24), escurecer(AREIA, 0.75), 1.88, 2, 0.06), casca(achar(20, 24), escurecer(AREIA, 0.75), 1.08, 1.2, 0.06),
];

// ── Lado B (z < 0), escrito em coordenadas de z > 0 e espelhado: posto e oficina, panos verdes ───────
const toldosB: Caixa[] = [
  ...toldo('z', 30, -1, -10, -2, 4, 3, 3.1, PANO_VERDE, PANO_CRU), // base, fora de centro
  ...toldo('x', 25, -1, 16.5, 20, 3, 1.6, 2.95, PANO_VERDE, PANO_CRU), // banca do site B
];
const fachadasB: Caixa[] = (() => {
  const rnd = semente(29);
  const sul: Fachada[] = [
    { u0: -40, u1: -33, cor: GESSO, andar: 4.6, jan: 2 },
    { u0: -33, u1: -24, cor: OCRE, andar: 2.6, jan: 2, venez: [-28.5], corVenez: PANO_VERDE },
    { u0: -24, u1: -12, cor: ADOBE },
    { u0: -12, u1: 12, cor: AREIA, andar: 4, jan: 5 },
    { u0: 12, u1: 20, cor: GESSO },
    { u0: 20, u1: 30, cor: ROSA, andar: 5.6, jan: 2 },
    { u0: 30, u1: 40, cor: ADOBE, andar: 2.8, jan: 2, venez: [35], corVenez: PORTA },
  ];
  const oeste: Fachada[] = [
    { u0: 0, u1: 10, cor: OCRE },
    { u0: 10, u1: 20, cor: GESSO, andar: 5, jan: 2, venez: [13], corVenez: PANO_VERDE },
    { u0: 20, u1: 30, cor: ADOBE, andar: 3, jan: 2 },
  ];
  const leste: Fachada[] = [
    { u0: 0, u1: 9, cor: ADOBE },
    { u0: 9, u1: 20, cor: AREIA, andar: 4.2, jan: 2 },
    { u0: 20, u1: 30, cor: GESSO, andar: 2.6, jan: 2 },
  ];
  return [
    ...sul.flatMap((f) => fachada('z', 30, -1, f, rnd)),
    ...oeste.flatMap((f) => fachada('x', -40, 1, f, rnd)),
    ...leste.flatMap((f) => fachada('x', 40, -1, f, rnd)),
  ];
})();

const decoB: Caixa[] = [
  ...comum,
  ...fachadasB,
  ...manchas(ladoA, semente(71)),
  ...lajes(9, semente(13)),
  ...[...ladoA, ...toldosB.slice(0, 4)].flatMap(sombra),
  caixa(37, 0, 40, 30, P_SOMBRA, SOMBRA),
  ...toldosB,

  // Base: toldo verde fora de centro, paletes, barris, antena de rádio, porta fechada na fachada
  ...paletes(9.8, 28.3, 11.4, 29.8, 3),
  ...barril(11.1, 22.5, 0x4a6a7a), ...barril(11.1, 23.25, 0x4a6a7a), ...barril(11.1, 24.2, OLIVA),
  caixa(3.92, 30.17, 4.08, 30.33, 4.2, FERRO, 4.3), caixa(3.4, 30.2, 4.6, 30.3, 0.08, FERRO, 7.6), caixa(3.6, 30.2, 4.4, 30.3, 0.08, FERRO, 8.1),
  caixa(7.15, 27.2, 7.85, 27.7, 0.3, FERRO, 1.2), caixa(7.25, 27.3, 7.4, 27.45, 0.5, ESCURO, 1.5),
  caixa(8.62, 19.17, 8.78, 19.33, 3.4, MADEIRA_ESC, 4.3),
  painel('z', 19, -1, -9, 9, 1.0, 1.22, PANO_VERDE, 0.03),
  ...veneziana('z', 19, -1, -4.5, PANO_VERDE), ...porta('z', 19, -1, 3.2, 4.5, 2.4, PANO_VERDE),
  ...vigas('z', 19, -1, [-7, -3.5, 0, 3.5, 7]),
  ...veneziana('x', 12, 1, 26, PANO_VERDE), ...vigas('x', 12, 1, [22.5, 24.5]),
  ...lampiao('x', -12, -1, 24),

  // Longa: uma folha só no portão (a outra virou tapume), varais de roupa, banca de frutas, container ferrugem
  ...porta('z', 17.4, 1, -39.95, -37.7, 2.68),
  painel('x', -33, -1, 14.6, 16.4, 0.9, 1.15, MADEIRA, 0.08), painel('x', -33, -1, 14.8, 16.5, 1.7, 1.95, MADEIRA, 0.08),
  ...vigas('x', -33, -1, [5, 9, 13]),
  ...veneziana('x', -33, -1, 10, PANO_VERDE),
  painel('x', -33, -1, 5.6, 6.5, 1.4, 2.5, PANO_CRU, 0.03), painel('x', -33, -1, 6.7, 7.4, 1.6, 2.4, 0xc86b4a, 0.03),
  caixa(-40, 9.98, -33, 10.02, 0.03, ESCURO, 3.55),
  ...[-39, -37.7, -36.3, -35.1, -34].map((x, i) => caixa(x, 9.98, x + [0.8, 0.6, 0.9, 0.5, 0.7][i]!, 10.02, [0.75, 0.6, 0.8, 0.55, 0.7][i]!, [PANO_CRU, 0x6d8fb0, PANO_TERRA, PANO_CRU, PANO_AMARELO][i]!, 3.55 - [0.75, 0.6, 0.8, 0.55, 0.7][i]!)),
  caixa(-40, 4.98, -33, 5.02, 0.03, ESCURO, 3.4),
  ...[-38.6, -37.2, -35.6].map((x, i) => caixa(x, 4.98, x + 0.8, 5.02, 0.7, [PANO_VERDE, PANO_CRU, 0xc86b4a][i]!, 2.7)),
  ...caixote(-39.5, 8.7, 0.9, 0.6), cubo(-39.5, 8.7, 0.7, 0.7, 0.14, 0x7fa650, 0.6),
  ...caixote(-39.5, 9.7, 0.9, 0.6), cubo(-39.5, 9.7, 0.7, 0.7, 0.14, 0xd9772b, 0.6),
  casca(CONTAINER_LONGA, FERRUGEM), ...cintas(CONTAINER_LONGA, FERRUGEM, 'x+'),

  // Site A (metade sul): carro sucateado sobre tijolos com o capô aberto, pneus
  casca(CARRO, 0x7d5a40, 0.3, 1),
  painel('z', 6.6, 1, -27.4, -26.9, 0, 0.3, TIJOLO, 0.06), painel('z', 6.6, 1, -25.1, -24.6, 0, 0.3, TIJOLO, 0.06),
  painel('z', 6.4, 1, -27, -25, 1.12, 1.5, ESCURO, 0.03), painel('x', -27.2, -1, 5.15, 6.25, 1.12, 1.5, ESCURO, 0.03),
  caixa(-27.9, 5, -27.8, 6.4, 0.75, 0x7d5a40, 1),
  caixa(-32.5, 9, -31.8, 9.7, 0.24, ESCURO), caixa(-32.45, 9.05, -31.75, 9.75, 0.24, 0x3a3632, 0.24), caixa(-32.5, 9, -31.8, 9.7, 0.24, ESCURO, 0.48),
  caixa(-32.5, 10, -31.8, 10.7, 0.24, 0x3a3632),

  // Meio: uma folha aberta para o centro e tapume na outra, fio de lâmpadas, lona no xbox, cartazes
  ...porta('z', 7.2, -1, 1.7, 3.2, 3),
  painel('z', 7.8, 1, -3.3, -1.75, 1, 1.25, MADEIRA, 0.08), painel('z', 7.8, 1, -3.1, -1.7, 1.9, 2.15, MADEIRA, 0.08),
  caixa(4.48, 7.8, 4.52, 19, 0.03, ESCURO, 3.8),
  ...[9.2, 11, 12.8, 14.6, 16.4, 18].map((z) => caixa(4.42, z, 4.58, z + 0.16, 0.2, LUZ, 3.58)),
  casca(XBOX, 0xb9a878, 1.3, 2, 0.05), casca(XBOX, MADEIRA_ESC, 1.2, 1.3, 0.07),
  casca(achar(-10, 4), escurecer(AREIA, 0.75), 1.85, 2, 0.08), casca(achar(8, 4), escurecer(AREIA, 0.75), 1.85, 2, 0.08),
  ...caixote(9, 5, 0.9, 0.6, MADEIRA, 2.02),
  painel('z', 7.8, 1, 4.2, 5, 1.5, 2.6, PANO_CRU, 0.03), painel('z', 7.8, 1, 5.2, 5.9, 1.7, 2.5, 0xc86b4a, 0.03), painel('z', 7.8, 1, 6.05, 6.6, 1.5, 2.2, 0x6d8fb0, 0.03),

  // Túnel: fio, caixa de luz e grade de ventilação
  painel('x', 25.5, 1, 4, 9, 2.45, 2.5, ESCURO, 0.06), painel('x', 25.5, 1, 5.6, 6.1, 1.5, 2.2, FERRO, 0.1),
  painel('x', 31, -1, 9.4, 10.6, 1.2, 1.9, ESCURO, 0.05),
  ...[9.6, 9.9, 10.2].map((z) => painel('x', 31, -1, z, z + 0.08, 1.2, 1.9, FERRO_CLARO, 0.08)),

  // Site B (metade sul): container branco com faixa vermelha, lona na pilha, banca verde com paletes em pé e tambores
  casca(CONTAINER_B, 0xcfc9b8), ...cintas(CONTAINER_B, 0xcfc9b8, 'x-'), casca(CONTAINER_B, PANO_TERRA, 1.1, 1.4, 0.03),
  casca(achar(15, 4.8), 0x7b8a6a, 1.5, 2, 0.04),
  painel('x', 25, -1, 16.7, 18, 0, 1.2, 0xb98f5a, 0.12), painel('x', 25, -1, 18.2, 19.6, 0, 1.2, 0xb98f5a, 0.12),
  ...barril(24.65, 13.4, 0x4a6a7a), ...barril(24.65, 14.15, PANO_TERRA),
  painel('x', 25, -1, 4, 21, 3.4, 3.65, AZUL_B, 0.03),

  // Laterais: cartaz na parede, pneus e tambores no canto, sacos de areia, lampiões
  painel('z', 30, -1, 13.5, 17.5, 1.4, 3.4, 0x33526b, 0.07), painel('z', 30, -1, 13.8, 17.2, 2.5, 3.1, PANO_CRU, 0.09), painel('z', 30, -1, 13.8, 15.4, 1.7, 2.2, PANO_AMARELO, 0.09),
  caixa(-40, 29.3, -39.3, 30, 0.24, ESCURO), caixa(-39.95, 29.3, -39.25, 30, 0.24, 0x3a3632, 0.24), caixa(-39.2, 29.3, -38.5, 30, 0.24, ESCURO),
  ...barril(-39.6, 28.6, OLIVA),
  ...sacos(36.4, 29.5, 30, 4),
  ...lampiao('z', 30, -1, -27), ...lampiao('z', 30, -1, 16), ...lampiao('x', -40, 1, 24),
  casca(achar(-30, 24), escurecer(AREIA, 0.75), 1.88, 2, 0.06), casca(achar(20, 24), escurecer(AREIA, 0.75), 1.08, 1.2, 0.06),
];

// ── Centro e horizonte (coordenadas reais, sem espelho) ─────────────────────────────────────────────
function cantoneiras(s: { min: PontoXZ; max: PontoXZ }, cor: number): Caixa[] {
  const r: Caixa[] = [];
  const L = 1.6;
  const e = 0.22;
  for (const [x, dx] of [[s.min.x, 1], [s.max.x, -1]] as const) {
    for (const [z, dz] of [[s.min.z, 1], [s.max.z, -1]] as const) {
      r.push(caixa(Math.min(x, x + dx * L), Math.min(z, z + dz * e), Math.max(x, x + dx * L), Math.max(z, z + dz * e), P_TINTA, cor));
      r.push(caixa(Math.min(x, x + dx * e), Math.min(z, z + dz * L), Math.max(x, x + dx * e), Math.max(z, z + dz * L), P_TINTA, cor));
    }
  }
  return r;
}

const decoCentro: Caixa[] = [
  // sites: piso claro e cantoneiras pintadas (a letra no chão continua sendo a marca do render)
  caixa(-30, -4, -19, 4, P_SITE, 0xe2d29c),
  caixa(14, -4, 25, 4, P_SITE, 0xe2d29c),
  ...cantoneiras(SITES.A, AMARELO_A),
  ...cantoneiras(SITES.B, AZUL_B),
  // placas altas em cima dos arcos, com lâmpada pendurada na verga
  ...placaDoSite('A', -32.2, -31, AMARELO_A),
  ...placaDoSite('B', 26, 27.2, AZUL_B),
  ...lampada(-31.6, 0, 2.9), ...lampada(26.6, 0, 2.9),
  // letrões pintados nas paredes que dão para os sites
  ...letra('A', 'x', -32.5, 1, 14.2, 0.9, 2.3, 2.6, AMARELO_A),
  ...letra('A', 'x', -32.5, 1, -5.6, 1.3, 1.5, 1.7, AMARELO_A), painel('x', -32.5, 1, -17, -7, 3.4, 3.65, AMARELO_A, 0.03),
  painel('x', -32.5, 1, 3, 12.6, 3.4, 3.65, AMARELO_A, 0.03),
  ...letra('B', 'x', 25, -1, 6.4, 1.1, 2.1, 2.5, AZUL_B),
  ...letra('B', 'x', 25, -1, -14.6, 1.3, 1.5, 1.8, AZUL_B),
  // pichação de caminho nas portas do meio: A para o lado do site A, B para o lado do site B
  ...letra('A', 'z', 7.8, 1, -5.9, 1.5, 0.9, 1.2, AMARELO_A), ...seta('z', 7.8, 1, -4.5, 2.1, 1.1, 1, AMARELO_A),
  ...letra('B', 'z', 7.8, 1, 6.4, 2.75, 0.55, 0.75, AZUL_B),
  ...letra('A', 'z', -7.8, -1, -5.6, 1.5, 0.9, 1.2, AMARELO_A), ...seta('z', -7.8, -1, -4.2, 2.1, 1.1, 1, AMARELO_A),
  ...letra('B', 'z', -7.8, -1, 5.9, 1.5, 0.9, 1.2, AZUL_B), ...seta('z', -7.8, -1, 4.5, 2.1, 1.1, -1, AZUL_B),
  // Longa: A com seta para o arco, de quem vem do portão
  ...letra('A', 'x', -40, 1, 3.6, 1.4, 1, 1.3, AMARELO_A), ...seta('x', -40, 1, 2, 2.05, 1.2, -1, AMARELO_A),
  ...letra('A', 'x', -40, 1, -3.6, 1.4, 1, 1.3, AMARELO_A), ...seta('x', -40, 1, -2, 2.05, 1.2, 1, AMARELO_A),
];

const horizonte: Caixa[] = [
  // norte (atrás da base A): mesquita com cúpula e minarete, prédios altos
  caixa(22, 41, 34, 50, 9, 0xd8c49a), cubo(28, 45.5, 7, 7, 2, 0xe6d8b4, 9), cubo(28, 45.5, 4.6, 4.6, 1.6, 0xe6d8b4, 11), cubo(28, 45.5, 2.2, 2.2, 1.2, 0xc9a23a, 12.6),
  cubo(17.5, 43, 2.4, 2.4, 17, 0xe0d2ac), cubo(17.5, 43, 3.6, 3.6, 0.6, 0xc7b78e, 13), cubo(17.5, 43, 1.6, 1.6, 2.2, 0xe0d2ac, 17), cubo(17.5, 43, 0.5, 0.5, 1.6, 0xc9a23a, 19.2),
  caixa(-36, 42, -26, 52, 12, 0xcbb588), caixa(-33, 41.9, -29, 42, 6, ESCURO, 5), caixa(-8, 44, 6, 54, 10.5, 0xd4bf93), cubo(-3, 47, 2, 2, 1.6, 0x8d8a80, 10.5),
  ...palmeira(-26, 32, 6.6), ...palmeira(26, 32.4, 7.2),
  // sul (atrás da base B): blocos de apartamento com caixas-d'água e torre de antena
  caixa(-30, -52, -16, -42, 13, 0xc9b48a), cubo(-26, -46, 2.2, 2.2, 1.8, 0x7a8a96, 13), caixa(-4, -55, 12, -44, 9.5, 0xdccba4),
  cubo(8, -47, 2, 2, 1.6, 0x7a8a96, 9.5), caixa(24, -50, 36, -41, 11.5, 0xbfa57c), caixa(27, -41, 33, -40.9, 5, ESCURO, 5.5),
  cubo(14.5, -40, 0.35, 0.35, 21, 0x8d8a80), cubo(14.5, -40, 2.4, 0.2, 0.2, 0x8d8a80, 16), cubo(14.5, -40, 1.6, 0.2, 0.2, 0x8d8a80, 18.5), cubo(14.5, -40, 0.5, 0.5, 0.5, 0xc0392b, 21),
  ...palmeira(-18, -32.2, 7), ...palmeira(17, -32, 6.4),
  // oeste (atrás da Longa): casario baixo e palmeiras
  caixa(-56, 2, -49, 14, 8.5, 0xd2bd92), caixa(-58, -22, -50, -8, 11, 0xc4ad82), ...palmeira(-41.8, 12.5, 6.8), ...palmeira(-41.9, -5, 7.4),
  // leste (atrás dos túneis): paredão de rocha em degraus
  caixa(46, -34, 60, -12, 8, ROCHA), caixa(50, -30, 60, -16, 5, escurecer(ROCHA, 0.9), 8), caixa(45, -8, 58, 10, 10, escurecer(ROCHA, 0.94)),
  caixa(49, -4, 58, 6, 4, ROCHA, 10), caixa(47, 14, 60, 34, 7.5, ROCHA), caixa(52, 18, 60, 30, 4.5, escurecer(ROCHA, 0.88), 7.5),
];

export const MAPA: Mapa = {
  caixas: [
    caixa(-40.5, -30.5, 40.5, 30.5, 1, CHAO, -1),
    ...ladoA,
    ...ladoA.map(espelhar),
  ],
  decoracao: [...decoA, ...decoB.map(espelhar), ...decoCentro, ...horizonte],
  spawns: {
    A: [-4, -2, 0, 2, 4].map((x) => ({ x, y: 0, z: 26 })),
    B: [-4, -2, 0, 2, 4].map((x) => ({ x, y: 0, z: -26 })),
  },
  yawSpawn: { A: 0, B: Math.PI },
  waypoints: [
    ...wpA.map(([x, z, c]) => ({ x, z, ...(c && { cobertura: true }) })),
    ...wpA.map(([x, z, c]) => ({ x, z: -z, ...(c && { cobertura: true }) })),
    ...wpC.map(([x, z]) => ({ x, z })),
    { ...SITES.A.centro }, { ...SITES.B.centro },
  ].map((w, id) => ({ id, ...w })),
  arestas: [
    ...arestasA,
    ...arestasA.map(([a, b]): [number, number] => [espelharId(a), espelharId(b)]),
    [2 * N, 2 * N + 1], [2 * N + 1, 2 * N + 2],
    [2 * N, 2 * N + 3], [2 * N + 1, 2 * N + 3], [2 * N + 1, 2 * N + 4], [2 * N + 2, 2 * N + 4],
  ],
  bombsites: {
    A: { ...SITES.A, waypoint: 2 * N + 3, espera: [9, 9 + N], mira: [{ x: -36, z: -10 }, { x: -36, z: 10 }], rotas: [2 * N, 2 * N + 1] },
    B: { ...SITES.B, waypoint: 2 * N + 4, espera: [17, 17 + N], mira: [{ x: 28, z: -8 }, { x: 28, z: 8 }], rotas: [2 * N + 2, 2 * N + 1] },
  },
  ceu: 0x87ceeb,
  neblina: [30, 90],
};
