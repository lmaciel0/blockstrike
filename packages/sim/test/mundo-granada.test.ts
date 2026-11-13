import { expect, test } from 'vitest';
import { criarMundo, posicionarParaRound, passo } from '../src/mundo.js';
import * as E from '../src/economia.js';
import * as BOMBA_MOD from '../src/bomba.js';
import { MAPA } from '../src/mapa.js';
import { criarRng } from '../src/rng.js';
import type { Caixa, Comandos, Entidade, Evento, Mundo, TipoGranada } from '../src/tipos.js';

const chao: Caixa = { min: { x: -60, y: -1, z: -60 }, max: { x: 60, y: 0, z: 60 }, cor: 0x888888 };
const cmd = (extra: Partial<Comandos> = {}): Comandos => ({
  frente: 0, lado: 0, pular: false, agachar: false, devagar: false, atirar: false,
  zoom: false, recarregar: false, usar: false, granada: null, slot: null, yaw: 0, pitch: 0, ...extra,
});
function cenario(caixas: Caixa[] = [chao], economia = true): Mundo {
  const mundo = criarMundo({
    mapa: { ...MAPA, caixas }, primariaJogador: 'rifle', dificuldade: 'medio', rng: criarRng(9),
  });
  if (economia) {
    E.iniciarEconomia(mundo);
    mundo.entidades.forEach((e) => { e.equip!.primaria = 'rifle'; }); // sem primária o round começaria na pistola
  }
  posicionarParaRound(mundo, 'A');
  mundo.entidades.forEach((e, i) => { e.pos = { x: 50, y: 0, z: 50 - i * 0.5 }; e.noChao = true; });
  return mundo;
}
// `molotov: 0` explícito: o tipo exige as quatro chaves (ausente ou zero, o resultado é o mesmo).
const zerar = (e: Entidade): void => { e.equip!.granadas = { he: 0, molotov: 0, flash: 0, smoke: 0 }; };
const dar = (e: Entidade, tipo: TipoGranada, n = 1): void => { e.equip!.granadas[tipo] = n; };
const rodar = (m: Mundo, id: number, extra: Partial<Comandos> = {}): Evento[] => passo(m, 0.05, new Map([[id, cmd(extra)]]));

test('posicionarParaRound cria a mão da granada com e sem economia', () => {
  for (const eco of [true, false]) {
    const m = cenario([chao], eco);
    for (const e of m.entidades) {
      expect(e.armas!.granada.tipo).toBe('granada');
      expect(e.armas!.granada.pino).toBe(null);
    }
  }
});

test('4 sem granada não troca de slot', () => {
  const m = cenario(); const eu = m.entidades[0]; zerar(eu);
  rodar(m, 0, { slot: 'granada' });
  expect(eu.slot).toBe('primaria');
});

test('4 entra na HE e cada 4 cicla', () => {
  const m = cenario(); const eu = m.entidades[0]; zerar(eu); dar(eu, 'he'); dar(eu, 'flash');
  const vistos = [];
  for (let i = 0; i < 3; i++) {
    const ev = rodar(m, 0, { slot: 'granada' });
    rodar(m, 0);
    vistos.push([eu.armas!.granada.sel, eu.slot, ev.some((x) => x.tipo === 'saque')]);
  }
  expect(vistos).toStrictEqual([['he', 'granada', true], ['flash', 'granada', false], ['he', 'granada', false]]);
});

test('jogar volta para a arma anterior', () => {
  const m = cenario(); const eu = m.entidades[0]; zerar(eu); dar(eu, 'he', 2);
  rodar(m, 0, { slot: 'granada' });
  for (let i = 0; i < 3; i++) rodar(m, 0, { atirar: true });
  expect(m.granadas?.length ?? 0).toBe(0);
  const ev = rodar(m, 0);
  expect(m.granadas.length).toBe(1);
  expect(eu.slot).toBe('primaria');
  expect(eu.slotAnterior).toBe('granada');
  expect(ev.some((x) => x.tipo === 'saque' && x.arma === 'rifle')).toBeTruthy();
});

test('trocar de arma com o pino puxado cancela', () => {
  const m = cenario(); const eu = m.entidades[0]; zerar(eu); dar(eu, 'he');
  rodar(m, 0, { slot: 'granada' });
  rodar(m, 0, { atirar: true });
  expect(eu.armas!.granada.pino).toBeTruthy();
  rodar(m, 0, { slot: 'pistola', atirar: true });
  rodar(m, 0);
  expect(m.granadas?.length ?? 0).toBe(0);
  expect(eu.equip!.granadas.he).toBe(1);
  expect(eu.armas!.granada.pino).toBe(null);
  expect(eu.slot).toBe('pistola');
});

