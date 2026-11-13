// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { iniciar } from '../src/index';
import { criarStorage, type Portas } from '../src/portas';

function criarPortas(): Portas {
  return {
    audio: { contexto: () => null },
    storage: criarStorage('bs-teste:', undefined),
    confetti: () => {},
  };
}

// jsdom não tem matchMedia: simula só as duas consultas que o jogo faz.
function simularPonteiro(grosso: boolean, fino: boolean): void {
  vi.stubGlobal('matchMedia', (consulta: string) => ({
    matches: consulta === '(pointer: coarse)' ? grosso : consulta === '(pointer: fine)' ? fino : false,
  }));
}

describe('ambiente sem condições de jogo', () => {
  let raiz: HTMLElement;

  beforeEach(() => {
    raiz = document.createElement('div');
    document.body.append(raiz);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    raiz.remove();
  });

  it('só toque: mostra "Disponível apenas no computador" e a instância não faz nada', () => {
    simularPonteiro(true, false);
    const instancia = iniciar(raiz, criarPortas());
    const aviso = raiz.querySelector('#bs-aviso');
    expect(aviso?.textContent).toBe('Disponível apenas no computador');
    expect((aviso as HTMLElement).hidden).toBe(false);
    expect(() => {
      instancia.pausar();
      instancia.retomar();
      instancia.destruir();
    }).not.toThrow();
  });

  it('sem WebGL (getContext nulo): mostra a mensagem de WebGL', () => {
    simularPonteiro(false, true);
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const instancia = iniciar(raiz, criarPortas());
    expect(raiz.querySelector('#bs-aviso')?.textContent).toBe('Seu navegador não suporta WebGL');
    expect(() => {
      instancia.pausar();
      instancia.retomar();
      instancia.destruir();
    }).not.toThrow();
  });

  it('chamar iniciar de novo na mesma raiz derruba a instância anterior', () => {
    simularPonteiro(true, false);
    const portas = criarPortas();
    const anterior = iniciar(raiz, portas);
    const destruirAnterior = vi.spyOn(anterior, 'destruir');
    const nova = iniciar(raiz, portas);
    expect(destruirAnterior).toHaveBeenCalledTimes(1);
    expect(nova).not.toBe(anterior);
    expect(raiz.querySelectorAll('canvas')).toHaveLength(1);
  });
});
