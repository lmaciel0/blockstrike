import { describe, expect, test } from 'vitest';
import { criarMao, moverMao } from '../src/mao.js';
import { criarRng } from '../src/rng.js';
import type { EstadoMao, PerfilMao, Rng } from '../src/tipos.js';

// Perfil médio (valor inicial da Task 6) sem tremor: os testes de dinâmica ficam determinísticos e exatos.
const MEDIO: PerfilMao = { atraso: 0.4, firmeza: 12, amortecimento: 0.6, acelMax: 90, tremor: 0, previsao: 0.7 };
const DT = 1 / 60;
const angulo = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));

interface Passo { yaw: number; pitch: number; vYaw: number; vPitch: number }

// Roda `passos` chamadas seguidas de `moverMao` (tempo começa em 0) e devolve o estado depois de cada uma.
function rodar(
  de: { yaw: number; pitch: number }, alvo: { yaw: number; pitch: number }, passos: number,
  { perfil = MEDIO, dt = DT, rng = criarRng(1), m = criarMao() }: {
    perfil?: PerfilMao; dt?: number; rng?: Rng; m?: EstadoMao;
  } = {},
): Passo[] {
  const saida: Passo[] = [];
  let atual = de;
  for (let i = 0; i < passos; i++) {
    atual = moverMao(atual, alvo, m, perfil, i * dt, dt, rng);
    saida.push({ ...atual, vYaw: m.vYaw, vPitch: m.vPitch });
  }
  return saida;
}

describe('mão virtual', () => {
  test('criarMao: tudo zerado e nunca usada', () => {
    expect(criarMao()).toStrictEqual({
      vYaw: 0, vPitch: 0, tremor: { yaw: 0, pitch: 0 }, tremorAte: 0, usadaEm: -Infinity,
    });
  });

  test('mão: converge para alvo parado', () => {
    const passos = rodar({ yaw: 0, pitch: 0 }, { yaw: 1, pitch: 0 }, Math.round(1.5 / DT));
    const fim = passos.at(-1)!;
    expect(Math.abs(fim.yaw - 1)).toBeLessThan(0.01);
    expect(Math.abs(fim.pitch)).toBeLessThan(1e-12);
  });

  test('mão: passa do alvo e corrige com ζ < 1', () => {
    const passos = rodar({ yaw: 0, pitch: 0 }, { yaw: 1, pitch: 0 }, Math.round(1.5 / DT));
    expect(passos.some((p) => p.yaw > 1)).toBe(true);
    expect(Math.abs(passos.at(-1)!.yaw - 1)).toBeLessThan(0.01);
  });

  test('mão: aceleração limitada', () => {
    // Degrau grande nos dois eixos: sem o limite, ω²·e pediria 144·3 rad/s².
    const passos = rodar({ yaw: 0, pitch: 0 }, { yaw: 3, pitch: -1.2 }, Math.round(2 / DT));
    let antes = { vYaw: 0, vPitch: 0 };
    for (const p of passos) {
      expect(Math.abs(p.vYaw - antes.vYaw)).toBeLessThanOrEqual(MEDIO.acelMax * DT + 1e-6);
      expect(Math.abs(p.vPitch - antes.vPitch)).toBeLessThanOrEqual(MEDIO.acelMax * DT + 1e-6);
      antes = p;
    }
    // O limite chegou a valer (senão o teste não prova nada).
    expect(Math.abs(passos[0]!.vYaw)).toBeCloseTo(MEDIO.acelMax * DT, 9);
  });

  test('mão: menor caminho no yaw', () => {
    const de = -Math.PI + 0.1;
    const alvo = Math.PI - 0.1;
    const passos = rodar({ yaw: de, pitch: 0 }, { yaw: alvo, pitch: 0 }, Math.round(1.5 / DT));
    // O caminho curto (0,2 rad) atravessa ±π descendo; o longo subiria quase 2π.
    expect(passos[0]!.yaw).toBeLessThan(de);
    for (const p of passos) expect(p.yaw - de).toBeLessThanOrEqual(0.5);
    expect(Math.abs(angulo(passos.at(-1)!.yaw - alvo))).toBeLessThan(0.01);
  });

  test('mão: estável com dt de 0,05', () => {
    const dt = 0.05;
    const passos = rodar({ yaw: 0, pitch: 0.3 }, { yaw: -2, pitch: -0.4 }, Math.round(5 / dt), { dt });
    for (const p of passos) {
      expect(Number.isFinite(p.yaw) && Number.isFinite(p.pitch)).toBe(true);
    }
    const fim = passos.at(-1)!;
    expect(Math.abs(fim.yaw + 2)).toBeLessThan(0.01);
    expect(Math.abs(fim.pitch + 0.4)).toBeLessThan(0.01);
  });

  test('mão: velocidade zera depois de um tempo sem uso', () => {
    const alvo = { yaw: 1, pitch: 0 };
    const m = criarMao();
    const rng = criarRng(3);
    const p1 = moverMao({ yaw: 0, pitch: 0 }, alvo, m, MEDIO, 0, DT, rng);
    expect(m.vYaw).toBeGreaterThan(0);

    // Mesma mão, mesmo ponto de partida: uma chamada logo em seguida e outra 0,5 s depois.
    const semPausa = structuredClone(m);
    const comPausa = structuredClone(m);
    const dSem = moverMao(p1, alvo, semPausa, MEDIO, DT, DT, criarRng(4)).yaw - p1.yaw;
    const dCom = moverMao(p1, alvo, comPausa, MEDIO, DT + 0.5, DT, criarRng(4)).yaw - p1.yaw;
    expect(dCom).toBeGreaterThan(0);
    expect(dCom).toBeLessThan(dSem);
    // Depois da pausa a mão parte parada, como uma recém-criada no mesmo ponto.
    const nova = moverMao(p1, alvo, criarMao(), MEDIO, DT + 0.5, DT, criarRng(4)).yaw - p1.yaw;
    expect(dCom).toBe(nova);
    expect(comPausa.usadaEm).toBe(DT + 0.5);
  });

  test('mão: tremor determinístico pela seed e com desvio da ordem de perfil.tremor', () => {
    const perfil = { ...MEDIO, tremor: 0.008 };
    const alvo = { yaw: 0.5, pitch: 0.1 };
    const passos = Math.round(10 / DT);
    const a = rodar(alvo, alvo, passos, { perfil, rng: criarRng(7) });
    const b = rodar(alvo, alvo, passos, { perfil, rng: criarRng(7) });
    expect(a).toStrictEqual(b);

    // Regime: descarta o primeiro segundo.
    const erros = a.slice(Math.round(1 / DT)).map((p) => p.yaw - alvo.yaw);
    const media = erros.reduce((s, e) => s + e, 0) / erros.length;
    const desvio = Math.sqrt(erros.reduce((s, e) => s + (e - media) ** 2, 0) / erros.length);
    expect(desvio).toBeGreaterThan(0.002);
    expect(desvio).toBeLessThan(0.02);

    // Outra seed treme diferente.
    const c = rodar(alvo, alvo, passos, { perfil, rng: criarRng(8) });
    expect(c).not.toStrictEqual(a);
  });
});

