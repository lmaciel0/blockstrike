import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mod } from './_repo.mjs';

const { criarColetor, GAP_ENCONTRO } = await mod('tools/metricas.mjs');
const { resumoPartida } = await mod('tools/baseline.mjs');
const carregar = (nome) => mod(`packages/sim/src/${nome}.js`);

const bot = (alvoId) => ({ id: 1, vivo: true, cerebro: { alvoId, desencalhes: 0 } });
const DT = 0.1;
// Alimenta passos sintéticos: cada item é { alvoId, eventos }.
function alimentar(coletor, passos) {
  passos.forEach((p, n) => coletor.passo({ n, t: n * DT, round: 1, entidades: [bot(p.alvoId)], eventos: p.eventos ?? [] }));
}

test('coletor: encontro com acerto mede o tempo desde que viu', () => {
  const c = criarColetor();
  alimentar(c, [
    { alvoId: null },
    { alvoId: 7 },
    { alvoId: 7 },
    { alvoId: 7, eventos: [{ tipo: 'acerto', atirador: 1, alvo: 7 }] },
  ]);
  c.fimRound([bot(7)]);
  const m = c.resultado();
  assert.equal(m.primeirosAcertos.length, 1);
  assert.ok(Math.abs(m.primeirosAcertos[0] - 0.2) < 1e-9, `${m.primeirosAcertos}`);
  assert.equal(m.encontros, 1);
  assert.equal(m.encontrosSemAcerto, 0);
});

test('coletor: encontro que termina sem acerto é contado à parte', () => {
  const c = criarColetor();
  alimentar(c, [{ alvoId: 7 }, { alvoId: 7 }, { alvoId: null }]);
  c.fimRound([bot(null)]);
  const m = c.resultado();
  assert.equal(m.encontros, 1);
  assert.equal(m.encontrosSemAcerto, 1);
  assert.deepEqual(m.primeirosAcertos, []);
});

test('coletor: troca de alvo e volta não fragmenta o encontro', () => {
  const c = criarColetor();
  alimentar(c, [
    { alvoId: 7 },
    { alvoId: 9 },
    { alvoId: 7 },
    { alvoId: 7, eventos: [{ tipo: 'acerto', atirador: 1, alvo: 7 }] },
  ]);
  c.fimRound([bot(7)]);
  const m = c.resultado();
  assert.equal(m.encontros, 2, 'pares (bot,7) e (bot,9), cada um uma vez');
  assert.equal(m.primeirosAcertos.length, 1);
  assert.ok(Math.abs(m.primeirosAcertos[0] - 0.3) < 1e-9, `medido desde o primeiro 7: ${m.primeirosAcertos}`);
  assert.equal(m.encontrosSemAcerto, 1, 'só o par com o 9');
});

test('coletor: lacuna maior que 2 s abre encontro novo', () => {
  assert.equal(GAP_ENCONTRO, 2);
  const c = criarColetor();
  const passos = [{ alvoId: 7 }];
  for (let i = 0; i < 25; i++) passos.push({ alvoId: null }); // t de 0,1 a 2,5: mais de 2 s sem o 7
  passos.push({ alvoId: 7 }); // passo 26, t = 2,6
  passos.push({ alvoId: 7, eventos: [{ tipo: 'acerto', atirador: 1, alvo: 7 }] }); // passo 27, t = 2,7
  alimentar(c, passos);
  c.fimRound([bot(7)]);
  const m = c.resultado();
  assert.equal(m.encontros, 2);
  assert.equal(m.encontrosSemAcerto, 1, 'o primeiro encontro fechou sem acerto');
  assert.equal(m.primeirosAcertos.length, 1);
  assert.ok(Math.abs(m.primeirosAcertos[0] - 0.1) < 1e-9, `${m.primeirosAcertos}`);
});

test('coletor: alvo que morre fecha o encontro', () => {
  const c = criarColetor();
  alimentar(c, [
    { alvoId: 7 },
    { alvoId: 7, eventos: [{ tipo: 'morte', vitima: 7, assassino: 2, arma: 'rifle' }] },
    { alvoId: 7 }, // `alvoId` velho de alvo morto: não reabre o encontro
    { alvoId: 7 },
  ]);
  c.fimRound([bot(7)]);
  const m = c.resultado();
  assert.equal(m.encontros, 1);
  assert.equal(m.encontrosSemAcerto, 1);
});

test('coletor: kills por arma', () => {
  const c = criarColetor();
  alimentar(c, [{
    alvoId: null,
    eventos: [
      { tipo: 'morte', vitima: 5, assassino: 1, arma: 'rifle' },
      { tipo: 'morte', vitima: 6, assassino: 1, arma: 'rifle' },
      { tipo: 'morte', vitima: 7, assassino: 1, arma: 'smg' },
    ],
  }]);
  assert.deepEqual(c.resultado().killsPorArma, { rifle: 2, smg: 1 });
});

test('coletor: bot mudo tem alvo por 3 s ou mais sem emitir tiro', () => {
  const c = criarColetor();
  const passos = Array.from({ length: 40 }, () => ({ alvoId: 7 })); // 4 s com alvo, nenhum tiro
  alimentar(c, passos);
  c.fimRound([bot(7)]);
  assert.equal(c.resultado().botsMudos, 1);

  const d = criarColetor();
  alimentar(d, passos.map((p, i) => (i === 5 ? { ...p, eventos: [{ tipo: 'tiro', atirador: 1, arma: 'rifle' }] } : p)));
  d.fimRound([bot(7)]);
  assert.equal(d.resultado().botsMudos, 0);
});

test('coletor: soma desencalhes dos cérebros no fim do round, uma vez por cérebro', () => {
  const c = criarColetor();
  const b = { id: 1, vivo: true, cerebro: { alvoId: null, desencalhes: 3 } };
  c.fimRound([b]);
  c.fimRound([b]);
  assert.equal(c.resultado().desencalhes, 3);
});

test('resumoPartida sem metricas não muda', async () => {
  const opcoes = { modo: 'fixo', dt: 1 / 60 };
  const a = await resumoPartida(carregar, 'medio', 3, opcoes);
  const b = await resumoPartida(carregar, 'medio', 3, opcoes, { metricas: true });
  assert.ok(!('metricas' in a));
  assert.ok('metricas' in b);
  const { metricas, ...resto } = b;
  assert.deepEqual(resto, a);
  assert.ok(metricas.encontros > 0);
  assert.ok(Object.keys(metricas.killsPorArma).length > 0);
});
