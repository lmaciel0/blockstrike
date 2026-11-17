/**
 * Block Strike — armas em caixas, v2 (substituto drop-in de `packages/client/src/modelos.ts`).
 * Módulo puro: sem Three.js e sem DOM. O render monta os modelos 3D, o HUD desenha a miniatura
 * e `gerar-svg.mjs` desenha as folhas de design, todos a partir destas MESMAS tuplas.
 *
 * Compatível com a v1: `CaixaArma`, `ModeloArma` e `MODELOS_ARMA` (as mesmas 10 chaves).
 * Extensões (todas opcionais para quem só lê `caixas`, `boca` e `pente`):
 *  - 7ª posição da tupla = índice de material (`PALETA_ARMA`), não mais "madeira?".
 *    Sem mudar o render ainda funciona: 0 cai no metal escuro e 1..3 no material claro antigo.
 *  - `cores`: troca o hex de um índice só nesta arma (madeira da AK ≠ polímero do M4).
 *  - `bocaY`: altura do clarão (a v1 usa o y da caixa 0; as duas batem em ±0,02 m).
 *  - `penteSobe`: o pente sai para CIMA na recarga (só a miniSmg, pente deitado no topo).
 *  - `MAOS_VIEW`, `PEGADA`, `VIEW_V2`: mãos e pose da primeira pessoa.
 *
 * Eixos (espaço da arma): -z = cano, +z = coronha, +y = cima, +x = direita do atirador.
 */

import type { TipoArmaDeFogo } from '@blockstrike/sim';

/** Caixa de arma: [largura(x), altura(y), profundidade(z), x, y, z, material?]. Material ausente = 0. */
export type CaixaArma = readonly [number, number, number, number, number, number, number?];

export interface ModeloArma {
  caixas: readonly CaixaArma[];
  /** z do cano (ponto do clarão). */
  boca: number;
  /** Índice da caixa que é o pente (some e volta na recarga); sem pente, ausente. */
  pente?: number;
  /** y do clarão; ausente = y da caixa 0 (comportamento da v1). */
  bocaY?: number;
  /** O pente sai para cima na recarga (o render inverte o sinal do `dy`). */
  penteSobe?: boolean;
  /** Hex por índice de material, só para esta arma (sobrepõe `PALETA_ARMA`). */
  cores?: Readonly<Partial<Record<number, string>>>;
}

/**
 * Índices de material. 0..3 são da arma; 4..6 só aparecem nas mãos da primeira pessoa.
 * | i | nome                 | hex padrão | uso                                             |
 * |---|----------------------|-----------|--------------------------------------------------|
 * | 0 | metal escuro         | #2c2f36   | receptor, cano, miras, punho de polímero preto   |
 * | 1 | metal médio/claro    | #7c838d   | pente, trilho, silenciador, ferrolho, lâmina     |
 * | 2 | madeira/polímero     | #9a6431   | coronha, guarda-mão, punho (muda por arma)       |
 * | 3 | acento/óptica        | #3fd2c8   | lente, ponto de mira, anel (muda por arma)       |
 * | 4 | manga do time        | (time)    | antebraço: azul #2f6fde / laranja #f08a24        |
 * | 5 | pele                 | (variante)| dedos: `VARIANTES[id % 5].pele` do avatar        |
 * | 6 | luva                 | #23262b   | mão (luva tática sem dedos)                      |
 */
export const PALETA_ARMA: readonly string[] = [
  '#2c2f36', '#7c838d', '#9a6431', '#3fd2c8', '#2f6fde', '#e0ac7e', '#23262b',
];
export const MAT = { escuro: 0, medio: 1, madeira: 2, acento: 3, manga: 4, pele: 5, luva: 6 } as const;

/** Cor final de um índice numa arma (aplica `cores` da arma por cima da paleta). */
export function corDaArma(modelo: ModeloArma, indice = 0): string {
  return modelo.cores?.[indice] ?? PALETA_ARMA[indice] ?? PALETA_ARMA[0];
}

