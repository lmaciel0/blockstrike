import { describe, expect, it } from 'vitest';
import { MIRA_PADRAO, aberturaMira, lerMira } from '../src/mira';

describe('lerMira', () => {
  it('null, JSON quebrado e número caem no padrão', () => {
    expect(lerMira(null)).toEqual(MIRA_PADRAO);
    expect(lerMira('{lixo')).toEqual(MIRA_PADRAO);
    expect(lerMira(42)).toEqual(MIRA_PADRAO);
  });

  it('valida campo a campo e limita os sliders', () => {
    const m = lerMira({ estilo: 'ponto', tamanho: 99, espessura: -3, abertura: 'x', ponto: true, cor: '#ABCDEF' });
    expect(m).toEqual({ estilo: 'ponto', tamanho: 20, espessura: 1, abertura: MIRA_PADRAO.abertura, ponto: true, cor: '#abcdef' });
  });

  it('usa a cor legada quando a nova é inválida', () => {
    expect(lerMira({ cor: 'vermelho' }, '#FF0000').cor).toBe('#ff0000');
    expect(lerMira(null, 'nada').cor).toBe(MIRA_PADRAO.cor);
  });
});

describe('aberturaMira', () => {
  it('só a dinâmica soma o spread; a clássica tem vão fixo', () => {
    expect(aberturaMira({ ...MIRA_PADRAO, estilo: 'dinamica' }, 3)).toBe(MIRA_PADRAO.abertura + 3);
    expect(aberturaMira({ ...MIRA_PADRAO, estilo: 'estatica' }, 3)).toBe(MIRA_PADRAO.abertura);
    expect(aberturaMira({ ...MIRA_PADRAO, estilo: 'classica' }, 3)).toBe(MIRA_PADRAO.abertura + 6);
  });
});
