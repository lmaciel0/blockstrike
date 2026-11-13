import test from 'node:test';
import assert from 'node:assert/strict';
import { mod } from './_repo.mjs';

const { criarSons, ganhoDistancia } = await mod('packages/client/src/sons.js');

// AudioContext falso: registra nós criados, conexões e fontes iniciadas.
function contextoFalso() {
  const log = { nos: [], inicios: [], entradas: [] };
  const param = (v = 0) => ({
    value: v, eventos: [],
    setValueAtTime(x, t) { this.eventos.push(['set', x, t]); },
    linearRampToValueAtTime(x, t) { this.eventos.push(['lin', x, t]); },
    exponentialRampToValueAtTime(x, t) {
      assert.ok(x > 0, 'rampa exponencial não aceita 0');
      this.eventos.push(['exp', x, t]);
    },
  });
  const no = (tipo, extra = {}) => {
    const n = { tipo, conectados: [], connect(d) { this.conectados.push(d); return d; }, ...extra };
    log.nos.push(n);
    return n;
  };
  const fonte = (tipo, extra) => no(tipo, {
    ...extra,
    start(t) { log.inicios.push({ tipo, t }); },
    stop() {},
  });
  const ctx = {
    currentTime: 10, sampleRate: 8000, destination: no('destino'),
    createGain() {
      const g = no('gain', { gain: param(1) });
      return g;
    },
    createBiquadFilter: () => no('filtro', { type: '', frequency: param(350), Q: param(1) }),
    createStereoPanner: () => no('pan', { pan: param(0) }),
    createDynamicsCompressor: () => no('comp', { threshold: param(), ratio: param() }),
    createOscillator: () => fonte('osc', { type: '', frequency: param(440) }),
    createBufferSource: () => fonte('ruido', { buffer: null }),
    createBuffer: (_c, n) => ({ getChannelData: () => new Float32Array(n) }),
  };
  return { ctx, log };
}

const sonsCom = (ctx) => criarSons({ contexto: () => ctx });

test('sem contexto (som desligado) nada quebra nem toca', () => {
  const s = sonsCom(null);
  s.tiro('rifle', 0);
  s.recarga(2.5);
  s.golpe(true, 'corpo');
  s.fimRound(true);
});

test('tiro toca camadas de ruído e tom, no relógio do áudio', () => {
  const { ctx, log } = contextoFalso();
  const s = sonsCom(ctx);
  s.tiro('rifle', 0);
  assert.ok(log.inicios.filter((i) => i.tipo === 'ruido').length >= 2);
  assert.ok(log.inicios.some((i) => i.tipo === 'osc'));
  assert.ok(log.inicios.every((i) => i.t >= 10));
});

test('volume cai com a distância e some no limite', () => {
  assert.equal(ganhoDistancia(0), 1);
  assert.ok(ganhoDistancia(5) > 0.9);
  assert.ok(ganhoDistancia(30) < ganhoDistancia(10));
  assert.equal(ganhoDistancia(70), 0);
  const { ctx, log } = contextoFalso();
  const s = sonsCom(ctx);
  s.tiro('rifle', 200);
  assert.equal(log.inicios.length, 0);
});

test('recarga agenda os cliques ao longo da duração', () => {
  const { ctx, log } = contextoFalso();
  sonsCom(ctx).recarga(2);
  const tempos = log.inicios.map((i) => i.t - 10);
  assert.ok(Math.min(...tempos) > 0.1 && Math.max(...tempos) > 1.6 && Math.max(...tempos) < 2.1);
});

test('fim de round sequencia notas sem setTimeout', () => {
  const { ctx, log } = contextoFalso();
  const antes = globalThis.setTimeout;
  globalThis.setTimeout = () => assert.fail('não deve usar setTimeout');
  try {
    sonsCom(ctx).fimRound(true);
  } finally {
    globalThis.setTimeout = antes;
  }
  const tempos = [...new Set(log.inicios.map((i) => i.t))];
  assert.equal(tempos.length, 4);
});

test('volume mestre limitado a [0,1]', () => {
  const { ctx, log } = contextoFalso();
  const s = sonsCom(ctx);
  s.acerto(true);
  s.definirVolume(3);
  const mestre = log.nos.find((n) => n.tipo === 'gain');
  assert.equal(mestre.gain.value, 1);
  s.definirVolume(-1);
  assert.equal(mestre.gain.value, 0);
});

test('todas as funções tocam algo perto', () => {
  const { ctx, log } = contextoFalso();
  const s = sonsCom(ctx);
  const chamadas = [
    () => s.passo(2, 0.3), () => s.pouso(), () => s.pulo(), () => s.acerto(false), () => s.dano(),
    () => s.abate(true), () => s.morte(), () => s.inicioRound(), () => s.bipe(), () => s.fimRound(false),
    () => s.saque('rifle'), () => s.saque('faca'), () => s.golpe(false, 'parede'), () => s.ricochete(3),
    () => s.vazio(), () => s.oof(4, -0.3), () => s.compra(), () => s.arremesso(), () => s.quiqueGranada(3), () => s.he(5), () => s.flash(5), () => s.zumbido(2), () => s.fumaca(5), () => s.bipC4(3, 0.2, 8), () => s.acaoC4("plantar"), () => s.acaoC4("desarmar", 2), () => s.plantada(), () => s.desarmada(), () => s.explosao(10, 0.4), ...['rifle', 'smg', 'sniper', 'escopeta', 'pistola'].map((t) => () => s.tiro(t, 5, -0.5)),
  ];
  for (const f of chamadas) {
    const n = log.inicios.length;
    f();
    assert.ok(log.inicios.length > n, f.toString());
  }
});