// Cada linha: [largura, altura, profundidade, x, y, z, material]. A caixa 0 é sempre o corpo.
export const MODELOS_ARMA: Record<TipoArmaDeFogo | 'faca', ModeloArma> = {
  // AK: madeira avermelhada, pente comprido e adiantado, tubo de gás sobre o cano, massa de mira alta.
  rifle: {
    caixas: [
      [0.06, 0.08, 0.34, 0, 0, -0.05, 0], // 0 receptor
      [0.024, 0.024, 0.26, 0, 0.012, -0.55, 0], // 1 cano
      [0.04, 0.17, 0.07, 0, -0.115, -0.125, 1], // 2 PENTE
      [0.062, 0.062, 0.2, 0, -0.002, -0.32, 2], // 3 guarda-mão
      [0.03, 0.026, 0.26, 0, 0.042, -0.35, 0], // 4 tubo de gás
      [0.05, 0.02, 0.24, 0, 0.05, -0.06, 1], // 5 tampa do receptor
      [0.042, 0.11, 0.05, 0, -0.09, 0.085, 2], // 6 punho
      [0.048, 0.085, 0.27, 0, -0.025, 0.255, 2], // 7 coronha
      [0.014, 0.055, 0.02, 0, 0.045, -0.63, 0], // 8 massa de mira
      [0.03, 0.022, 0.04, 0, 0.071, -0.16, 0], // 9 alça de mira
      [0.034, 0.034, 0.04, 0, 0.012, -0.68, 0], // 10 freio de boca
      [0.05, 0.095, 0.02, 0, -0.028, 0.4, 0], // 11 soleira
    ],
    boca: -0.7,
    bocaY: 0.012,
    pente: 2,
    cores: { 2: '#a2622c' },
  },
  // M4: reto e modular. Guarda-mão areia, trilho comprido, mira de ponto vermelho, coronha em tubo.
  fuzil: {
    caixas: [
      [0.06, 0.09, 0.3, 0, 0, -0.05, 0], // 0 receptor
      [0.024, 0.024, 0.2, 0, 0.012, -0.58, 0], // 1 cano
      [0.04, 0.16, 0.06, 0, -0.12, -0.1, 1], // 2 PENTE
      [0.062, 0.07, 0.28, 0, 0.004, -0.34, 2], // 3 guarda-mão
      [0.03, 0.014, 0.5, 0, 0.052, -0.15, 1], // 4 trilho
      [0.04, 0.05, 0.07, 0, 0.084, -0.03, 0], // 5 mira óptica
      [0.03, 0.03, 0.008, 0, 0.086, 0.007, 3], // 6 lente (virada para o jogador)
      [0.04, 0.1, 0.045, 0, -0.09, 0.08, 0], // 7 punho
      [0.03, 0.03, 0.2, 0, 0.012, 0.2, 1], // 8 tubo da coronha
      [0.048, 0.1, 0.1, 0, -0.012, 0.31, 2], // 9 coronha
      [0.014, 0.055, 0.024, 0, 0.06, -0.47, 0], // 10 mira frontal
      [0.032, 0.032, 0.05, 0, 0.012, -0.695, 0], // 11 quebra-chama
    ],
    boca: -0.72,
    bocaY: 0.012,
    pente: 2,
    cores: { 2: '#b79c6c', 3: '#e2533a' },
  },
  // Rifle silenciado: o silenciador cinza grosso é a silhueta; coronha esqueleto e pente curto.
  rifleS: {
    caixas: [
      [0.058, 0.085, 0.3, 0, 0, -0.05, 0], // 0 receptor
      [0.046, 0.046, 0.3, 0, 0.01, -0.6, 1], // 1 silenciador
      [0.04, 0.125, 0.055, 0, -0.1, -0.095, 0], // 2 PENTE
      [0.056, 0.06, 0.25, 0, 0.003, -0.325, 2], // 3 guarda-mão
      [0.03, 0.014, 0.42, 0, 0.05, -0.14, 1], // 4 trilho
      [0.02, 0.03, 0.02, 0, 0.07, 0.05, 0], // 5 mira traseira
      [0.02, 0.03, 0.02, 0, 0.07, -0.33, 0], // 6 mira frontal
      [0.04, 0.1, 0.045, 0, -0.088, 0.08, 0], // 7 punho
      [0.028, 0.026, 0.24, 0, 0.018, 0.22, 0], // 8 haste da coronha
      [0.042, 0.115, 0.03, 0, -0.02, 0.355, 2], // 9 soleira
      [0.05, 0.05, 0.02, 0, 0.01, -0.44, 3], // 10 anel do silenciador
    ],
    boca: -0.75,
    bocaY: 0.01,
    pente: 2,
    cores: { 2: '#4d5763', 3: '#d9a441' },
  },
  // MP5: guarda-mão gordinho, tubo do ferrolho sobre o cano curto, aro de mira, pente comprido.
  smg: {
    caixas: [
      [0.055, 0.08, 0.3, 0, 0, -0.05, 0], // 0 receptor
      [0.022, 0.022, 0.09, 0, 0.005, -0.395, 0], // 1 cano
      [0.036, 0.17, 0.045, 0, -0.12, -0.125, 1], // 2 PENTE
      [0.062, 0.068, 0.15, 0, -0.008, -0.275, 2], // 3 guarda-mão
      [0.03, 0.03, 0.22, 0, 0.045, -0.3, 0], // 4 tubo do ferrolho
      [0.034, 0.044, 0.02, 0, 0.07, -0.39, 0], // 5 aro da mira frontal
      [0.036, 0.03, 0.035, 0, 0.055, 0.06, 1], // 6 mira traseira (tambor)
      [0.04, 0.1, 0.045, 0, -0.088, 0.07, 2], // 7 punho
      [0.044, 0.08, 0.2, 0, -0.008, 0.2, 2], // 8 coronha
      [0.046, 0.09, 0.02, 0, -0.01, 0.31, 0], // 9 soleira
      [0.02, 0.014, 0.02, -0.03, 0.045, -0.33, 1], // 10 alavanca de armar
    ],
    boca: -0.44,
    bocaY: 0.005,
    pente: 2,
    cores: { 2: '#47525f' },
  },
  // P90: bullpup compacta. Corpo em bloco, pente âmbar deitado no topo, dois punhos ligados por baixo.
  miniSmg: {
    caixas: [
      [0.06, 0.1, 0.36, 0, 0, 0, 2], // 0 corpo
      [0.024, 0.024, 0.07, 0, 0.01, -0.21, 0], // 1 cano
      [0.044, 0.028, 0.24, 0, 0.064, 0.03, 3], // 2 PENTE (no topo; sai para cima)
      [0.04, 0.085, 0.035, 0, -0.09, -0.12, 2], // 3 punho da frente
      [0.04, 0.085, 0.04, 0, -0.09, -0.02, 2], // 4 punho de trás
      [0.036, 0.022, 0.135, 0, -0.132, -0.07, 2], // 5 elo de baixo
      [0.03, 0.04, 0.09, 0, 0.07, -0.13, 0], // 6 trilho com mira
      [0.062, 0.11, 0.025, 0, -0.005, 0.19, 0], // 7 soleira
      [0.05, 0.06, 0.03, 0, 0.005, -0.19, 0], // 8 bocal
    ],
    boca: -0.245,
    bocaY: 0.01,
    pente: 2,
    penteSobe: true,
    cores: { 2: '#6c705a', 3: '#c9a24a' },
  },
  // MP5SD: o silenciador É o guarda-mão (cilindro cinza), coronha retrátil de haste fina.
  smgS: {
    caixas: [
      [0.055, 0.08, 0.28, 0, 0, -0.04, 0], // 0 receptor
      [0.05, 0.05, 0.32, 0, 0.006, -0.34, 1], // 1 silenciador
      [0.036, 0.15, 0.042, 0, -0.11, -0.11, 0], // 2 PENTE
      [0.058, 0.035, 0.16, 0, -0.03, -0.28, 2], // 3 guarda-mão sob o silenciador
      [0.036, 0.03, 0.035, 0, 0.055, 0.06, 0], // 4 mira traseira
      [0.02, 0.03, 0.02, 0, 0.045, -0.2, 0], // 5 mira frontal
      [0.04, 0.1, 0.045, 0, -0.088, 0.07, 2], // 6 punho
      [0.05, 0.018, 0.2, 0, 0.028, 0.2, 1], // 7 haste da coronha
      [0.05, 0.09, 0.022, 0, -0.005, 0.31, 0], // 8 soleira
      [0.054, 0.054, 0.018, 0, 0.006, -0.47, 3], // 9 anel do silenciador
    ],
    boca: -0.5,
    bocaY: 0.006,
    pente: 2,
    cores: { 2: '#414a55', 3: '#d9a441' },
  },
  // AWP: chassi verde-oliva, cano muito longo, luneta grande com objetiva larga, coronha de polegar.
  sniper: {
    caixas: [
      [0.058, 0.08, 0.44, 0, 0, -0.05, 2], // 0 chassi
      [0.028, 0.028, 0.5, 0, 0.014, -0.52, 0], // 1 cano
      [0.04, 0.06, 0.08, 0, -0.065, -0.05, 0], // 2 PENTE
      [0.04, 0.04, 0.3, 0, 0.1, -0.04, 0], // 3 tubo da luneta
      [0.056, 0.056, 0.07, 0, 0.1, -0.215, 0], // 4 objetiva
      [0.044, 0.044, 0.008, 0, 0.1, -0.252, 3], // 5 lente da frente
      [0.05, 0.05, 0.05, 0, 0.1, 0.125, 0], // 6 ocular
      [0.036, 0.036, 0.008, 0, 0.1, 0.152, 3], // 7 lente do olho
      [0.022, 0.042, 0.14, 0, 0.06, -0.04, 1], // 8 anéis da luneta
      [0.054, 0.11, 0.3, 0, -0.028, 0.32, 2], // 9 coronha
      [0.04, 0.03, 0.15, 0, 0.04, 0.3, 0], // 10 apoio de bochecha
      [0.04, 0.04, 0.06, 0, 0.014, -0.795, 0], // 11 freio de boca
      [0.03, 0.02, 0.03, 0.042, 0.022, 0.11, 1], // 12 alavanca do ferrolho
      [0.02, 0.02, 0.18, 0, -0.012, -0.37, 0], // 13 bipé dobrado
    ],
    boca: -0.83,
    bocaY: 0.014,
    pente: 2,
    cores: { 2: '#56693d' },
  },
  // Pump: dois tubos (cano e carregador), telha de madeira que desliza, coronha caída.
  escopeta: {
    caixas: [
      [0.058, 0.085, 0.26, 0, 0, -0.03, 0], // 0 receptor
      [0.03, 0.03, 0.44, 0, 0.022, -0.38, 0], // 1 cano
      [0.03, 0.03, 0.38, 0, -0.02, -0.35, 1], // 2 tubo do carregador
      [0.056, 0.056, 0.17, 0, -0.024, -0.34, 2], // 3 telha (pump)
      [0.044, 0.065, 0.1, 0, -0.03, 0.145, 2], // 4 pescoço da coronha
      [0.05, 0.11, 0.22, 0, -0.05, 0.3, 2], // 5 coronha
      [0.052, 0.115, 0.02, 0, -0.05, 0.42, 0], // 6 soleira
      [0.012, 0.016, 0.012, 0, 0.045, -0.585, 3], // 7 ponto de mira
      [0.06, 0.03, 0.09, 0, 0.014, -0.03, 1], // 8 janela de ejeção
      [0.02, 0.03, 0.07, 0, -0.056, 0.055, 0], // 9 guarda-mato
      [0.04, 0.075, 0.02, 0, 0, -0.53, 0], // 10 braçadeira dos tubos
    ],
    boca: -0.6,
    bocaY: 0.022,
    cores: { 2: '#7c4a25', 3: '#e8c15a' },
  },
  // USP/Glock: ferrolho claro sobre armação escura (dois tons), punho inclinado só na leitura.
  pistola: {
    caixas: [
      [0.04, 0.046, 0.2, 0, 0, -0.05, 1], // 0 ferrolho
      [0.03, 0.125, 0.04, 0, -0.09, 0.03, 0], // 1 PENTE (a base aparece sob o punho)
      [0.042, 0.03, 0.17, 0, -0.036, -0.035, 0], // 2 armação
      [0.042, 0.105, 0.056, 0, -0.09, 0.03, 2], // 3 punho
      [0.014, 0.04, 0.06, 0, -0.068, -0.03, 0], // 4 guarda-mato
      [0.03, 0.012, 0.014, 0, 0.029, 0.038, 0], // 5 mira traseira
      [0.008, 0.012, 0.012, 0, 0.029, -0.14, 3], // 6 ponto da mira frontal
      [0.02, 0.02, 0.02, 0, 0.004, -0.155, 0], // 7 cano
      [0.041, 0.03, 0.03, 0, 0.002, 0.025, 0], // 8 serrilha do ferrolho
    ],
    boca: -0.165,
    bocaY: 0.004,
    pente: 1,
    cores: { 2: '#3a3e45', 3: '#7dff6b' },
  },
  // Faca tática: lâmina com ponta subindo, fio claro, guarda e pomo escuros.
  faca: {
    caixas: [
      [0.012, 0.045, 0.2, 0, 0.02, -0.17, 1], // 0 lâmina
      [0.03, 0.04, 0.11, 0, 0.012, 0.005, 2], // 1 cabo
      [0.04, 0.075, 0.02, 0, 0.012, -0.06, 0], // 2 guarda
      [0.012, 0.026, 0.05, 0, 0.0295, -0.295, 1], // 3 ponta
      [0.013, 0.012, 0.2, 0, 0.0035, -0.17, 3], // 4 fio
      [0.034, 0.046, 0.02, 0, 0.012, 0.07, 0], // 5 pomo
    ],
    boca: -0.35,
    cores: { 1: '#aeb7c0', 2: '#3b4a36', 3: '#eef2f5' },
  },
};

