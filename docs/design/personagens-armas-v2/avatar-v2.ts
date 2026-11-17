/**
 * Block Strike — receita do boneco v2. Dados puros + funções puras (sem Three.js, sem DOM).
 * O render (`criarAvatar`/`atualizarAvatar`) lê estas tabelas; `gerar-svg.mjs` desenha a folha com elas.
 *
 * COMO O RENDER USA
 *  1. Para cada (time, variante = id % 5) monta UMA geometria por parte (`montarParte`: caixas fundidas
 *     numa BufferGeometry com cor por vértice) e guarda em cache: 4 geometrias por combinação
 *     (tronco, cabeça+chapéu, braço, perna E/D), no máximo 10 combinações. Um material só
 *     (`MeshLambertMaterial({ vertexColors: true })`) para todos os bonecos.
 *  2. Hierarquia (pivôs em `PARTES[...].pivo`, y a partir dos pés, frente = -z):
 *       raiz ─ pernaE, pernaD, tronco (gira em y: `giroTronco`), cabeca (gira em torno do CENTRO),
 *              mira (pivô na linha dos ombros; rotation.x = pitch) ─ bracoE, bracoD, arma
 *     = 6 malhas + rosto + arma + sombra = 9 draw calls por boneco (hoje são 9 + 2..4 da arma).
 *  3. Rosto: um plano de 0,40 x 0,40 m colado na frente da cabeça (z = -0,201), com UV num atlas único
 *     de canvas (`ATLAS_ROSTO`: 4 expressões x 5 variantes, 16 px cada). Trocar de expressão = trocar a
 *     geometria do plano (20 planos compartilhados com UVs diferentes); nenhuma textura por boneco.
 *  4. Hitboxes (CONGELADAS, `hitboxes` em sim/fisica.ts): pernas y 0..0,8 e tronco 0,8..1,4 com
 *     meia-largura 0,25; cabeça 1,4..1,8 com meia-largura 0,20. Cabeça, chapéu, tronco, colete e
 *     mochila ficam dentro delas com folga máxima de 0,05 m EM QUALQUER ANIMAÇÃO (ver `LIMITES`).
 *     Braços ficam fora da hitbox do tronco, como hoje (tiro no braço não acerta) — e pernas balançam.
 */

import type { Time, TipoArma } from '@blockstrike/sim';
import { PEGADA } from './modelos-v2';

// ───────────────────────────── (a) Medidas ─────────────────────────────

/** Chaves de cor: resolvidas por `coresDe(time, variante)`. */
export type CorAvatar =
  | 'time' | 'timeEscuro' | 'timeClaro' | 'colete' | 'coleteClaro' | 'chapeu' | 'mochila' | 'acento'
  | 'pele' | 'cabelo' | 'cabeca' | 'bota' | 'luva' | 'preto' | 'couro' | 'lente';

/** Caixa do boneco: [largura(x), altura(y), profundidade(z), x, y, z, cor] no espaço da parte (pivô = origem). */
export type CaixaAvatar = readonly [number, number, number, number, number, number, CorAvatar];

export interface ParteAvatar { pivo: readonly [number, number, number]; caixas: readonly CaixaAvatar[] }
export type NomeParte = 'tronco' | 'cabeca' | 'bracoE' | 'bracoD' | 'pernaE' | 'pernaD';

const BRACO: readonly CaixaAvatar[] = [
  [0.15, 0.4, 0.15, 0, -0.2, 0, 'time'], // manga
  [0.16, 0.07, 0.16, 0, -0.12, 0, 'timeClaro'], // faixa do time (braçadeira)
  [0.13, 0.1, 0.13, 0, -0.45, 0, 'pele'], // antebraço à mostra
  [0.155, 0.16, 0.155, 0, -0.58, 0, 'luva'], // luva (centro = ponto de pega, `ALCANCE`)
];
const PERNA: readonly CaixaAvatar[] = [
  [0.22, 0.56, 0.22, 0, -0.28, 0, 'timeEscuro'], // calça
  [0.16, 0.09, 0.03, 0, -0.4, -0.115, 'colete'], // joelheira
  [0.225, 0.24, 0.26, 0, -0.68, -0.015, 'bota'], // bota (bico 1,5 cm para a frente)
];

/**
 * Boneco de 1,80 m. Tronco 0,46 x 0,60 x 0,26; cabeça 0,40³; braço 0,15 x 0,66; perna 0,22 x 0,80.
 * Mais estreito nos ombros que a v1 (0,38 contra 0,43 de meia-largura): menos braço fora da hitbox.
 */
