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

// Decoração só visual: faixas, portas, toldos e o piso por zona. O sim não lê isto.
function molduras(c: Caixa): Caixa[] {
  const h = c.max.y - c.min.y;
  if (h < 3.9 || c.min.y > 0) return [];
  const e = 0.12;
  return [
    // coroa da parede (mais escura e um pouco mais larga) e rodapé
    { min: { x: c.min.x - e, y: c.max.y, z: c.min.z - e }, max: { x: c.max.x + e, y: c.max.y + 0.3, z: c.max.z + e }, cor: escurecer(Number(c.cor), 0.7) },
    { min: { x: c.min.x - 0.05, y: 0, z: c.min.z - 0.05 }, max: { x: c.max.x + 0.05, y: 0.45, z: c.max.z + 0.05 }, cor: escurecer(Number(c.cor), 0.8) },
  ];
}

const decoA: Caixa[] = [
  ...ladoA.flatMap(molduras),
  // portas azuis abertas encostadas nos pilares do portão da Longa e nas portas do meio
  caixa(-37.6, 17.4, -37.4, 19.2, 3, AZUL), // folha da porta aberta, encostada no pilar
  caixa(-7, 7.8, -6.8, 9.4, 3, AZUL),
  caixa(6.8, 7.8, 7, 9.4, 3, AZUL),
  // toldo da base e das saídas dos túneis
  caixa(-6, 22, 6, 25, 0.2, GESSO, 3.6),
  caixa(26.4, 3.4, 30.6, 4, 0.2, GESSO, 2.9),
  // faixas coloridas nos containers (leitura de longe)
  caixa(-40, 11.5, -37, 13.5, 0.15, GESSO, 2.6),
  caixa(20.5, 4.8, 23.5, 6.6, 0.15, GESSO, 2.4),
  // placas dos sites nas paredes (a cor do site: A amarelo, B azul claro)
  caixa(-33.1, 7, -33, 11, 1.2, 0xf2c94c, 2),
  caixa(25.5, 14, 25.6, 18, 1.2, 0x56b7e6, 2),
  // piso por zona (0,01 m acima do chão; sem colisão)
  caixa(-12, 19, 12, 30, 0.01, 0xb79f6c), // base
  caixa(-40, 0, -33, 16.6, 0.01, 0xb8a06e), // Longa
  caixa(25.5, 4, 31, 21, 0.01, 0x9d8b61), // túnel
  caixa(-7, 0, 7, 14, 0.01, 0xcdb87f), // meio
];

const decoracaoSites: Caixa[] = [
  caixa(-30, -4, -19, 4, 0.01, 0xe2d29c), // site A
  caixa(14, -4, 25, 4, 0.01, 0xe2d29c), // site B
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

export const MAPA: Mapa = {
  caixas: [
    caixa(-40.5, -30.5, 40.5, 30.5, 1, CHAO, -1),
    ...ladoA,
    ...ladoA.map(espelhar),
  ],
  decoracao: [...decoA, ...decoA.map(espelhar), ...decoracaoSites],
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