// ───────────────────────── Primeira pessoa: pose e mãos ─────────────────────────

export type TipoView = TipoArmaDeFogo | 'faca' | 'granada';

/**
 * Pose de repouso do viewmodel no espaço da câmera (substitui o `POS_VIEW` único do render).
 * `pos` em metros, `rot` = [rx, ry, rz] em rad (ordem YXZ). Mais à frente que a v1 (z -0,40; x 0,24) para a
 * mão direita caber na tela com o FOV de 75°; `ry` > 0 aponta o cano de leve para a mira.
 */
export const VIEW_V2: Record<TipoView, { pos: readonly [number, number, number]; rot: readonly [number, number, number] }> = {
  rifle: { pos: [0.18, -0.185, -0.47], rot: [0.02, 0.06, -0.03] },
  fuzil: { pos: [0.18, -0.185, -0.47], rot: [0.02, 0.06, -0.03] },
  rifleS: { pos: [0.18, -0.185, -0.47], rot: [0.02, 0.06, -0.03] },
  smg: { pos: [0.18, -0.185, -0.46], rot: [0.02, 0.06, -0.03] },
  miniSmg: { pos: [0.18, -0.19, -0.5], rot: [0.02, 0.06, -0.03] },
  smgS: { pos: [0.18, -0.185, -0.46], rot: [0.02, 0.06, -0.03] },
  sniper: { pos: [0.18, -0.195, -0.46], rot: [0.02, 0.05, -0.03] },
  escopeta: { pos: [0.18, -0.185, -0.47], rot: [0.02, 0.06, -0.03] },
  pistola: { pos: [0.15, -0.165, -0.5], rot: [0.03, 0.07, -0.02] },
  faca: { pos: [0.19, -0.2, -0.44], rot: [0.3, 0.45, -0.3] },
  granada: { pos: [0.2, -0.2, -0.46], rot: [0, 0, 0] },
};

