import { describe, expect, test } from 'vitest';
import { JANELA_PERCEPCAO, percebido, registrarVistos, velocidadePercebida } from '../src/percepcao.js';
import type { Amostra } from '../src/tipos.js';

const DT = 1 / 60;
const alvo = (id: number, x: number) => ({ id, pos: { x, y: 0, z: 0 }, agachado: false });

// Simula `passos` ticks com o alvo `id` visível, andando a `vel` m/s em x, e devolve o tempo final.
function ver(amostras: Amostra[], id: number, de: number, passos: number, vel = 0): number {
  let t = de;
  for (let i = 0; i < passos; i++) {
    registrarVistos(amostras, [alvo(id, vel * t)], t, JANELA_PERCEPCAO);
    t += DT;
  }
  return t;
}

describe('percepção atrasada', () => {
  test('percebido: null antes do atraso', () => {
    const amostras: Amostra[] = [];
    ver(amostras, 1, 0, 60);
    expect(percebido(amostras, 1, 0.39, 0.4)).toBeNull();
    const a = percebido(amostras, 1, 0.41, 0.4);
    expect(a).not.toBeNull();
    expect(a!.t).toBeLessThanOrEqual(0.01 + 1e-9);
  });

  test('percebido: alvo andando fica atrás pelo atraso', () => {
    const amostras: Amostra[] = [];
    ver(amostras, 1, 0, 61, 5); // amostras de t=0 a t=1
    const a = percebido(amostras, 1, 1, 0.4);
    expect(a).not.toBeNull();
    expect(Math.abs(a!.pos.x - 5 * 0.6)).toBeLessThanOrEqual(5 * DT);
  });

  test('percebido: alvo escondido mantém a última amostra', () => {
    const amostras: Amostra[] = [];
    ver(amostras, 1, 0, 31, 5); // visto até t=0,5
    const a = percebido(amostras, 1, 1.2, 0.4);
    expect(a).not.toBeNull();
    expect(a!.t).toBeLessThanOrEqual(0.5 + 1e-9);
    expect(a!.t).toBeGreaterThan(0.5 - 2 * DT); // a última, não uma antiga
  });

  test('registrarVistos: poda o que passou da janela', () => {
    const amostras: Amostra[] = [];
    registrarVistos(amostras, [alvo(1, 0)], 0, 2);
    registrarVistos(amostras, [alvo(1, 1)], 1, 2);
    registrarVistos(amostras, [], 2.1, 2);
    expect(amostras.map((a) => a.t)).toEqual([1]);
  });

  test('percebido: id nunca visto → null', () => {
    const amostras: Amostra[] = [];
    ver(amostras, 1, 0, 60);
    expect(percebido(amostras, 2, 1, 0.4)).toBeNull();
  });

  test('registrarVistos: copia a posição (não guarda a referência) e o agachado', () => {
    const amostras: Amostra[] = [];
    const v = { id: 3, pos: { x: 1, y: 0, z: 2 }, agachado: true };
    registrarVistos(amostras, [v], 0, 2);
    v.pos.x = 99;
    expect(amostras[0]!.pos.x).toBe(1);
    expect(amostras[0]!.agachado).toBe(true);
  });

  test('percebido: com vários ids, devolve só o do id pedido', () => {
    const amostras: Amostra[] = [];
    registrarVistos(amostras, [alvo(1, 10), alvo(2, 20)], 0, 2);
    registrarVistos(amostras, [alvo(1, 11), alvo(2, 21)], 0.5, 2);
    expect(percebido(amostras, 2, 0.8, 0.2)!.pos.x).toBe(21);
    expect(percebido(amostras, 1, 0.8, 0.2)!.pos.x).toBe(11);
  });

  // Previsão (Task 7b): velocidade a partir de duas amostras percebidas (p e a de ~0,1 s antes dela).
  test('velocidadePercebida: alvo a 5 m/s em x dá v.x ≈ 5', () => {
    const amostras: Amostra[] = [];
    ver(amostras, 1, 0, 61, 5); // amostras de t=0 a t=1
    const v = velocidadePercebida(amostras, 1, 1, 0.4);
    expect(Math.abs(v.x - 5)).toBeLessThanOrEqual(0.1);
    expect(Math.abs(v.z)).toBeLessThanOrEqual(1e-9);
  });

  test('velocidadePercebida: uma só amostra dá zero', () => {
    const amostras: Amostra[] = [];
    registrarVistos(amostras, [alvo(1, 3)], 0, JANELA_PERCEPCAO);
    expect(velocidadePercebida(amostras, 1, 0.5, 0.4)).toEqual({ x: 0, z: 0 });
    expect(velocidadePercebida(amostras, 2, 0.5, 0.4)).toEqual({ x: 0, z: 0 }); // nunca visto
  });

  test('velocidadePercebida: lacuna de visada dá zero', () => {
    const amostras: Amostra[] = [];
    ver(amostras, 1, 0, 31, 5); // visto até t=0,5
    ver(amostras, 1, 0.7, 31, 5); // some de 0,5 a 0,7 e volta
    // p perto de 0,75; a anterior com t <= p.t - 0,1 é a de 0,5, do outro lado da lacuna.
    const p = percebido(amostras, 1, 1.15, 0.4)!;
    expect(p.t).toBeGreaterThan(0.7);
    expect(velocidadePercebida(amostras, 1, 1.15, 0.4)).toEqual({ x: 0, z: 0 });
  });

  // Intencional: amostras consecutivas a mais de base + 0,05 s (dt grande, > 0,15 s) são tratadas como possível
  // perda de visada — o alvo pode ter sumido e voltado entre elas —, então a velocidade vira zero e o bot não
  // adianta (previsão) um alvo que andou nesse intervalo, mesmo que ele estivesse andando de verdade.
  test('velocidadePercebida: amostras a mais de base + 0,05 s dão zero (lacuna possível, de propósito)', () => {
    const amostras: Amostra[] = [];
    for (const t of [0, 0.2, 0.4, 0.6]) registrarVistos(amostras, [alvo(1, 5 * t)], t, JANELA_PERCEPCAO); // 5 m/s, dt 0,2
    const p = percebido(amostras, 1, 1, 0.4)!;
    expect(p.t).toBeCloseTo(0.6, 9);
    expect(velocidadePercebida(amostras, 1, 1, 0.4)).toEqual({ x: 0, z: 0 });
  });
});
