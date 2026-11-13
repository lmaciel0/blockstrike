import { expect, test } from 'vitest';
import { MAPA } from '../src/mapa.js';
import { criarGrafo, caminho, maisProximo, coberturaPerto } from '../src/navegacao.js';
import type { Caixa, Waypoint } from '../src/tipos.js';

// Quadrado 0-1-2-3 (lado 10), diagonal 0-2 (custo 14.1) e nó isolado 4.
const wps: Waypoint[] = [
  { id: 0, x: 0, z: 0 }, { id: 1, x: 10, z: 0 }, { id: 2, x: 10, z: 10 },
  { id: 3, x: 0, z: 10 }, { id: 4, x: 50, z: 50 },
];
const quadrado = criarGrafo(wps, [[0, 1], [1, 2], [2, 3], [3, 0], [0, 2]]);

test('caminho mais curto no quadrado usa a diagonal', () => {
  expect(caminho(quadrado, 0, 2)).toStrictEqual([0, 2]);
  expect(caminho(quadrado, 1, 3).length).toBe(3);
});

test('caminho contorna o quadrado sem a diagonal', () => {
  const g = criarGrafo(wps, [[0, 1], [1, 2], [2, 3], [3, 0]]);
  const c = caminho(g, 0, 2);
  expect(c.length).toBe(3);
  expect(c[0]).toBe(0);
  expect(c[2]).toBe(2);
});

test('de == para devolve [id]', () => {
  expect(caminho(quadrado, 3, 3)).toStrictEqual([3]);
});

test('sem caminho devolve []', () => {
  expect(caminho(quadrado, 0, 4)).toStrictEqual([]);
  expect(caminho(quadrado, 4, 0)).toStrictEqual([]);
});

test('arestas são bidirecionais', () => {
  expect(caminho(quadrado, 2, 0)).toStrictEqual([2, 0]);
});

test('no MAPA, spawn A mais próximo alcança spawn B mais próximo', () => {
  const g = criarGrafo(MAPA.waypoints, MAPA.arestas);
  for (const a of MAPA.spawns.A) {
    for (const b of MAPA.spawns.B) {
      const ia = maisProximo(g, a, MAPA.caixas, { exigirVisada: false });
      const ib = maisProximo(g, b, MAPA.caixas, { exigirVisada: false });
      const c = caminho(g, ia!, ib!);
      expect(c.length >= 2, `sem caminho ${ia} -> ${ib}`).toBeTruthy();
      expect(c[0]).toBe(ia);
      expect(c[c.length - 1]).toBe(ib);
    }
  }
});

test('maisProximo ignora waypoint atrás de parede', () => {
  const parede: Caixa[] = [{ min: { x: 4, y: 0, z: -5 }, max: { x: 6, y: 3, z: 15 }, cor: 0 }];
  const g = criarGrafo(wps, []);
  // pos perto de 1 (x=10), mas parede em x=4..6 bloqueia; 0 e 3 visíveis.
  const pos = { x: 2, y: 0, z: 1 };
  expect(maisProximo(g, pos, parede, { exigirVisada: true })).toBe(0);
  const pos2 = { x: 8, y: 0, z: 1 };
  expect(maisProximo(g, pos2, parede, { exigirVisada: true })).toBe(1);
  expect(maisProximo(g, pos2, parede, { exigirVisada: false })).toBe(1);
  const pos3 = { x: 5, y: 5, z: 1 }; // acima da parede, vê tudo
  expect(maisProximo(g, pos3, parede, { exigirVisada: true })).not.toBe(null);
});

test('maisProximo devolve null se nada visível', () => {
  const parede: Caixa[] = [{ min: { x: -1, y: 0, z: -1 }, max: { x: 1, y: 3, z: 1 }, cor: 0 }];
  const g = criarGrafo([{ id: 0, x: 5, z: 0 }], []);
  expect(maisProximo(g, { x: -3, y: 0, z: 0 }, parede, { exigirVisada: true })).toBe(null);
});

test('coberturaPerto devolve waypoint sem visada para a ameaça', () => {
  const parede: Caixa[] = [{ min: { x: 4, y: 0, z: -5 }, max: { x: 6, y: 3, z: 5 }, cor: 0 }];
  const w: Waypoint[] = [
    { id: 0, x: 8, z: 0, cobertura: true },   // lado da ameaça: exposto
    { id: 1, x: 2, z: 0 },                    // atrás da parede mas sem flag
    { id: 2, x: 0, z: 0, cobertura: true },   // atrás da parede: serve
    { id: 3, x: 9, z: 1, cobertura: true },
  ];
  const g = criarGrafo(w, []);
  const ameaca = { x: 12, y: 0, z: 0 };
  expect(coberturaPerto(g, { x: 7, y: 0, z: 2 }, ameaca, parede)).toBe(2);
});

test('coberturaPerto devolve null sem cobertura segura', () => {
  const g = criarGrafo([{ id: 0, x: 8, z: 0, cobertura: true }], []);
  expect(coberturaPerto(g, { x: 7, y: 0, z: 0 }, { x: 12, y: 0, z: 0 }, [])).toBe(null);
});