/**
 * Onde cada mão pega, no espaço da arma: centro do punho (`dir`) e do apoio (`esq`).
 * `modo`: 'punho' = mão fechada em volta de algo vertical; 'apoio' = palma por baixo do guarda-mão
 * (y = face de baixo; `meia` = meia-largura do que ela segura). `esq: null` = só a mão direita.
 */
export interface Pegada {
  dir: readonly [number, number, number];
  esq: { p: readonly [number, number, number]; modo: 'punho' | 'apoio'; meia?: number } | null;
}
export const PEGADA: Record<TipoView, Pegada> = {
  rifle: { dir: [0, -0.09, 0.085], esq: { p: [0, -0.033, -0.32], modo: 'apoio', meia: 0.031 } },
  fuzil: { dir: [0, -0.09, 0.08], esq: { p: [0, -0.031, -0.34], modo: 'apoio', meia: 0.031 } },
  rifleS: { dir: [0, -0.088, 0.08], esq: { p: [0, -0.027, -0.33], modo: 'apoio', meia: 0.028 } },
  smg: { dir: [0, -0.088, 0.07], esq: { p: [0, -0.042, -0.275], modo: 'apoio', meia: 0.031 } },
  miniSmg: { dir: [0, -0.09, -0.02], esq: { p: [0, -0.092, -0.125], modo: 'punho' } },
  smgS: { dir: [0, -0.088, 0.07], esq: { p: [0, -0.0475, -0.28], modo: 'apoio', meia: 0.029 } },
  sniper: { dir: [0, -0.072, 0.2], esq: { p: [0, -0.04, -0.19], modo: 'apoio', meia: 0.029 } },
  escopeta: { dir: [0, -0.058, 0.14], esq: { p: [0, -0.052, -0.34], modo: 'apoio', meia: 0.028 } },
  pistola: { dir: [0, -0.09, 0.03], esq: { p: [-0.034, -0.108, 0.022], modo: 'punho' } },
  faca: { dir: [0, 0.006, 0.008], esq: null },
  granada: { dir: [0, -0.03, 0.012], esq: null },
};

