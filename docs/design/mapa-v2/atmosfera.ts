/**
 * Block Strike — atmosfera do mapa v2 (céu, neblina, luz, poeira, panos e sombras).
 * Só dados: o render lê isto; o sim não. Ver atmosfera.md para o porquê de cada número.
 */

export interface Bandeira {
  /** Ponto de fixação (topo do mastro ou do fio), em metros. */
  pivo: { x: number; y: number; z: number };
  /** Direção em que o pano se estende em repouso, no plano xz (unitária). */
  dir: { x: number; z: number };
  /** Segmentos do pano: cada um é uma caixa de `larg` × `alt` × 2 cm, articulada na ponta do anterior. */
  segmentos: number;
  larg: number;
  alt: number;
  cor: number;
  /** Fase (rad) para as bandeiras não baterem juntas. */
  fase: number;
}

export const ATMOSFERA = {
  /** Céu em degradê (domo com cor por vértice, sem neblina): do zênite ao horizonte. */
  ceu: { zenite: 0x4f97d6, meio: 0x9cc7e4, horizonte: 0xf0dfb8 },
  /** `MAPA.ceu` novo: a cor do horizonte, que é também a cor da neblina (o teste de 0x87ceeb precisa mudar). */
  ceuMapa: 0xf0dfb8,
  /** `MAPA.neblina` novo (o teste de [30, 90] precisa mudar): abre a visada da Longa e só esfuma o horizonte. */
  neblina: { cor: 0xf0dfb8, perto: 38, longe: 150 },
  /** Sol de fim de tarde vindo de +x (as sombras de `decoracao` foram projetadas com esta direção: 0,75 m por metro). */
  sol: { cor: 0xffe2b0, intensidade: 2.5, posicao: { x: 30, y: 40, z: 9 } },
  /** Luz do céu por cima e rebatida da areia por baixo. */
  hemisferio: { ceu: 0xdcebf7, chao: 0xd9c39a, intensidade: 2.1 },
  /** Poeira: caixinhas claras boiando perto da câmera (só no render; ver atmosfera.md). */
  poeira: {
    quantidade: 56, tamanho: 0.035, cor: 0xfff1cf, opacidade: 0.55,
    /** Volume em torno da câmera (m) em que as partículas vivem; quem sai de um lado volta pelo outro. */
    volume: { x: 14, y: 5, z: 14 },
    /** Deriva do vento (m/s) e amplitude do balanço senoidal (m). */
    vento: { x: -0.22, y: 0.03, z: 0.08 }, balanco: 0.18,
  },
  /** Panos que balançam (o mastro ou o fio já está em `MAPA.decoracao`; o pano é do render). */
  bandeiras: [
    { pivo: { x: -8.7, y: 7.6, z: 19.25 }, dir: { x: -1, z: 0 }, segmentos: 3, larg: 0.55, alt: 1.0, cor: 0xb5533c, fase: 0 },
    { pivo: { x: 8.7, y: 7.6, z: -19.25 }, dir: { x: -1, z: 0 }, segmentos: 3, larg: 0.55, alt: 1.0, cor: 0x5d8a5e, fase: 1.7 },
    { pivo: { x: -31.6, y: 6.83, z: -2.05 }, dir: { x: -1, z: 0 }, segmentos: 2, larg: 0.45, alt: 0.7, cor: 0xf2c94c, fase: 0.6 },
    { pivo: { x: 26.6, y: 6.83, z: 2.05 }, dir: { x: -1, z: 0 }, segmentos: 2, larg: 0.45, alt: 0.7, cor: 0x56b7e6, fase: 2.4 },
    { pivo: { x: -33.06, y: 3.2, z: 9.0 }, dir: { x: 0, z: 1 }, segmentos: 2, larg: 0.4, alt: 0.9, cor: 0xeee3c8, fase: 3.1 },
    { pivo: { x: 17.5, y: 20.8, z: 43 }, dir: { x: -1, z: 0 }, segmentos: 3, larg: 0.8, alt: 1.3, cor: 0x4d7a56, fase: 4.0 },
  ] as Bandeira[],
  /** Balanço: cada segmento gira em y `amplitude * sin(t * freq + fase - i * atraso)` em relação ao anterior. */
  balancoBandeira: { amplitude: 0.42, freq: 2.3, atraso: 0.9 },
  /** Sombra de blob sob bonecos e objetos soltos (disco escuro, sem textura). */
  sombraBlob: { cor: 0x3a2f1c, opacidade: 0.32, raio: 0.42, y: 0.045 },
  /** Fator de sombra do sol usado nas chapas de `decoracao` (m de sombra por m de altura, em -x). */
  kSombra: 0.75,
};
