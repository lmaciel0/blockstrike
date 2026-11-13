import { expect, it, vi } from 'vitest';
import { criarSons, ganhoDistancia } from '../src/sons';

interface Param {
  value: number;
  eventos: Array<[string, number, number]>;
  setValueAtTime(x: number, t: number): void;
  linearRampToValueAtTime(x: number, t: number): void;
  exponentialRampToValueAtTime(x: number, t: number): void;
}

interface No {
  tipo: string;
  conectados: unknown[];
  gain?: Param;
  connect(destino: unknown): unknown;
}

// AudioContext falso: registra nós criados, conexões e fontes iniciadas.
function contextoFalso() {
  const log = { nos: [] as No[], inicios: [] as Array<{ tipo: string; t: number }>, entradas: [] as unknown[] };
  const param = (v = 0): Param => ({
    value: v,
    eventos: [],
    setValueAtTime(x, t) { this.eventos.push(['set', x, t]); },
    linearRampToValueAtTime(x, t) { this.eventos.push(['lin', x, t]); },
    exponentialRampToValueAtTime(x, t) {
      expect(x, 'rampa exponencial não aceita 0').toBeGreaterThan(0);
      this.eventos.push(['exp', x, t]);
    },
  });
  const no = (tipo: string, extra: object = {}): No => {
    const n: No = {
      tipo, conectados: [], connect(d: unknown) { this.conectados.push(d); return d; }, ...extra,
    };
    log.nos.push(n);
    return n;
  };
  const fonte = (tipo: string, extra: object) => no(tipo, {
    ...extra,
    start(t: number) { log.inicios.push({ tipo, t }); },
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
    createBuffer: (_c: number, n: number) => ({ getChannelData: () => new Float32Array(n) }),
  };
  return { ctx: ctx as unknown as AudioContext, log };
}

const sonsCom = (ctx: AudioContext | null) => criarSons({ contexto: () => ctx });

it('sem contexto (som desligado) nada quebra nem toca', () => {
  const s = sonsCom(null);
  s.tiro('rifle', 0);
  s.recarga(2.5);
  s.golpe(true, 'corpo');
  s.fimRound(true);
});

it('tiro toca camadas de ruído e tom, no relógio do áudio', () => {
  const { ctx, log } = contextoFalso();
  const s = sonsCom(ctx);
  s.tiro('rifle', 0);
  expect(log.inicios.filter((i) => i.tipo === 'ruido').length).toBeGreaterThanOrEqual(2);
  expect(log.inicios.some((i) => i.tipo === 'osc')).toBe(true);
  expect(log.inicios.every((i) => i.t >= 10)).toBe(true);
});

it('volume cai com a distância e some no limite', () => {
  expect(ganhoDistancia(0)).toBe(1);
  expect(ganhoDistancia(5)).toBeGreaterThan(0.9);
  expect(ganhoDistancia(30)).toBeLessThan(ganhoDistancia(10));
  expect(ganhoDistancia(70)).toBe(0);
  const { ctx, log } = contextoFalso();
  const s = sonsCom(ctx);
  s.tiro('rifle', 200);
  expect(log.inicios).toHaveLength(0);
});

it('recarga agenda os cliques ao longo da duração', () => {
  const { ctx, log } = contextoFalso();
  sonsCom(ctx).recarga(2);
  const tempos = log.inicios.map((i) => i.t - 10);
  expect(Math.min(...tempos)).toBeGreaterThan(0.1);
  expect(Math.max(...tempos)).toBeGreaterThan(1.6);
  expect(Math.max(...tempos)).toBeLessThan(2.1);
});

it('fim de round sequencia notas sem setTimeout', () => {
  const { ctx, log } = contextoFalso();
  const espiao = vi.spyOn(globalThis, 'setTimeout').mockImplementation(() => {
    throw new Error('não deve usar setTimeout');
  });
  try {
    sonsCom(ctx).fimRound(true);
  } finally {
    espiao.mockRestore();
  }
  const tempos = [...new Set(log.inicios.map((i) => i.t))];
  expect(tempos).toHaveLength(4);
});

it('volume mestre limitado a [0,1]', () => {
  const { ctx, log } = contextoFalso();
  const s = sonsCom(ctx);
  s.acerto(true);
  s.definirVolume(3);
  const mestre = log.nos.find((n) => n.tipo === 'gain');
  expect(mestre?.gain?.value).toBe(1);
  s.definirVolume(-1);
  expect(mestre?.gain?.value).toBe(0);
});

it('todas as funções tocam algo perto', () => {
  const { ctx, log } = contextoFalso();
  const s = sonsCom(ctx);
  const chamadas: Array<() => void> = [
    () => s.passo(2, 0.3), () => s.pouso(), () => s.pulo(), () => s.acerto(false), () => s.dano(),
    () => s.abate(true), () => s.morte(), () => s.inicioRound(), () => s.bipe(), () => s.fimRound(false),
    () => s.saque('rifle'), () => s.saque('faca'), () => s.golpe(false, 'parede'), () => s.ricochete(3),
    () => s.vazio(), () => s.oof(4, -0.3), () => s.compra(), () => s.arremesso(), () => s.quiqueGranada(3),
    () => s.he(5), () => s.flash(5), () => s.zumbido(2), () => s.fumaca(5), () => s.bipC4(3, 0.2, 8),
    () => s.acaoC4('plantar'), () => s.acaoC4('desarmar', 2), () => s.plantada(), () => s.desarmada(),
    () => s.explosao(10, 0.4),
    ...(['rifle', 'smg', 'sniper', 'escopeta', 'pistola'] as const).map((t) => () => s.tiro(t, 5, -0.5)),
  ];
  for (const f of chamadas) {
    const n = log.inicios.length;
    f();
    expect(log.inicios.length, f.toString()).toBeGreaterThan(n);
  }
});