/**
 * Caixa de mão/braço: [largura, altura, profundidade, x, y, z, material, rx, ry] no espaço da arma.
 * `rx`/`ry` em rad (ordem YXZ, em torno do centro da caixa); só o antebraço usa giro.
 */
export type CaixaMao = readonly [number, number, number, number, number, number, number, number, number];
export interface MaosView { dir: readonly CaixaMao[]; esq: readonly CaixaMao[] }

type P3 = readonly [number, number, number];
const r4 = (v: number): number => Math.round(v * 1e4) / 1e4;
// Cotovelos fixos no espaço da arma (fora da tela, embaixo): o antebraço sempre "vem" do corpo.
const COTOVELO: { dir: P3; esq: P3 } = { dir: [0.13, -0.3, 0.42], esq: [-0.36, -0.4, 0.12] };
const ANTEBRACO = { comp: 0.4, lado: 0.1 };

/** Antebraço: caixa de `ANTEBRACO.comp` saindo do pulso na direção do cotovelo. */
function antebraco(pulso: P3, cotovelo: P3): CaixaMao {
  const d: P3 = [cotovelo[0] - pulso[0], cotovelo[1] - pulso[1], cotovelo[2] - pulso[2]];
  const len = Math.hypot(d[0], d[1], d[2]) || 1;
  const u: P3 = [d[0] / len, d[1] / len, d[2] / len];
  const m = ANTEBRACO.comp / 2;
  return [
    ANTEBRACO.lado, ANTEBRACO.lado, ANTEBRACO.comp,
    r4(pulso[0] + u[0] * m), r4(pulso[1] + u[1] * m), r4(pulso[2] + u[2] * m),
    MAT.manga, r4(-Math.asin(u[1])), r4(Math.atan2(u[0], u[2])),
  ];
}

