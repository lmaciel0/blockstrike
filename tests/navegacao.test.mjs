import test from 'node:test';
import assert from 'node:assert/strict';
import { mod } from './_repo.mjs';

const { MAPA } = await mod('js/games/blockstrike/mapa.js');
const { criarGrafo, caminho, maisProximo, coberturaPerto } =
  await mod('js/games/blockstrike/navegacao.js');

// Quadrado 0-1-2-3 (lado 10), diagonal 0-2 (custo 14.1) e nó isolado 4.
const wps = [
  { id: 0, x: 0, z: 0 }, { id: 1, x: 10, z: 0 }, { id: 2, x: 10, z: 10 },
  { id: 3, x: 0, z: 10 }, { id: 4, x: 50, z: 50 },
];
const quadrado = criarGrafo(wps, [[0, 1], [1, 2], [2, 3], [3, 0], [0, 2]]);

test('caminho mais curto no quadrado usa a diagonal', () => {
  assert.deepEqual(caminho(quadrado, 0, 2), [0, 2]);
  assert.equal(caminho(quadrado, 1, 3).length, 3);
});

test('caminho contorna o quadrado sem a diagonal', () => {
  const g = criarGrafo(wps, [[0, 1], [1, 2], [2, 3], [3, 0]]);
  const c = caminho(g, 0, 2);
  assert.equal(c.length, 3);
  assert.equal(c[0], 0);
  assert.equal(c[2], 2);
});

test('de == para devolve [id]', () => {
  assert.deepEqual(caminho(quadrado, 3, 3), [3]);
});

test('sem caminho devolve []', () => {
  assert.deepEqual(caminho(quadrado, 0, 4), []);
  assert.deepEqual(caminho(quadrado, 4, 0), []);
});

test('arestas são bidirecionais', () => {
  assert.deepEqual(caminho(quadrado, 2, 0), [2, 0]);
});

test('no MAPA, spawn A mais próximo alcança spawn B mais próximo', () => {
  const g = criarGrafo(MAPA.waypoints, MAPA.arestas);
  for (const a of MAPA.spawns.A) {
    for (const b of MAPA.spawns.B) {
      const ia = maisProximo(g, a, MAPA.caixas, { exigirVisada: false });
      const ib = maisProximo(g, b, MAPA.caixas, { exigirVisada: false });
      const c = caminho(g, ia, ib);
      assert.ok(c.length >= 2, `sem caminho ${ia} -> ${ib}`);
      assert.equal(c[0], ia);
      assert.equal(c[c.length - 1], ib);
    }
  }
});

test('maisProximo ignora waypoint atrás de parede', () => {
  const parede = [{ min: { x: 4, y: 0, z: -5 }, max: { x: 6, y: 3, z: 15 } }];
  const g = criarGrafo(wps, []);
  // pos perto de 1 (x=10), mas parede em x=4..6 bloqueia; 0 e 3 visíveis.
  const pos = { x: 2, y: 0, z: 1 };
  assert.equal(maisProximo(g, pos, parede, { exigirVisada: true }), 0);
  const pos2 = { x: 8, y: 0, z: 1 };
  assert.equal(maisProximo(g, pos2, parede, { exigirVisada: true }), 1);
  assert.equal(maisProximo(g, pos2, parede, { exigirVisada: false }), 1);
  const pos3 = { x: 5, y: 5, z: 1 }; // acima da parede, vê tudo
  assert.notEqual(maisProximo(g, pos3, parede, { exigirVisada: true }), null);
});

test('maisProximo devolve null se nada visível', () => {
  const parede = [{ min: { x: -1, y: 0, z: -1 }, max: { x: 1, y: 3, z: 1 } }];
  const g = criarGrafo([{ id: 0, x: 5, z: 0 }], []);
  assert.equal(maisProximo(g, { x: -3, y: 0, z: 0 }, parede, { exigirVisada: true }), null);
});

test('coberturaPerto devolve waypoint sem visada para a ameaça', () => {
  const parede = [{ min: { x: 4, y: 0, z: -5 }, max: { x: 6, y: 3, z: 5 } }];
  const w = [
    { id: 0, x: 8, z: 0, cobertura: true },   // lado da ameaça: exposto
    { id: 1, x: 2, z: 0 },                    // atrás da parede mas sem flag
    { id: 2, x: 0, z: 0, cobertura: true },   // atrás da parede: serve
    { id: 3, x: 9, z: 1, cobertura: true },
  ];
  const g = criarGrafo(w, []);
  const ameaca = { x: 12, y: 0, z: 0 };
  assert.equal(coberturaPerto(g, { x: 7, y: 0, z: 2 }, ameaca, parede), 2);
});

test('coberturaPerto devolve null sem cobertura segura', () => {
  const g = criarGrafo([{ id: 0, x: 8, z: 0, cobertura: true }], []);
  assert.equal(coberturaPerto(g, { x: 7, y: 0, z: 0 }, { x: 12, y: 0, z: 0 }, []), null);
});