export const PARTES: Record<NomeParte, ParteAvatar> = {
  tronco: {
    pivo: [0, 0.8, 0],
    caixas: [
      [0.46, 0.6, 0.26, 0, 0.3, 0, 'time'], // camisa
      [0.47, 0.07, 0.27, 0, 0.035, 0, 'preto'], // cinto
      [0.4, 0.36, 0.04, 0, 0.36, -0.15, 'colete'], // colete: placa da frente
      [0.4, 0.36, 0.03, 0, 0.36, 0.145, 'colete'], // colete: placa das costas
      [0.1, 0.04, 0.27, -0.14, 0.58, 0, 'colete'], // alça do ombro E
      [0.1, 0.04, 0.27, 0.14, 0.58, 0, 'colete'], // alça do ombro D
      [0.2, 0.05, 0.012, 0, 0.47, -0.176, 'timeClaro'], // tarja do time no peito
      [0.28, 0.3, 0.1, 0, 0.36, 0.21, 'mochila'], // mochila pequena
    ],
  },
  cabeca: { pivo: [0, 1.4, 0], caixas: [[0.4, 0.4, 0.4, 0, 0.2, 0, 'cabeca']] },
  bracoE: { pivo: [-0.305, 1.38, 0], caixas: BRACO },
  bracoD: { pivo: [0.305, 1.38, 0], caixas: BRACO },
  pernaE: { pivo: [-0.115, 0.8, 0], caixas: PERNA },
  pernaD: {
    pivo: [0.115, 0.8, 0],
    caixas: [...PERNA, [0.05, 0.14, 0.1, 0.125, -0.2, 0, 'preto']], // coldre na coxa direita
  },
};

/** Distância do ombro ao centro da luva (m): alcance usado para posar as mãos na arma. */
export const ALCANCE = 0.58;
/** Plano do rosto: quadrado de 0,40 m na frente da cabeça, filho de `cabeca`. */
export const ROSTO = { lado: 0.4, y: 0.2, z: -0.201 } as const;

/** Folgas e limites que mantêm cabeça e tronco dentro das hitboxes (±0,05 m). */
export const LIMITES = {
  cabecaPitch: 0.25, // rad, em torno do centro da cabeça (0,40³ girado 0,25 rad cresce 0,045 m)
  cabecaYaw: 0.25, // rad, olhar em volta no idle
  giroTronco: 0.7, // rad em y (0,46 x 0,26 girado 0,7 rad ocupa 0,26 x 0,25 de meia-largura)
  inclinacaoTronco: 0.06, // rad em x/z (o topo da cabeça anda 0,05 m)
  raizY: 0.05, // m: quico, pouso e "ajoelhar" não descem a raiz mais que isto
} as const;

// ───────────────────────────── (b) Roupas por time ─────────────────────────────

/** Azul = CT ("polícia tática": capacete, colete com bolsos, rádio). Laranja = T ("guerrilha": gorro, lenço, cartucheira). */
export const CORES_TIME: Record<Time, Record<
  'time' | 'timeEscuro' | 'timeClaro' | 'colete' | 'coleteClaro' | 'chapeu' | 'mochila' | 'acento', string>> = {
  azul: {
    time: '#2f6fde', timeEscuro: '#22478f', timeClaro: '#8fbcff', colete: '#1b2741', coleteClaro: '#2e3d61',
    chapeu: '#243763', mochila: '#202b42', acento: '#e9e5d8',
  },
  laranja: {
    time: '#f08a24', timeEscuro: '#9c5a1a', timeClaro: '#ffcb78', colete: '#3e2d1f', coleteClaro: '#5c4532',
    chapeu: '#40332b', mochila: '#4d3b27', acento: '#c5392c',
  },
};
export const CORES_FIXAS = { bota: '#1e1b19', luva: '#23262b', preto: '#17191d', couro: '#5d3e25', lente: '#15171c' } as const;

/** Extras do tronco por time (somados a `PARTES.tronco.caixas`). */
export const EXTRAS_TRONCO: Record<Time, readonly CaixaAvatar[]> = {
  azul: [
    [0.11, 0.1, 0.04, -0.1, 0.26, -0.185, 'coleteClaro'], // bolso E
    [0.11, 0.1, 0.04, 0.1, 0.26, -0.185, 'coleteClaro'], // bolso D
    [0.05, 0.1, 0.05, -0.15, 0.5, -0.185, 'preto'], // rádio no ombro
  ],
  laranja: [
    [0.42, 0.06, 0.28, 0, 0.575, 0, 'acento'], // lenço no pescoço
    [0.4, 0.06, 0.045, 0, 0.22, -0.152, 'couro'], // cartucheira
    [0.07, 0.07, 0.05, 0.12, 0.22, -0.18, 'couro'], // bolsa da cartucheira
  ],
};

// ───────────────────────────── (c) Variantes (id % 5) ─────────────────────────────