/** Mão fechada num punho vertical: luva + dedos de pele do lado de dentro (-x para a direita). */
function maoPunho([x, y, z]: P3, lado: 1 | -1, cotovelo: P3): CaixaMao[] {
  return [
    [0.076, 0.078, 0.074, r4(x + 0.004 * lado), r4(y - 0.005), r4(z + 0.008), MAT.luva, 0, 0],
    [0.02, 0.06, 0.054, r4(x - 0.046 * lado), r4(y + 0.002), r4(z - 0.004), MAT.pele, 0, 0],
    antebraco([x + 0.012 * lado, y - 0.03, z + 0.045], cotovelo),
  ];
}

/** Mão esquerda por baixo do guarda-mão: palma de luva + polegar de pele subindo pelo lado de fora. */
function maoApoio([x, y, z]: P3, meia: number, cotovelo: P3): CaixaMao[] {
  return [
    [r4(meia * 2 + 0.03), 0.05, 0.1, r4(x - 0.004), r4(y - 0.022), z, MAT.luva, 0, 0],
    [0.022, 0.056, 0.09, r4(x - meia - 0.014), r4(y + 0.014), z, MAT.pele, 0, 0],
    antebraco([x - 0.02, y - 0.04, z + 0.035], cotovelo),
  ];
}

function maosDe(pegada: Pegada): MaosView {
  const esq = pegada.esq;
  return {
    dir: maoPunho(pegada.dir, 1, COTOVELO.dir),
    esq: esq === null ? []
      : esq.modo === 'apoio' ? maoApoio(esq.p, esq.meia ?? 0.03, COTOVELO.esq)
        : maoPunho(esq.p, -1, COTOVELO.esq),
  };
}

/**
 * Mãos e antebraços da primeira pessoa, por arma, já no espaço da arma (filhos do grupo do viewmodel:
 * herdam balanço, recuo, saque e inspeção de graça). 3 caixas por braço = no máximo 6 por arma.
 * Faca e granada: só a direita (`esq` vazio). Material 4 = manga do time, 5 = pele, 6 = luva.
 */
export const MAOS_VIEW: Record<TipoView, MaosView> = {
  rifle: maosDe(PEGADA.rifle),
  fuzil: maosDe(PEGADA.fuzil),
  rifleS: maosDe(PEGADA.rifleS),
  smg: maosDe(PEGADA.smg),
  miniSmg: maosDe(PEGADA.miniSmg),
  smgS: maosDe(PEGADA.smgS),
  sniper: maosDe(PEGADA.sniper),
  escopeta: maosDe(PEGADA.escopeta),
  pistola: maosDe(PEGADA.pistola),
  faca: maosDe(PEGADA.faca),
  granada: maosDe(PEGADA.granada),
};
