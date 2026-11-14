import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mod } from './_repo.mjs';

const { agregar, mediana, verificar, METAS } = await mod('tools/bs-varredura.mjs');

const partida = (dificuldade, extra) => ({
  dificuldade, vitoriasT: 10, vitoriasCT: 10, mortes: 100, cabecas: 30,
  metricas: { killsPorArma: { rifle: 50, smg: 50 }, primeirosAcertos: [0.8], encontros: 10, encontrosSemAcerto: 2, desencalhes: 0, botsMudos: 0 },
  ...extra,
});

test('mediana: vazio é null, ímpar e par', () => {
  assert.equal(mediana([]), null);
  assert.equal(mediana([3, 1, 2]), 2);
  assert.equal(mediana([1, 2, 3, 4]), 2.5);
});

test('agregar: soma duas partidas do médio', () => {
  const m = (killsPorArma, primeirosAcertos, extra = {}) => ({
    killsPorArma, primeirosAcertos, encontros: 10, encontrosSemAcerto: 2, desencalhes: 3, botsMudos: 0, ...extra,
  });
  const r = agregar([
    partida('medio', { vitoriasT: 5, vitoriasCT: 15, mortes: 100, cabecas: 30, metricas: m({ rifle: 60, smg: 40 }, [0.5, 0.9]) }),
    partida('medio', { vitoriasT: 15, vitoriasCT: 5, mortes: 100, cabecas: 40, metricas: m({ rifle: 20, smg: 80 }, [0.7], { botsMudos: 1 }) }),
  ]);
  assert.deepEqual(Object.keys(r), ['medio']);
  const l = r.medio;
  assert.equal(l.partidas, 2);
  assert.equal(l.vitoriaT, 0.5);
  assert.equal(l.headshot, 0.35);
  assert.deepEqual(l.armaTopo, { arma: 'smg', fracao: 0.6 });
  assert.deepEqual(l.killsPorArma, { rifle: 0.4, smg: 0.6 });
  assert.equal(l.primeiroAcertoMediana, 0.7);
  assert.equal(l.semAcerto, 0.2);
  assert.equal(l.desencalhesPorPartida, 3);
  assert.equal(l.botsMudos, 1);
});

test('agregar: sem acertos a mediana é null e sem kills não há arma topo', () => {
  const l = agregar([partida('facil', { metricas: { killsPorArma: {}, primeirosAcertos: [], encontros: 0, encontrosSemAcerto: 0, desencalhes: 0, botsMudos: 0 } })]).facil;
  assert.equal(l.primeiroAcertoMediana, null);
  assert.equal(l.semAcerto, 0);
  assert.deepEqual(l.armaTopo, { arma: null, fracao: 0 });
});

test('verificar: tabela dentro das metas não lista falhas, fora lista', () => {
  const ok = { partidas: 8, vitoriaT: 0.5, headshot: 0.35, primeiroAcertoMediana: 0.8, semAcerto: 0.1, desencalhesPorPartida: 0, botsMudos: 0, killsPorArma: {}, armaTopo: { arma: 'rifle', fracao: 0.3 } };
  assert.deepEqual(verificar({ medio: ok }), []);
  const ruim = { ...ok, vitoriaT: 0.6, headshot: 0.2, primeiroAcertoMediana: 1.5, botsMudos: 2, armaTopo: { arma: 'smg', fracao: 0.5 } };
  const falhas = verificar({ medio: ruim });
  assert.equal(falhas.length, 5);
  for (const campo of ['headshot', 'primeiro acerto', 'vitória T', 'arma topo', 'bots mudos']) {
    assert.ok(falhas.some((f) => f.includes(campo) && f.includes('medio')), `${campo}: ${falhas}`);
  }
  assert.equal(verificar({ medio: { ...ok, primeiroAcertoMediana: null } }).length, 1);
  assert.equal(METAS.medio.primeiroAcerto, 0.8);
});