export type Acessorio = 'nenhum' | 'oculos' | 'barba' | 'balaclava' | 'mascara';
export interface Variante {
  nome: string;
  pele: string;
  sombra: string; // pele escurecida: nariz e pálpebra
  cabelo: string;
  acessorio: Acessorio;
  tecido: string; // cor da balaclava / máscara
}
export const VARIANTES: readonly Variante[] = [
  { nome: 'Recruta', pele: '#e8b48c', sombra: '#c58c66', cabelo: '#5a3a22', acessorio: 'nenhum', tecido: '#22252b' },
  { nome: 'Sombra', pele: '#8d5a3b', sombra: '#6c4128', cabelo: '#1c1512', acessorio: 'oculos', tecido: '#22252b' },
  { nome: 'Veterano', pele: '#f0c9a4', sombra: '#d09d77', cabelo: '#b0602a', acessorio: 'barba', tecido: '#22252b' },
  { nome: 'Fantasma', pele: '#c6895f', sombra: '#a16843', cabelo: '#241a14', acessorio: 'balaclava', tecido: '#24272d' },
  { nome: 'Bandana', pele: '#a86f48', sombra: '#84512e', cabelo: '#15110f', acessorio: 'mascara', tecido: '#2f3d34' },
];

export type Chapeu = 'capacete' | 'capaceteOculos' | 'boneFone' | 'gorro' | 'bone' | 'bandana' | 'faixa' | 'boneTras';
/** Chapéu por time e variante: a silhueta da cabeça também diz o time (capacete = azul). */
export const CHAPEU_DE: Record<Time, readonly Chapeu[]> = {
  azul: ['capacete', 'capacete', 'capaceteOculos', 'capacete', 'boneFone'],
  laranja: ['gorro', 'bone', 'bandana', 'faixa', 'boneTras'],
};

const CAPACETE: readonly CaixaAvatar[] = [
  [0.46, 0.15, 0.46, 0, 0.365, 0, 'chapeu'], // casco (topo em 1,84 m)
  [0.46, 0.13, 0.3, 0, 0.225, 0.08, 'chapeu'], // abas: cobre orelhas e nuca (lê capacete, não quepe)
  [0.47, 0.035, 0.47, 0, 0.31, 0, 'timeClaro'], // faixa do time
  [0.03, 0.06, 0.1, 0.235, 0.36, 0.02, 'preto'], // trilho lateral
];
// Cabelo que aparece dos lados e atrás, por baixo do chapéu (na balaclava vira tecido).
const NUCA: CaixaAvatar = [0.41, 0.2, 0.26, 0, 0.2, 0.075, 'cabelo'];
/** Caixas do chapéu no espaço da cabeça (pivô no pescoço, y 0..0,40 = cabeça). Meia-largura ≤ 0,25; topo ≤ 0,45. */
export const CHAPEUS: Record<Chapeu, readonly CaixaAvatar[]> = {
  capacete: CAPACETE,
  capaceteOculos: [
    ...CAPACETE,
    [0.36, 0.075, 0.03, 0, 0.345, -0.235, 'preto'], // óculos de proteção na testa
    [0.3, 0.045, 0.01, 0, 0.345, -0.25, 'timeClaro'],
  ],
  boneFone: [
    [0.42, 0.12, 0.42, 0, 0.35, 0, 'chapeu'], // copa
    [0.32, 0.025, 0.05, 0, 0.305, -0.225, 'timeClaro'], // aba (curta: a hitbox manda)
    [0.03, 0.14, 0.11, -0.215, 0.2, 0.01, 'preto'], // fone E
    [0.03, 0.14, 0.11, 0.215, 0.2, 0.01, 'preto'], // fone D
    [0.44, 0.025, 0.04, 0, 0.415, 0.01, 'preto'], // arco do fone
    NUCA,
  ],
  gorro: [
    [0.43, 0.15, 0.43, 0, 0.365, 0, 'chapeu'],
    [0.44, 0.05, 0.44, 0, 0.315, 0, 'timeClaro'], // dobra do gorro
    NUCA,
  ],
  bone: [
    [0.42, 0.12, 0.42, 0, 0.35, 0, 'time'],
    [0.32, 0.025, 0.05, 0, 0.305, -0.225, 'timeEscuro'],
    NUCA,
  ],
  bandana: [
    [0.42, 0.08, 0.42, 0, 0.33, 0, 'time'], // bandana na testa
    [0.38, 0.05, 0.38, 0, 0.415, 0, 'cabelo'], // cabelo por cima
    [0.1, 0.09, 0.045, 0.07, 0.31, 0.225, 'time'], // nó atrás
    NUCA,
  ],
  faixa: [[0.42, 0.06, 0.42, 0, 0.34, 0, 'timeClaro'], [0.1, 0.09, 0.045, -0.07, 0.32, 0.225, 'timeClaro']], // faixa e nó por cima da balaclava
  boneTras: [
    [0.42, 0.12, 0.42, 0, 0.35, 0, 'time'],
    [0.32, 0.025, 0.05, 0, 0.305, 0.225, 'timeEscuro'], // aba para trás
    NUCA,
  ],
};

