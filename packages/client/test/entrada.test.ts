// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { criarEntradaTecladoMouse } from '../src/entrada';

/** O jsdom não preenche `movementX`/`movementY`: define a propriedade no evento. */
function mover(movementX: number, movementY = 0): void {
  const e = new MouseEvent('mousemove');
  Object.defineProperty(e, 'movementX', { value: movementX });
  Object.defineProperty(e, 'movementY', { value: movementY });
  document.dispatchEvent(e);
}

function tecla(tipo: 'keydown' | 'keyup', code: string): void {
  document.dispatchEvent(new KeyboardEvent(tipo, { code }));
}

/** Simula o pointer lock: o jsdom não implementa `pointerLockElement`. */
function travarEm(el: Element | null): void {
  Object.defineProperty(document, 'pointerLockElement', { value: el, configurable: true });
}

afterEach(() => travarEm(null));

describe('criarEntradaTecladoMouse', () => {
  it('liga: W vira avanço e mousemove travado vira yaw absoluto menor', () => {
    const canvas = document.createElement('canvas');
    travarEm(canvas);
    const entrada = criarEntradaTecladoMouse(canvas);
    entrada.ligar();
    tecla('keydown', 'KeyW');
    mover(10);
    const cmd = entrada.comando(0, 0);
    expect(cmd.frente).toBeGreaterThan(0);
    expect(cmd.yaw).toBeLessThan(0);
    entrada.desligar();
  });

  it('desligar: os mesmos eventos não alteram o comando', () => {
    const canvas = document.createElement('canvas');
    travarEm(canvas);
    const entrada = criarEntradaTecladoMouse(canvas);
    entrada.ligar();
    entrada.desligar();
    tecla('keydown', 'KeyW');
    mover(10);
    const cmd = entrada.comando(0, 0);
    expect(cmd.frente).toBe(0);
    expect(cmd.yaw).toBe(0);
  });

  it('mousemove sem pointer lock no canvas é ignorado', () => {
    const canvas = document.createElement('canvas');
    const entrada = criarEntradaTecladoMouse(canvas);
    entrada.ligar();
    mover(10);
    expect(entrada.comando(0, 0).yaw).toBe(0);
    entrada.desligar();
  });
});
