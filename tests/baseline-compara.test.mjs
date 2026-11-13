import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { mod } from './_repo.mjs';

const { comparar, dentro, metricas, tabela } = await mod('tools/baseline-compara.mjs');

// Uma partida por dificuldade e seed, todas iguais; `mudar(dificuldade)` devolve o que trocar nela.
function baseline(mudar = () => ({}), seeds = [1, 2]) {
  const partidas = [];
  for (const dificuldade of ['facil', 'medio', 'dificil']) {
    for (const seed of seeds) {
      partidas.push({
        dificuldade, seed, rounds: 20, placar: { azul: 13, laranja: 7 }, vitoriasT: 10, vitoriasCT: 10,
        mortes: 100, cabecas: 20, presos: 10, dinheiroFinal: [], hash: '00000000', ...mudar(dificuldade),
      });
    }
  }
  return { partidas };
}

test('metricas: média de rounds, % de vitórias T, % de headshot e presos por partida', () => {
  const m = metricas(baseline().partidas.filter((x) => x.dificuldade === 'medio'));
  assert.deepEqual(m, { partidas: 2, rounds: 20, vitoriasT: 50, cabecas: 20, presos: 10 });
});

test('dentro: 10% de variação relativa passa, mais que isso não', () => {
  assert.equal(dentro(22, 20, false), true);
  assert.equal(dentro(22.1, 20, false), false);
  assert.equal(dentro(18, 20, false), true);
  assert.equal(dentro(17.9, 20, false), false);
});

test('dentro: porcentagem também passa com até 3 pontos percentuais', () => {
  // 5% -> 8%: 60% de variação relativa, mas só 3 pontos.
  assert.equal(dentro(8, 5, true), true);
  assert.equal(dentro(8.1, 5, true), false);
  // Contagem não tem ponto percentual: a mesma diferença reprova.
  assert.equal(dentro(8, 5, false), false);
});

test('dentro: referência zero só passa com novo zero (contagem) ou pelos pontos (porcentagem)', () => {
  assert.equal(dentro(0, 0, false), true);
  assert.equal(dentro(1, 0, false), false);
  assert.equal(dentro(2, 0, true), true);
});

test('comparar: baselines iguais ficam dentro, com 4 métricas por dificuldade', () => {
  const { linhas, fora } = comparar(baseline(), baseline(), 2);
  assert.equal(linhas.length, 12);
  assert.deepEqual(fora, []);
});

test('comparar: aponta a métrica e a dificuldade que saíram', () => {
  const novo = baseline((d) => (d === 'dificil' ? { presos: 12 } : {}));
  const { fora } = comparar(novo, baseline(), 2);
  assert.deepEqual(fora.map((l) => `${l.dificuldade}/${l.metrica}`), ['dificil/presos']);
  assert.match(tabela(fora), /FORA/);
});

test('comparar: recusa seeds diferentes, poucas seeds e baseline sem vitórias por lado', () => {
  assert.throws(() => comparar(baseline(undefined, [1, 2]), baseline(undefined, [1, 3]), 2), /seeds diferentes/);
  assert.throws(() => comparar(baseline(), baseline()), /mínimo 30/);
  assert.throws(() => comparar(baseline(() => ({ vitoriasT: undefined })), baseline(), 2), /vitoriasT/);
});

test('linha de comando: DENTRO DA TOLERANCIA com código 0; fora, lista e código 1', () => {
  const pasta = mkdtempSync(path.join(tmpdir(), 'bs-compara-'));
  try {
    const gravar = (nome, dados) => {
      const arquivo = path.join(pasta, nome);
      writeFileSync(arquivo, JSON.stringify(dados));
      return arquivo;
    };
    const ref = gravar('ref.json', baseline());
    const igual = gravar('igual.json', baseline());
    const pior = gravar('pior.json', baseline((d) => (d === 'facil' ? { rounds: 23 } : {})));
    const rodar = (novo) => spawnSync(process.execPath, ['tools/baseline-compara.mjs', novo, ref, '--min-seeds=2'], {
      cwd: process.env.REPO ?? process.cwd(), encoding: 'utf8',
    });
    const ok = rodar(igual);
    assert.equal(ok.status, 0);
    assert.match(ok.stdout, /DENTRO DA TOLERANCIA/);
    const ruim = rodar(pior);
    assert.equal(ruim.status, 1);
    assert.doesNotMatch(ruim.stdout, /DENTRO DA TOLERANCIA/);
    assert.match(ruim.stdout, /FORA DA TOLERANCIA:\n {2}facil \/ rounds por partida/);
  } finally {
    rmSync(pasta, { recursive: true, force: true });
  }
});