/** Paleta completa de um boneco. `cabeca` = pele, ou o tecido quando a variante usa balaclava. */
export function coresDe(time: Time, variante: number): Record<CorAvatar, string> {
  const v = VARIANTES[((variante % 5) + 5) % 5];
  const bala = v.acessorio === 'balaclava';
  return {
    ...CORES_TIME[time], ...CORES_FIXAS,
    pele: v.pele, cabelo: bala ? v.tecido : v.cabelo, cabeca: bala ? v.tecido : v.pele,
  };
}

/** Todas as caixas de uma parte para um boneco (base + extras do time + chapéu). O render funde numa geometria. */
export function caixasDaParte(parte: NomeParte, time: Time, variante: number): readonly CaixaAvatar[] {
  const base = PARTES[parte].caixas;
  if (parte === 'tronco') return [...base, ...EXTRAS_TRONCO[time]];
  if (parte === 'cabeca') return [...base, ...CHAPEUS[CHAPEU_DE[time][((variante % 5) + 5) % 5]]];
  return base;
}

// ───────────────────────────── (d) Rosto procedural ─────────────────────────────

export type Expressao = 'neutra' | 'foco' | 'dano' | 'morte';
export const EXPRESSOES: readonly Expressao[] = ['neutra', 'foco', 'dano', 'morte'];

/** Contexto mínimo: o `CanvasRenderingContext2D` serve, e um objeto de teste em Node também. */
// `string | object` aceita o contexto real do canvas (cujo fillStyle também pode ser gradiente/padrão).
export interface CtxRosto { fillStyle: string | object; fillRect(x: number, y: number, w: number, h: number): void }

const BRANCO_OLHO = '#f3f1ea';
const PUPILA = '#1b1b1f';
const BOCA = '#6e2f2c';
const BOCA_ABERTA = '#3a1418';
const LINGUA = '#d9606a';

/**
 * Desenha o rosto numa grade de 16 x 16 "pixels" (a frente da cabeça: 2,5 cm por pixel).
 * Linhas 0..4 ficam sob o chapéu; sobrancelha na 5..6, olhos na 7..8, nariz na 10, boca na 12.
 * `ox`, `oy` e `px` posicionam a célula num atlas (px = tamanho do pixel no canvas).
 */
export function desenharRosto(
  ctx: CtxRosto, expressao: Expressao, variante: Variante, ox = 0, oy = 0, px = 1,
): void {
  const r = (x: number, y: number, w: number, h: number, cor: string): void => {
    ctx.fillStyle = cor;
    ctx.fillRect(ox + x * px, oy + y * px, w * px, h * px);
  };
  const v = variante;
  const bala = v.acessorio === 'balaclava';
  // Espelha um desenho do olho esquerdo (colunas 3..5) para o direito (10..12).
  const par = (x: number, y: number, w: number, h: number, cor: string): void => {
    r(x, y, w, h, cor);
    r(16 - x - w, y, w, h, cor);
  };

  // Base: pele, cabelo na testa e costeletas; balaclava cobre tudo menos a faixa dos olhos.
  r(0, 0, 16, 16, bala ? v.tecido : v.pele);
  if (bala) r(2, 5, 12, 5, v.pele);
  else {
    r(0, 0, 16, 4, v.cabelo);
    par(0, 4, 1, 3, v.cabelo);
    r(7, 10, 2, 1, v.sombra); // nariz
  }
  if (v.acessorio === 'barba') {
    r(2, 11, 12, 5, v.cabelo);
    par(1, 8, 1, 8, v.cabelo);
    r(5, 10, 6, 1, v.cabelo); // bigode
  }

  // Sobrancelhas e olhos.
  const sobr = bala ? PUPILA : v.cabelo;
  if (expressao === 'neutra') {
    par(3, 5, 3, 1, sobr);
    par(3, 7, 3, 2, BRANCO_OLHO);
    par(4, 7, 2, 2, PUPILA);
  } else if (expressao === 'foco') {
    par(3, 5, 1, 1, sobr); // sobrancelha desce para o centro
    par(4, 6, 2, 1, sobr);
    par(3, 7, 3, 1, v.sombra); // pálpebra semicerrada
    par(3, 8, 3, 1, BRANCO_OLHO);
    par(4, 8, 2, 1, PUPILA);
  } else if (expressao === 'dano') {
    par(3, 6, 2, 1, sobr); // sobrancelha sobe no centro
    par(5, 5, 1, 1, sobr);
    par(3, 7, 1, 1, PUPILA); // olhos apertados: > <
    par(4, 8, 2, 1, PUPILA);
    par(3, 9, 1, 1, PUPILA);
  } else {
    par(3, 6, 1, 1, PUPILA); // X X
    par(5, 6, 1, 1, PUPILA);
    par(4, 7, 1, 1, PUPILA);
    par(3, 8, 1, 1, PUPILA);
    par(5, 8, 1, 1, PUPILA);
  }

  // Óculos escuros por cima dos olhos (na morte, a lente direita cai e mostra o X).
  if (v.acessorio === 'oculos') {
    const lente = CORES_FIXAS.lente;
    r(2, 6, 5, 4, lente);
    r(3, 7, 2, 1, '#5c6b82'); // brilho
    r(0, 7, 2, 1, lente);
    r(7, 7, 2, 1, lente);
    if (expressao === 'morte') r(9, 10, 5, 2, lente);
    else {
      r(9, 6, 5, 4, lente);
      r(10, 7, 2, 1, '#5c6b82');
      r(14, 7, 2, 1, lente);
    }
  }

  // Boca (a máscara e a balaclava escondem; na dor o tecido marca a boca aberta).
  if (v.acessorio === 'mascara') {
    r(0, 10, 16, 6, v.tecido);
    r(0, 10, 16, 1, v.sombra); // borda da máscara
    r(7, 10, 2, 1, v.tecido); // dobra no nariz
    if (expressao === 'dano') r(6, 12, 4, 2, PUPILA);
    return;
  }
  if (bala) {
    if (expressao === 'dano' || expressao === 'morte') r(6, 12, 4, expressao === 'dano' ? 2 : 1, PUPILA);
    return;
  }
  if (expressao === 'neutra') r(6, 12, 4, 1, BOCA);
  else if (expressao === 'foco') {
    r(6, 12, 3, 1, BOCA); // boca firme, canto levantado
    r(9, 11, 1, 1, BOCA);
  } else if (expressao === 'dano') {
    r(6, 11, 4, 3, BOCA_ABERTA);
    r(6, 11, 4, 1, BRANCO_OLHO); // dentes
  } else {
    r(6, 12, 4, 1, BOCA_ABERTA);
    r(8, 13, 2, 1, LINGUA);
  }
}

