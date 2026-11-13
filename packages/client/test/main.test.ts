// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// O jogo real precisa de WebGL: aqui só interessa o caminho de boot do main.
const iniciar = vi.fn(() => ({ pausar() {}, retomar() {}, destruir() {} }));
vi.mock('../src/index', () => ({ iniciar }));

describe('boot do main com localStorage bloqueado', () => {
  beforeEach(() => {
    vi.resetModules();
    iniciar.mockClear();
    document.body.innerHTML = '<div id="view-blockstrike"></div>';
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('getter de localStorage que lança SecurityError não derruba o carregamento', async () => {
    vi.spyOn(globalThis, 'localStorage', 'get').mockImplementation(() => {
      throw new DOMException('bloqueado', 'SecurityError');
    });
    await expect(import('../src/main')).resolves.toBeDefined();
    expect(iniciar).toHaveBeenCalledTimes(1);
  });
});