describe('mão virtual: feedforward de velocidade', () => {
  // Alvo em rampa: yaw = 0,2 + w·t (rad). Mão começa em cima do alvo, com a velocidade dele.
  const W = 0.27; // ≈ 4 m/s de lado a 15 m
  function erroFinal(comVel: boolean): number {
    const m = criarMao();
    const rng = criarRng(1);
    let atual = { yaw: 0.2, pitch: 0 };
    let erro = 0;
    for (let i = 0; i < 120; i++) {
      const t = i * DT;
      const alvo = { yaw: 0.2 + W * (t + DT), pitch: 0 };
      atual = comVel
        ? moverMao(atual, alvo, m, MEDIO, t, DT, rng, { yaw: W, pitch: 0 })
        : moverMao(atual, alvo, m, MEDIO, t, DT, rng);
      erro = angulo(alvo.yaw - atual.yaw);
    }
    return erro;
  }

  test('sem velocidade do alvo: erro de regime ≈ 2ζ·w/ω (comportamento antigo)', () => {
    const esperado = (2 * MEDIO.amortecimento * W) / MEDIO.firmeza;
    expect(erroFinal(false)).toBeCloseTo(esperado, 2);
  });

  test('com velocidade do alvo: erro de regime vai a ~0', () => {
    // Sobra só a discretização (o alvo pula W·DT por quadro): menos de um quadro de movimento, ~8× menor que sem.
    expect(Math.abs(erroFinal(true))).toBeLessThan(W * DT);
  });

  test('velocidade do alvo zero: igual a não passar nada', () => {
    const a = rodar({ yaw: 0, pitch: 0 }, { yaw: 1, pitch: 0.2 }, 40);
    const m = criarMao();
    const rng = criarRng(1);
    let atual = { yaw: 0, pitch: 0 };
    const b: Passo[] = [];
    for (let i = 0; i < 40; i++) {
      atual = moverMao(atual, { yaw: 1, pitch: 0.2 }, m, MEDIO, i * DT, DT, rng, { yaw: 0, pitch: 0 });
      b.push({ ...atual, vYaw: m.vYaw, vPitch: m.vPitch });
    }
    expect(b).toEqual(a);
  });
});
