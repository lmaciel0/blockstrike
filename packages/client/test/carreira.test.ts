import { describe, expect, it } from 'vitest';
import { contarPartida, lerCarreira, novaCarreira, resumoCarreira } from '../src/carreira';

describe('lerCarreira', () => {
  it('null e JSON quebrado voltam à carreira nova', () => {
    expect(lerCarreira(null)).toEqual(novaCarreira());
    expect(lerCarreira('{lixo')).toEqual(novaCarreira());
    expect(lerCarreira(7)).toEqual(novaCarreira());
  });

  it('campo estranho volta a zero e armas inválidas somem', () => {
    const c = lerCarreira({ partidas: 3, kills: -1, mortes: 1.5, armas: { rifle: 4, faca: 'x', pistola: 0 } });
    expect(c.partidas).toBe(3);
    expect(c.kills).toBe(0);
    expect(c.mortes).toBe(0);
    expect(c.armas).toEqual({ rifle: 4 });
  });
});

describe('contarPartida e resumo', () => {
  it('conta vitória, derrota e empate', () => {
    const c = novaCarreira();
    contarPartida(c, 'azul');
    contarPartida(c, 'laranja');
    contarPartida(c, 'empate');
    expect([c.partidas, c.vitorias, c.derrotas, c.empates]).toEqual([3, 1, 1, 1]);
    expect(resumoCarreira(c).taxaVitoria).toBe(33);
  });
});