/** Atlas único dos rostos: coluna = expressão, linha = variante. 64 x 80 px, filtro NEAREST, sem mipmap. */
export const ATLAS_ROSTO = { px: 16, colunas: 4, linhas: 5, largura: 64, altura: 80 } as const;
export function desenharAtlas(ctx: CtxRosto): void {
  VARIANTES.forEach((v, linha) => EXPRESSOES.forEach((e, col) => {
    desenharRosto(ctx, e, v, col * ATLAS_ROSTO.px, linha * ATLAS_ROSTO.px, 1);
  }));
}

/**
 * QUANDO TROCAR DE EXPRESSÃO (prioridade de cima para baixo; tempos em s do relógio do mundo):
 * | expressão | dispara                                                                  | dura            |
 * |-----------|--------------------------------------------------------------------------|-----------------|
 * | morte     | `!vivo` — vai na peça da cabeça do desmanche                             | até sumir a peça|
 * | dano      | evento `acerto` com `alvo = id`; ou hp caiu sem evento (HE, fogo);       | 0,35            |
 * |           | ou cego (`cegoAte > tempo`)                                              | enquanto cego   |
 * | foco      | evento `tiro`/`golpe` com `atirador = id`                                | 0,60 após o último|
 * |           | recarregando (`recarregandoAte > 0`), pino puxado, plantando/desarmando  | enquanto durar  |
 * | neutra    | o resto                                                                  | —               |
 */
export const DURACAO_EXPRESSAO = { dano: 0.35, foco: 0.6 } as const;
export interface EstadoRosto { vivo: boolean; desdeDano: number; desdeTiro: number; cego: boolean; ocupado: boolean }
export function expressaoDe(e: EstadoRosto): Expressao {
  if (!e.vivo) return 'morte';
  if (e.cego || e.desdeDano < DURACAO_EXPRESSAO.dano) return 'dano';
  if (e.ocupado || e.desdeTiro < DURACAO_EXPRESSAO.foco) return 'foco';
  return 'neutra';
}

// ───────────────────────────── Pose segurando a arma ─────────────────────────────

/** Braço rígido (sem cotovelo): [rx, ry] em rad, ordem YXZ, no espaço do grupo `mira`. */
export type GiroBraco = readonly [number, number];
export interface PoseArmado {
  /** Giro do tronco em y (rad). Negativo = ombro esquerdo à frente (postura de tiro). */
  giroTronco: number;
  /** Posição da arma e dos ombros no espaço do boneco (y dos pés). O grupo `mira` tem pivô em (0, 1.38, 0). */
  arma: readonly [number, number, number];
  ombroD: readonly [number, number, number];
  ombroE: readonly [number, number, number];
  bracoD: GiroBraco;
  bracoE: GiroBraco;
}

