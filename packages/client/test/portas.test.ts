// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { criarStorage } from '../src/portas.js';

/** Backend falso com Map, para não depender de jsdom. */
function backendEmMemoria(inicial: Record<string, string> = {}): Storage {
  const dados = new Map(Object.entries(inicial));
  return {
    get length() {
      return dados.size;
    },
    clear: () => dados.clear(),
    getItem: (k) => dados.get(k) ?? null,
    key: (i) => [...dados.keys()][i] ?? null,
    removeItem: (k) => void dados.delete(k),
    setItem: (k, v) => void dados.set(k, String(v)),
  };
}

function backendQueLanca(): Storage {
  const erro = () => {
    throw new DOMException('bloqueado', 'SecurityError');
  };
  return { ...backendEmMemoria(), getItem: erro, setItem: erro };
}

describe('criarStorage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('backend que lança: não lança e guarda em memória', () => {
    const s = criarStorage('arcade:blockstrike:', backendQueLanca());
    expect(() => s.set('a', 1)).not.toThrow();
    expect(s.get('a', 0)).toBe(1);
  });

  it('só setItem lança (cota cheia): leitura devolve o valor em memória', () => {
    const b = backendEmMemoria();
    b.setItem = () => {
      throw new DOMException('cheio', 'QuotaExceededError');
    };
    const s = criarStorage('p:', b);
    s.set('a', 5);
    expect(s.get('a', 0)).toBe(5);
  });

  it('valor salvo corrompido devolve o padrão', () => {
    const s = criarStorage('p:', backendEmMemoria({ 'p:x': '{lixo' }));
    expect(s.get('x', 7)).toBe(7);
  });

  it('valor salvo de tipo diferente do padrão devolve o padrão', () => {
    const s = criarStorage('p:', backendEmMemoria({ 'p:x': '"texto"' }));
    expect(s.get('x', 7)).toBe(7);
  });

  it('JSON null salvo devolve o padrão', () => {
    const s = criarStorage('p:', backendEmMemoria({ 'p:x': 'null' }));
    expect(s.get('x', 7)).toBe(7);
  });

  it('persiste no backend com o prefixo e lê de volta', () => {
    const b = backendEmMemoria();
    const s = criarStorage('arcade:blockstrike:', b);
    s.set('vol', 0.5);
    expect(b.getItem('arcade:blockstrike:vol')).toBe('0.5');
    expect(s.get('vol', 1)).toBe(0.5);
  });

  it('chave ausente devolve o padrão', () => {
    const s = criarStorage('p:', backendEmMemoria());
    expect(s.get('nada', 'oi')).toBe('oi');
  });

  it('valor que não serializa (circular) não lança', () => {
    const s = criarStorage('p:', backendEmMemoria());
    const circ: Record<string, unknown> = {};
    circ.self = circ;
    expect(() => s.set('c', circ)).not.toThrow();
    expect(s.get('c', { a: 1 })).toEqual({ a: 1 });
  });

  it('sem backend e sem localStorage global: não lança e usa memória', () => {
    const s = criarStorage('p:');
    expect(() => s.set('a', 2)).not.toThrow();
    expect(s.get('a', 0)).toBe(2);
  });

  it('getter global de localStorage que lança SecurityError: não lança e usa memória', () => {
    vi.spyOn(globalThis, 'localStorage', 'get').mockImplementation(() => {
      throw new DOMException('bloqueado', 'SecurityError');
    });
    const s = criarStorage('p:');
    expect(() => s.set('a', 3)).not.toThrow();
    expect(s.get('a', 0)).toBe(3);
  });

  it('setItem falha com valor antigo no backend: o valor novo em memória vence', () => {
    const b = backendEmMemoria({ 'p:k': '"velho"' });
    b.setItem = () => {
      throw new DOMException('cheio', 'QuotaExceededError');
    };
    const s = criarStorage('p:', b);
    s.set('k', 'novo');
    expect(s.get('k', 'padrao')).toBe('novo');
  });
});