test('jogar a última granada sai do slot e o 4 não entra mais', () => {
  const m = cenario(); const eu = m.entidades[0]; zerar(eu); dar(eu, 'he');
  rodar(m, 0, { slot: 'granada' });
  rodar(m, 0, { atirar: true });
  rodar(m, 0);
  expect(m.granadas.length).toBe(1);
  expect(eu.slot).toBe('primaria');
  rodar(m, 0, { slot: 'granada' });
  expect(eu.slot).toBe('primaria');
});

test('lembra o último tipo ao voltar; troca se acabou', () => {
  const m = cenario(); const eu = m.entidades[0]; zerar(eu); dar(eu, 'he'); dar(eu, 'flash', 2);
  rodar(m, 0, { slot: 'granada' });
  rodar(m, 0, { slot: 'granada' });
  expect(eu.armas!.granada.sel).toBe('flash');
  rodar(m, 0, { slot: 'primaria' });
  rodar(m, 0, { slot: 'granada' });
  expect(eu.armas!.granada.sel).toBe('flash');
  rodar(m, 0, { slot: 'primaria' });
  eu.equip!.granadas.flash = 0;
  rodar(m, 0, { slot: 'granada' });
  expect(eu.armas!.granada.sel).toBe('he');
});

test('a roda só passa pela granada com estoque', () => {
  const m = cenario(); const eu = m.entidades[0]; zerar(eu);
  eu.slot = 'faca';
  rodar(m, 0, { slot: 'roda+' });
  expect(eu.slot).toBe('primaria');
  const m2 = cenario(); const eu2 = m2.entidades[0]; zerar(eu2); dar(eu2, 'flash');
  eu2.slot = 'faca';
  rodar(m2, 0, { slot: 'roda+' });
  expect(eu2.slot).toBe('granada');
});

test('velocidade com granada na mão é a da faca', () => {
  const m = cenario(); const eu = m.entidades[0]; zerar(eu); dar(eu, 'he');
  eu.pos = { x: 0, y: 0, z: 0 };
  rodar(m, 0, { slot: 'granada' });
  for (let i = 0; i < 20; i++) rodar(m, 0, { frente: 1 });
  expect(Math.abs(eu.velHoriz - 6.2) < 0.05, String(eu.velHoriz)).toBeTruthy();
});

test('pino puxado e fim do round (comBomba falso) cancela, não lança', () => {
  const m = cenario(); const eu = m.entidades[0]; zerar(eu); dar(eu, 'he');
  rodar(m, 0, { slot: 'granada' });
  rodar(m, 0, { atirar: true });
  expect(eu.armas!.granada.pino).toBeTruthy();
  passo(m, 0.05, new Map([[0, cmd()]]), { comBomba: false });
  expect(m.granadas?.length ?? 0).toBe(0);
  expect(eu.equip!.granadas.he).toBe(1);
  expect(eu.armas!.granada.pino).toBe(null);
  expect(eu.slot).toBe('granada');
});

test('pino puxado e congelado cancela, não lança', () => {
  const m = cenario(); const eu = m.entidades[0]; zerar(eu); dar(eu, 'he');
  rodar(m, 0, { slot: 'granada' });
  rodar(m, 0, { atirar: true });
  passo(m, 0.05, new Map([[0, cmd()]]), { congelado: true });
  passo(m, 0.05, new Map([[0, cmd()]]));
  expect(m.granadas?.length ?? 0).toBe(0);
  expect(eu.equip!.granadas.he).toBe(1);
  expect(eu.armas!.granada.pino).toBe(null);
});

test('pino puxado e segurar usar (plantar) cancela, não lança', () => {
  const { criarBomba, acaoPossivel } = BOMBA_MOD;
  const m = cenario(); const t = m.entidades[5]; zerar(t); dar(t, 'he');
  m.bomba = criarBomba(m, 'laranja');
  m.bomba.portador = 5;
  t.pos = { ...MAPA.bombsites.A.centro, y: 0 };
  rodar(m, 5, { slot: 'granada' });
  rodar(m, 5, { atirar: true });
  expect(t.armas!.granada.pino).toBeTruthy();
  expect(acaoPossivel(m, t)).toBe('plantar');
  const ev = passo(m, 0.05, new Map([[5, cmd({ usar: true })]]));
  expect(ev.some((x) => x.tipo === 'acao-inicio')).toBeTruthy();
  passo(m, 0.05, new Map([[5, cmd()]]));
  expect(m.granadas?.length ?? 0).toBe(0);
  expect(t.equip!.granadas.he).toBe(1);
  expect(t.armas!.granada.pino).toBe(null);
});