type P3 = readonly [number, number, number];
const r3 = (v: number): number => Math.round(v * 1e3) / 1e3;
const ombro = (lado: 1 | -1, giro: number): P3 => {
  const x = PARTES.bracoD.pivo[0] * lado;
  return [r3(x * Math.cos(giro)), PARTES.bracoD.pivo[1], r3(-x * Math.sin(giro))];
};
/** Giro que aponta um braço (que nasce para baixo) do ombro para o alvo. */
export function apontarBraco(de: P3, para: P3): GiroBraco {
  const d: P3 = [para[0] - de[0], para[1] - de[1], para[2] - de[2]];
  const len = Math.hypot(d[0], d[1], d[2]) || 1;
  return [r3(Math.acos(Math.max(-1, Math.min(1, -d[1] / len)))), r3(Math.atan2(-d[0] / len, -d[2] / len))];
}

/**
 * Pose de quem segura `tipo`. Braços sem cotovelo têm alcance fixo (`ALCANCE`), então:
 *  - armas longas: tronco de lado (0,7 rad, ombro esquerdo à frente) e arma encostada no peito direito;
 *    a mão direita cai no punho e a esquerda no começo do guarda-mão;
 *  - pistola: de frente, os dois braços esticados se encontram no punho;
 *  - faca: mão direita baixa à frente, esquerda em guarda; granada: direita ao lado, esquerda relaxada.
 * A posição z da arma sai do alcance da mão direita (a arma vai até onde o braço chega).
 */
export function poseArmado(tipo: TipoArma | null): PoseArmado {
  const livre = (giro: number, maoD: P3, maoE: P3, arma: P3): PoseArmado => {
    const oD = ombro(1, giro);
    const oE = ombro(-1, giro);
    return { giroTronco: giro, arma, ombroD: oD, ombroE: oE, bracoD: apontarBraco(oD, maoD), bracoE: apontarBraco(oE, maoE) };
  };
  if (tipo === null) return livre(0, [0.33, 0.8, -0.05], [-0.33, 0.8, -0.05], [0, 0, 0]);
  if (tipo === 'faca') return livre(-0.3, [0.26, 1.02, -0.5], [-0.12, 1.2, -0.48], [0.26, 1.02, -0.5]);
  if (tipo === 'granada') return livre(-0.2, [0.3, 1.12, -0.45], [-0.3, 0.86, -0.2], [0.3, 1.15, -0.45]);

  const pega = PEGADA[tipo];
  const giro = tipo === 'pistola' ? 0 : tipo === 'miniSmg' ? -0.45 : -0.7;
  const [ax, ay] = tipo === 'pistola' ? [0, 1.36] : [0.1, 1.27];
  const oD = ombro(1, giro);
  const oE = ombro(-1, giro);
  // z da arma: a mão direita (a `ALCANCE` do ombro) tem de cair no punho.
  const dx = ax + pega.dir[0] - oD[0];
  const dy = ay + pega.dir[1] - oD[1];
  const az = r3(oD[2] - Math.sqrt(Math.max(0, ALCANCE * ALCANCE - dx * dx - dy * dy)) - pega.dir[2]);
  const maoD: P3 = [ax + pega.dir[0], ay + pega.dir[1], az + pega.dir[2]];
  const e = pega.esq;
  const maoE: P3 = e === null ? [-0.3, 0.86, -0.2] : [ax + e.p[0], ay + e.p[1] - 0.02, az + e.p[2]];
  return { giroTronco: giro, arma: [ax, ay, az], ombroD: oD, ombroE: oE, bracoD: apontarBraco(oD, maoD), bracoE: apontarBraco(oE, maoE) };
}

// ───────────────────────────── (e) Animações ─────────────────────────────

/**
 * TABELA DE ANIMAÇÕES. Ângulos em rad, distâncias em m, tempos em s. "Dispara" cita campos de `Entidade`
 * (todos existem em sim/tipos.ts: `velHoriz`, `agachado`, `distAndada`, `pitch`, `yaw`, `noChao`, `slot`,
 * `hp`, `vivo`, `armas`) e eventos do passo (`tiro`, `acerto`, `recarga`, `saque`, `arremesso`, `pouso`,
 * `acao-inicio`, `acao-cancelada`, `morte`). Tudo é aditivo sobre `poseArmado(tipo)`.
 * Curvas: 'seno' = sin(fase); 'exp' = decai com e^(-k·t); 'sair' = ease-out 1-(1-t)²; 'suave' = t²(3-2t).
 */
