import { expect, test } from 'vitest';
import { criarMundo, posicionarParaRound, passo } from '../src/mundo.js';
import { criarBomba, siteEm, acaoPossivel } from '../src/bomba.js';
import { MAPA } from '../src/mapa.js';
import { criarRng } from '../src/rng.js';
import { BOMBA } from '../src/config.js';
import type { Bomba, Caixa, Comandos, Evento, Mundo } from '../src/tipos.js';

const chao: Caixa = { min: { x: -50, y: -1, z: -50 }, max: { x: 50, y: 0, z: 50 }, cor: 0x888888 };
const cmd = (extra: Partial<Comandos> = {}): Comandos => ({
  granada: null,
  frente: 0, lado: 0, pular: false, agachar: false, devagar: false, atirar: false,
  zoom: false, recarregar: false, usar: false, slot: null, yaw: 0, pitch: 0, ...extra,
});

// Round 1: laranja é T. Todos longe, exceto o que o teste mexer. Entidade 5 = T, 0 = CT.
type MundoComBomba = Mundo & { bomba: Bomba };
function cenario(): MundoComBomba {
  const mundo = criarMundo({
    mapa: { ...MAPA, caixas: [chao] }, primariaJogador: 'rifle', dificuldade: 'medio', rng: criarRng(11),
  });
  posicionarParaRound(mundo, 'A');
  mundo.entidades.forEach((e, i) => { e.pos = { x: 45, y: 0, z: -45 + i * 0.5 }; e.noChao = true; });
  mundo.bomba = criarBomba(mundo, 'laranja');
  mundo.bomba.portador = 5;
  return mundo as MundoComBomba;
}
const siteA = MAPA.bombsites.A.centro;
const rodar = (
  m: Mundo, seg: number, comandos: (i: number) => Map<number, Comandos>, opcoes?: { congelado?: boolean; comBomba?: boolean },
): Evento[] => {
  const ev: Evento[] = [];
  for (let i = 0; i < Math.round(seg / 0.05); i++) ev.push(...passo(m, 0.05, comandos(i), opcoes));
  return ev;
};
const so = (id: number, c: Comandos) => (): Map<number, Comandos> => new Map([[id, c]]);

test('criarBomba sorteia um terrorista vivo e um bombsite', () => {
  const m = cenario();
  const b = criarBomba(m, 'laranja');
  expect(m.entidades[b.portador!].time).toBe('laranja');
  expect(['A', 'B'].includes(b.siteAlvo)).toBeTruthy();
  expect(b.plantada).toBe(false);
  expect(b.restante).toBe(BOMBA.explode);
});

test('siteEm reconhece A, B e fora', () => {
  expect(siteEm(MAPA, siteA)).toBe('A');
  expect(siteEm(MAPA, MAPA.bombsites.B.centro)).toBe('B');
  expect(siteEm(MAPA, { x: 0, z: 20 })).toBe(null);
});

test('portador planta no site segurando E por 3,2 s, parado', () => {
  const m = cenario();
  const t = m.entidades[5];
  t.pos = { x: siteA.x, y: 0, z: siteA.z };
  expect(acaoPossivel(m, t)).toBe('plantar');
  const ev = rodar(m, 1, so(5, cmd({ usar: true, frente: 1 })));
  expect(ev.some((e) => e.tipo === 'acao-inicio' && e.acao === 'plantar')).toBeTruthy();
  expect(t.pos.x, 'não anda enquanto planta').toBe(siteA.x);
  expect(m.bomba.acao!.t > 0.9 && !m.bomba.plantada).toBeTruthy();
  const ev2 = rodar(m, 2.4, so(5, cmd({ usar: true })));
  expect(m.bomba.plantada).toBeTruthy();
  const plantada = ev2.find((e): e is Extract<Evento, { tipo: 'plantada' }> => e.tipo === 'plantada')!;
  expect(plantada.site).toBe('A');
  expect(m.bomba.pos).toStrictEqual({ x: siteA.x, y: 0, z: siteA.z });
  expect(m.bomba.portador).toBe(null);
});

test('soltar E cancela e zera o progresso', () => {
  const m = cenario();
  m.entidades[5].pos = { x: siteA.x, y: 0, z: siteA.z };
  rodar(m, 2, so(5, cmd({ usar: true })));
  const ev = rodar(m, 0.1, so(5, cmd()));
  expect(ev.some((e) => e.tipo === 'acao-cancelada')).toBeTruthy();
  expect(m.bomba.acao).toBe(null);
  rodar(m, 2, so(5, cmd({ usar: true })));
  expect(!m.bomba.plantada, 'recomeçou do zero').toBeTruthy();
});

test('fora do bombsite, no ar ou sem a C4 não planta', () => {
  const m = cenario();
  const t = m.entidades[5];
  t.pos = { x: 0, y: 0, z: 20 };
  expect(acaoPossivel(m, t)).toBe(null);
  t.pos = { x: siteA.x, y: 0, z: siteA.z };
  m.bomba.portador = 6;
  expect(acaoPossivel(m, t)).toBe(null);
  m.bomba.portador = 5;
  t.noChao = false;
  expect(acaoPossivel(m, t)).toBe(null);
});

