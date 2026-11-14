import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mod } from './_repo.mjs';

const { criarColetor, GAP_ENCONTRO } = await mod('tools/metricas.mjs');
const { resumoPartida } = await mod('tools/baseline.mjs');
const carregar = (nome) => mod(`packages/sim/src/${nome}.js`);

const bot = (alvoId, percepcao = []) => ({ id: 1, vivo: true, cerebro: { alvoId, desencalhes: 0, percepcao } });
const DT = 0.1;
// Alimenta passos sintéticos: cada item é { alvoId, eventos, fora }.
// No sim o coletor roda depois de `passo()`: `t` é o tempo já avançado e a amostra de percepção deste passo
// (`registrarVistos`) leva o tempo de antes dele, ou seja, o `t` do passo anterior. `fora: true` = alvo guardado
// mas sem amostra nova neste passo (fora da visada).
function alimentar(coletor, passos) {
  passos.forEach((p, n) => {
    const percepcao = p.alvoId !== null && !p.fora ? [{ id: p.alvoId, t: (n - 1) * DT, pos: { x: 0, y: 0, z: 0 } }] : [];
    coletor.passo({ n, t: n * DT, round: 1, entidades: [bot(p.alvoId, percepcao)], eventos: p.eventos ?? [] });
  });
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

test('coletor: alvo morto não conta como bot mudo', () => {
  // O `alvoId` fica velho depois que o alvo morre: 4 s apontando para um morto não é bot mudo.
  const c = criarColetor();
  const passos = Array.from({ length: 40 }, () => ({ alvoId: 7 }));
  passos[1] = { alvoId: 7, eventos: [{ tipo: 'morte', vitima: 7, assassino: 2, arma: 'rifle' }] };
  alimentar(c, passos);
  c.fimRound([bot(7)]);
  assert.equal(c.resultado().botsMudos, 0);
});

test('coletor: alvo fora da visada não conta como bot mudo', () => {
  // `alvoId` persiste um tempo depois de perder o alvo de vista: 4 s guardando alvo sem vê-lo não é bot mudo.
  const c = criarColetor();
  alimentar(c, Array.from({ length: 40 }, () => ({ alvoId: 7, fora: true })));
  c.fimRound([bot(7)]);
  assert.equal(c.resultado().botsMudos, 0);
  assert.equal(c.resultado().encontros, 1, 'o encontro continua aberto: só o tempo mudo exige visada');

  // Vê só 2 s dos 4 (abaixo de MUDO_MIN): também não é mudo; vendo 3,5 s é.
  const d = criarColetor();
  alimentar(d, Array.from({ length: 40 }, (_, i) => ({ alvoId: 7, fora: i % 2 === 0 || i >= 36 })));
  d.fimRound([bot(7)]);
  assert.equal(d.resultado().botsMudos, 0);
  const e = criarColetor();
  alimentar(e, Array.from({ length: 40 }, (_, i) => ({ alvoId: 7, fora: i < 4 })));
  e.fimRound([bot(7)]);
  assert.equal(e.resultado().botsMudos, 1);
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