export const ANIM = {
  /** Caminhada: fase = `distAndada` × 4 rad/m (passada de 0,79 m; igual à v1). Dispara: `noChao && velHoriz > 0,5`. */
  caminhada: {
    faseRadPorM: 4,
    /** Amplitude da perna por `velHoriz` (interpolar): devagar/agachado ≈ 0,3; correr com rifle ≈ 0,7; faca 0,8. */
    ampPernaPorVel: [[0, 0], [1.5, 0.28], [3.2, 0.5], [5, 0.7], [6.2, 0.8]] as ReadonlyArray<readonly [number, number]>,
    suavizacao: 10, // 1/s: amp += (alvo - amp) × min(1, dt × 10)
    quicoRaiz: 0.025, // m × |sin(fase)| × amp/0,8 (sobe a raiz; ≤ LIMITES.raizY)
    contraTronco: 0.07, // rad × sin(fase) × amp/0,8, somado a `giroTronco` (com arma na mão)
    balancoArma: 0.012, // m × sin(2·fase) × amp/0,8 em y do grupo `mira`
    bracoLivre: 0.5, // rad × sin(fase) × amp/0,8, oposto à perna do mesmo lado (braço sem arma: faca/granada/nada)
    cabecaRolo: 0.03, // rad × sin(fase) em z da cabeça
  },
  /** Correr × andar devagar (Shift = 0,52 da velocidade) × agachado (0,34): sai da tabela acima; extras: */
  ritmo: {
    limiarCorrida: 3.6, // m/s: acima disto vale `inclinacaoCorrida`
    inclinacaoCorrida: 0.05, // rad em x do tronco para a frente (≤ LIMITES.inclinacaoTronco), entra em 0,2 s
    ampAgachado: 0.6, // × a amplitude da perna
    quicoDevagar: 0.5, // × o quico abaixo de 3,2 m/s
  },
  /** Agachar. Dispara: `agachado`. A hitbox escala TUDO por 1,2/1,8, então o boneco também (como hoje). */
  agachar: {
    escalaY: 1.2 / 1.8, duracao: 0.12, curva: 'sair', // hoje é instantâneo
    abrePernas: 0.14, // rad em z de cada perna (para fora): base mais larga, lê como "agachado" e não "amassado"
  },
  /** Mira vertical. Dispara: `pitch` (positivo = para cima; limite do sim ±1,5). */
  pitch: {
    mira: { ganho: 0.9, limite: 1.1 }, // grupo `mira` (braços + arma): rotation.x = clamp(pitch × 0,9, ±1,1)
    cabeca: { ganho: 0.35, limite: LIMITES.cabecaPitch }, // gira em torno do centro da cabeça (y 1,6)
    suavizacao: 14, // 1/s (bots viram a mira em degraus; isto alisa)
  },
  /** Recuo ao atirar. Dispara: evento `tiro` (atirador = id). Soma no grupo `mira`. */
  recuo: {
    miraX: 0.06, armaZ: 0.035, decaimento: 16, curva: 'exp', // rad para cima, m para trás; ~0,15 s
    pesado: { tipos: ['sniper', 'escopeta'], miraX: 0.16, armaZ: 0.07, giroTronco: 0.08, decaimento: 9 },
    faca: { bracoD: 1.1, duracao: 0.3, curva: 'seno' }, // evento `golpe`: o braço direito corta para a frente
  },
  /** Recarga. Dispara: evento `recarga`; progresso p = 1 - (recarregandoAte - tempo) / ARMAS[tipo].recarga. */
  recarga: {
    fases: [
      { p: [0, 0.15], faz: 'arma inclina', miraZ: 0.35, miraX: -0.25, curva: 'sair' },
      { p: [0.15, 0.35], faz: 'mão esquerda desce ao pente', bracoE: -0.9, curva: 'suave' }, // ≈ 0,3 m abaixo da arma
      { p: [0.35, 0.6], faz: 'segura embaixo (pente novo)', bracoE: -0.9, curva: 'reta' },
      { p: [0.6, 0.8], faz: 'mão volta e encaixa', bracoE: 0, curva: 'suave' },
      { p: [0.8, 1], faz: 'arma volta', miraZ: 0, miraX: 0, curva: 'suave' },
    ],
    cabecaX: -0.2, // olha para a arma entre p 0,15 e 0,8
  },
  /** Plantar/desarmar. Dispara: `mundo.bomba.acao?.id === id` (ou `acao-inicio` → `acao-cancelada`/`plantada`/`desarmada`). */
  bomba: {
    entra: 0.2, sai: 0.15, curva: 'sair',
    miraX: -0.9, // braços e arma apontam para o chão
    cabecaX: -0.25, raizY: -0.05, // no limite das hitboxes: NÃO ajoelha de verdade (ver `SIM_PRECISA_EXPOR`)
    pernas: [0.5, -0.5], // passada: E à frente, D atrás
    maos: { amp: 0.12, hz: 6 }, // braço E treme: "digitando" na C4
  },
  /** Granada. Preparo: `armas.granada.pino !== null`; soltar: evento `arremesso` (bots só têm o soltar). */
  arremesso: {
    preparo: { bracoD: 2.7, giroTronco: 0.25, duracao: 0.15, curva: 'sair' }, // mão atrás da cabeça
    soltar: { bracoD: 0.7, giroTronco: -0.2, duracao: 0.14, curva: 'sair' },
    volta: { duracao: 0.25, curva: 'suave' },
  },
  /** Reação a dano. Dispara: evento `acerto` (alvo = id); sem evento, `hp` caiu (sem direção: lado = ±1 por id). */
  dano: {
    duracao: 0.12, ataque: 0.03, retorno: 0.09, curva: 'sair',
    giroTronco: 0.14, // × lado de onde veio o tiro: sign(sin(yawDoAtiradorParaOAlvo - yaw))
    cabecaX: -0.18, raizRecuo: 0.03, // a cabeça "leva o tranco"; a raiz anda 3 cm para longe do tiro
  },
  /** Idle. Dispara: `velHoriz < 0,5`. Cada boneco tem fase própria (`id × 1,7`, como hoje). */
  idle: {
    respiracao: { rad: 1.6, miraY: 0.008, troncoEscalaY: 0.006, curva: 'seno' }, // rad/s; ±m; ±fração
    olhar: { yaw: 0.2, cadaMin: 2.5, cadaMax: 5, transicao: 0.6, curva: 'suave' }, // cabeça olha em volta
    peso: { raizRolo: 0.015, hz: 0.4 }, // troca o peso de perna
  },
  /** No ar e pouso. Dispara: `!noChao`; evento `pouso`. */
  ar: { pernas: [0.45, -0.25], miraY: 0.02, pouso: { raizY: -0.045, duracao: 0.16, curva: 'sair' } },
  /** Saque. Dispara: evento `saque` (ou `slot` mudou): a arma sobe da cintura. */
  saque: { miraX: -0.7, duracao: 0.25, curva: 'sair' },
} as const;