test('CT desarma em 10 s (5 s com kit) perto da C4 plantada', () => {
  for (const [kit, seg] of [[false, BOMBA.desarmar], [true, BOMBA.desarmarKit]] as [boolean, number][]) {
    const m = cenario();
    m.bomba.plantada = true;
    m.bomba.pos = { x: siteA.x, y: 0, z: siteA.z };
    m.bomba.site = 'A';
    const ct = m.entidades[0];
    ct.kit = kit;
    ct.pos = { x: siteA.x + 1, y: 0, z: siteA.z };
    expect(acaoPossivel(m, ct)).toBe('desarmar');
    rodar(m, seg - 0.5, so(0, cmd({ usar: true })));
    expect(!m.bomba.desarmada, `kit=${kit}: ainda não`).toBeTruthy();
    const ev = rodar(m, 0.7, so(0, cmd({ usar: true })));
    expect(m.bomba.desarmada, `kit=${kit}: desarmou`).toBeTruthy();
    expect(ev.some((e) => e.tipo === 'desarmada')).toBeTruthy();
  }
});

test('CT longe da C4 não desarma', () => {
  const m = cenario();
  m.bomba.plantada = true;
  m.bomba.pos = { x: siteA.x, y: 0, z: siteA.z };
  m.entidades[0].pos = { x: siteA.x + 3, y: 0, z: siteA.z };
  expect(acaoPossivel(m, m.entidades[0])).toBe(null);
});

test('explode em 40 s e mata quem está no raio', () => {
  const m = cenario();
  m.bomba.plantada = true;
  m.bomba.pos = { x: siteA.x, y: 0, z: siteA.z };
  m.entidades[0].pos = { x: siteA.x + 5, y: 0, z: siteA.z };
  m.entidades[1].pos = { x: siteA.x + 30, y: 0, z: siteA.z };
  const ev = rodar(m, BOMBA.explode - 1, () => new Map());
  expect(!m.bomba.explodiu).toBeTruthy();
  expect(Math.abs(m.bomba.restante - 1) < 0.2).toBeTruthy();
  const ev2 = rodar(m, 1.2, () => new Map());
  expect(m.bomba.explodiu).toBeTruthy();
  expect(ev2.some((e) => e.tipo === 'explosao')).toBeTruthy();
  expect(m.entidades[0].vivo).toBe(false);
  expect(m.entidades[1].vivo, 'longe do raio sobrevive').toBe(true);
  const morte = ev2.find((e): e is Extract<Evento, { tipo: 'morte' }> => e.tipo === 'morte' && e.vitima === 0)!;
  expect(morte.assassino).toBe(null);
  expect(morte.arma).toBe('c4');
  void ev;
});

test('portador morto solta a C4 e outro terrorista a pega passando por cima', () => {
  const m = cenario();
  const t = m.entidades[5];
  t.pos = { x: 10, y: 0, z: 10 };
  t.hp = 0;
  const ev = rodar(m, 0.2, () => new Map());
  expect(ev.some((e) => e.tipo === 'bomba-solta')).toBeTruthy();
  expect(m.bomba.portador).toBe(null);
  expect(m.bomba.pos).toStrictEqual({ x: 10, y: 0, z: 10 });
  m.entidades[7].pos = { x: 10.5, y: 0, z: 10 };
  const ev2 = rodar(m, 0.1, () => new Map());
  expect(ev2.some((e) => e.tipo === 'bomba-pega' && e.id === 7)).toBeTruthy();
  expect(m.bomba.portador).toBe(7);
  expect(m.bomba.pos).toBe(null);
});

test('CT não pega a C4 solta', () => {
  const m = cenario();
  m.bomba.portador = null;
  m.bomba.pos = { x: 10, y: 0, z: 10 };
  m.entidades[0].pos = { x: 10, y: 0, z: 10 };
  rodar(m, 0.2, () => new Map());
  expect(m.bomba.portador).toBe(null);
});

test('comBomba falso congela a C4; congelado também', () => {
  const m = cenario();
  m.bomba.plantada = true;
  m.bomba.pos = { x: siteA.x, y: 0, z: siteA.z };
  rodar(m, 2, () => new Map(), { comBomba: false });
  expect(m.bomba.restante).toBe(BOMBA.explode);
  rodar(m, 2, () => new Map(), { congelado: true });
  expect(m.bomba.restante).toBe(BOMBA.explode);
});

test('sem mundo.bomba (treino) nada muda', () => {
  const m: Mundo = cenario();
  m.bomba = null;
  m.entidades[5].pos = { x: siteA.x, y: 0, z: siteA.z };
  rodar(m, 1, so(5, cmd({ usar: true })));
  expect(m.bomba).toBe(null);
});