/** Peças do desmanche (a função `desmanchar` já existe): geometria fundida de cada parte, com as cores do boneco. */
export const PECAS_MORTE: ReadonlyArray<{ parte: NomeParte | 'arma'; leva: string }> = [
  { parte: 'tronco', leva: 'camisa, colete, mochila, extras do time' },
  { parte: 'cabeca', leva: 'cabeça, chapéu e o rosto na expressão "morte"' },
  { parte: 'bracoE', leva: 'manga, faixa, pele, luva' },
  { parte: 'bracoD', leva: 'manga, faixa, pele, luva' },
  { parte: 'pernaE', leva: 'calça, joelheira, bota' },
  { parte: 'pernaD', leva: 'calça, joelheira, bota, coldre' },
  { parte: 'arma', leva: 'a arma que estava na mão, nas cores dela (7ª peça: MAX_PECAS 72 → 84)' },
];

/** O que o render precisaria e o sim NÃO expõe hoje (nada é obrigatório; nada foi implementado). */
export const SIM_PRECISA_EXPOR: readonly string[] = [
  'Ajoelhar ao plantar/desarmar: a hitbox não desce, então o visual só pode descer 0,05 m. Para ajoelhar de verdade o sim teria de forçar `agachado` durante a ação (muda o jogo: decisão do dono).',
  'Direção do movimento relativa ao `yaw` (andar de lado/de costas): não existe em `Entidade`; o render deriva de Δpos entre quadros.',
  '`devagar` (Shift) não fica na entidade: o render infere por `velHoriz` < 0,6 × `ARMAS[tipo].vel`.',
  'Dano sem evento `acerto` (HE, molotov): o render detecta por queda de `hp` e perde a direção do tranco.',
  'Luneta aberta de OUTROS jogadores (`zoom` só existe em `Comandos`): impede a pose/rosto de "mirando" neles.',
];

/** Pernas e extras do ciclo de caminhada, prontos para somar na pose. Pura: testável sem render. */
export function cicloCaminhada(distAndada: number, amp: number): {
  pernaE: number; pernaD: number; quico: number; contraTronco: number; balancoArma: number; bracoLivre: number;
} {
  const c = ANIM.caminhada;
  const fase = distAndada * c.faseRadPorM;
  const s = Math.sin(fase);
  const k = amp / 0.8;
  return {
    pernaE: s * amp, pernaD: -s * amp, quico: Math.abs(s) * c.quicoRaiz * k,
    contraTronco: s * c.contraTronco * k, balancoArma: Math.sin(fase * 2) * c.balancoArma * k,
    bracoLivre: s * c.bracoLivre * k,
  };
}

/** Amplitude-alvo da perna para uma velocidade (interpola `ampPernaPorVel`; agachado multiplica por 0,6). */
export function ampDaPerna(velHoriz: number, agachado: boolean): number {
  const t = ANIM.caminhada.ampPernaPorVel;
  let amp = t[t.length - 1][1];
  for (let i = 1; i < t.length; i += 1) {
    if (velHoriz <= t[i][0]) {
      const [v0, a0] = t[i - 1];
      const [v1, a1] = t[i];
      amp = a0 + ((a1 - a0) * (velHoriz - v0)) / (v1 - v0);
      break;
    }
  }
  return agachado ? amp * ANIM.ritmo.ampAgachado : amp;
}
