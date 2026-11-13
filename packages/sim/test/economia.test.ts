import { expect, test } from 'vitest';
import * as E from '../src/economia.js';
import { criarMundo, posicionarParaRound, passo } from '../src/mundo.js';
import { criarPartida } from '../src/rounds.js';
import { MAPA } from '../src/mapa.js';
import { criarRng } from '../src/rng.js';
import { ECONOMIA, ITENS, COLETE } from '../src/config.js';
import { direcao, olho } from '../src/fisica.js';
import type { ArmasEntidade, Caixa, Comandos, Entidade, Equip, Mundo, TipoArma } from '../src/tipos.js';

const chao: Caixa = { min: { x: -50, y: -1, z: -50 }, max: { x: 50, y: 0, z: 50 }, cor: 0x888888 };
const cmd = (extra: Partial<Comandos> = {}): Comandos => ({
  granada: null,
  frente: 0, lado: 0, pular: false, agachar: false, devagar: false, atirar: false,
  zoom: false, recarregar: false, usar: false, slot: null, yaw: 0, pitch: 0, ...extra,
});
// Entidade depois de `iniciarEconomia` + `posicionarParaRound`: dinheiro, equip e armas já existem.
type EntidadeEco = Entidade & { dinheiro: number; equip: Equip; armas: ArmasEntidade };
type MundoEco = Mundo & { entidades: EntidadeEco[] };
function cenario(): MundoEco {
  const mundo = criarMundo({
    mapa: { ...MAPA, caixas: [chao] }, primariaJogador: 'rifle', dificuldade: 'medio', rng: criarRng(5),
  });
  E.iniciarEconomia(mundo);
  posicionarParaRound(mundo, 'A');
  mundo.entidades.forEach((e, i) => { e.pos = { x: 40, y: 0, z: -40 + i }; });
  return mundo as MundoEco;
}

test('iniciarEconomia: $800, sem equipamento e só pistola e faca no primeiro round', () => {
  const m = cenario();
  for (const e of m.entidades) {
    expect(e.dinheiro).toBe(ECONOMIA.inicial);
    expect(e.equip.primaria).toBe(null);
    expect(e.armas.primaria).toBe(undefined);
    expect(e.slot).toBe('pistola');
  }
});

test('comprar arma: desconta, entrega na hora e põe na mão', () => {
  const m = cenario();
  const e = m.entidades[0];
  e.dinheiro = 3000;
  const r = E.comprar(e, 'rifle', 'CT');
  expect(r.ok).toBeTruthy();
  expect(e.dinheiro).toBe(300);
  expect(e.armas.primaria!.tipo).toBe('rifle');
  expect(e.slot).toBe('primaria');
  e.dinheiro = 5000;
  expect(E.comprar(e, 'rifle', 'CT').motivo).toBe('ja-tem');
});

test('sem dinheiro não compra', () => {
  const e = cenario().entidades[0];
  expect(E.comprar(e, 'sniper', 'CT')).toStrictEqual({ ok: false, motivo: 'dinheiro' });
  expect(e.dinheiro).toBe(800);
});

test('colete, colete + capacete, kit só CT e granadas com limite', () => {
  const m = cenario();
  const e = m.entidades[0];
  e.dinheiro = 16000;
  expect(E.comprar(e, 'colete', 'CT').ok).toBeTruthy();
  expect(e.equip.colete).toBe(COLETE.pontos);
  expect(E.comprar(e, 'colete', 'CT').motivo).toBe('ja-tem');
  expect(E.comprar(e, 'coleteCapacete', 'CT').ok, 'colete cheio sem capacete ainda dá para completar').toBeTruthy();
  expect(e.equip.capacete).toBeTruthy();
  expect(E.comprar(e, 'kit', 'T').motivo).toBe('papel');
  expect(E.comprar(e, 'kit', 'CT').ok).toBeTruthy();
  expect(e.kit).toBe(true);
  expect(E.comprar(e, 'smoke', 'CT').ok).toBeTruthy();
  expect(E.comprar(e, 'smoke', 'CT').motivo).toBe('ja-tem');
  expect(E.comprar(e, 'flash', 'CT').ok && E.comprar(e, 'flash', 'CT').ok).toBeTruthy();
  expect(E.comprar(e, 'flash', 'CT').motivo).toBe('ja-tem');
  expect(E.comprar(e, 'he', 'CT').ok).toBeTruthy();
});

test('kill dá dinheiro conforme a arma (limite $16000)', () => {
  const e = cenario().entidades[0];
  for (const [arma, v] of Object.entries(ECONOMIA.recompensaKill)) {
    e.dinheiro = 0;
    E.premiarKill(e, arma as TipoArma);
    expect(e.dinheiro, arma).toBe(v);
  }
  e.dinheiro = 15900;
  E.premiarKill(e, 'escopeta');
  expect(e.dinheiro).toBe(ECONOMIA.maximo);
});

test('fim de round: vitória $3250; derrotas seguidas sobem o bônus até $3400', () => {
  const m = cenario();
  const p = criarPartida();
  for (const e of m.entidades) e.dinheiro = 0;
  E.premiarRound(m, p, 'azul');
  expect(m.entidades[0].dinheiro).toBe(ECONOMIA.vitoria);
  expect(m.entidades[9].dinheiro).toBe(1400);
  const seq = [];
  for (let i = 0; i < 6; i++) {
    for (const e of m.entidades) e.dinheiro = 0;
    E.premiarRound(m, p, 'azul');
    seq.push(m.entidades[9].dinheiro);
  }
  expect(seq).toStrictEqual([1900, 2400, 2900, 3400, 3400, 3400]);
  // O laranja ganha um round: a sequência dele cai uma.
  for (const e of m.entidades) e.dinheiro = 0;
  E.premiarRound(m, p, 'laranja');
  expect(m.entidades[9].dinheiro).toBe(ECONOMIA.vitoria);
  expect(p.derrotasSeguidas.laranja, '7 derrotas seguidas e uma vitória: cai uma').toBe(6);
});

test('empate conta como derrota para os dois; dinheiro limitado a $16000', () => {
  const m = cenario();
  const p = criarPartida();
  m.entidades[0].dinheiro = 15500;
  E.premiarRound(m, p, null);
  expect(m.entidades[0].dinheiro).toBe(ECONOMIA.maximo);
  expect(m.entidades[9].dinheiro).toBe(800 + 1400);
});

test('resetarEconomia (intervalo) zera dinheiro, equipamento e sequência', () => {
  const m = cenario();
  const p = criarPartida();
  m.entidades[0].dinheiro = 9000;
  E.comprar(m.entidades[0], 'rifle', 'CT');
  p.derrotasSeguidas = { azul: 3, laranja: 2 };
  E.resetarEconomia(m, p);
  expect(m.entidades[0].dinheiro).toBe(800);
  expect(m.entidades[0].equip.primaria).toBe(null);
  expect(p.derrotasSeguidas).toStrictEqual({ azul: 0, laranja: 0 });
});

test('colete reduz dano no corpo e o capacete, na cabeça; o colete se gasta', () => {
  const eq = { colete: 100, capacete: false };
  expect(E.danoComColete(eq, 'tronco', 36)).toStrictEqual({ dano: Math.round(36 * COLETE.corpo), colete: 100 - (36 - Math.round(36 * COLETE.corpo)) });
  expect(E.danoComColete(eq, 'cabeca', 120).dano, 'sem capacete a cabeça leva tudo').toBe(120);
  const com = { colete: 100, capacete: true };
  expect(E.danoComColete(com, 'cabeca', 120).dano).toBe(Math.round(120 * COLETE.cabeca));
  expect(E.danoComColete(com, 'cabeca', 120).dano < 100, 'capacete evita o one-shot de pistola').toBeTruthy();
  expect(E.danoComColete({ colete: 0, capacete: true }, 'tronco', 36)).toStrictEqual({ dano: 36, colete: 0 });
});

test('na partida: matar dá dinheiro, o colete protege e morrer perde o equipamento', () => {
  const m = cenario();
  const eu = m.entidades[0];
  const alvo = m.entidades[5];
  eu.pos = { x: 0, y: 0, z: 0 };
  eu.yaw = 0;
  alvo.pos = { x: 0, y: 0, z: -6 };
  alvo.dinheiro = 0;
  E.comprar(eu, 'rifle', 'CT');
  eu.dinheiro = 0;
  alvo.equip.colete = 100;
  alvo.equip.capacete = true;
  alvo.equip.primaria = 'rifle';
  // Pistola? não: o jogador está com o rifle na mão. Atira até matar.
  let acertos = 0;
  for (let i = 0; i < 80 && alvo.vivo; i++) {
    const ev = passo(m, 0.05, new Map([[0, cmd({ atirar: i % 2 === 0, pitch: Math.atan2(1.0 - 1.6, 6) })]]));
    acertos += ev.filter((x) => x.tipo === 'acerto' && x.alvo === 5).length;
  }
  expect(acertos >= 3, 'com colete leva mais de 2 tiros no tronco').toBeTruthy();
  expect(alvo.vivo).toBe(false);
  expect(eu.dinheiro).toBe(ECONOMIA.recompensaKill.rifle);
  expect(alvo.equip.primaria, 'morreu: perdeu a primária').toBe(null);
  expect(alvo.equip.colete).toBe(0);
});

test('sobreviver mantém o equipamento no round seguinte (munição cheia); morrer, não', () => {
  const m = cenario();
  const a = m.entidades[0];
  const b = m.entidades[1];
  a.dinheiro = 5000;
  b.dinheiro = 5000;
  E.comprar(a, 'rifle', 'CT');
  E.comprar(a, 'coleteCapacete', 'CT');
  E.comprar(b, 'rifle', 'CT');
  b.hp = 0;
  passo(m, 0.05, new Map());
  expect(b.equip.primaria).toBe(null);
  a.armas.primaria!.municao = 3;
  posicionarParaRound(m, 'A');
  expect(a.armas.primaria!.tipo).toBe('rifle');
  expect(a.armas.primaria!.municao).toBe(30);
  expect(a.slot).toBe('primaria');
  expect(b.armas.primaria).toBe(undefined);
  expect(b.slot).toBe('pistola');
});

test('roda do mouse pula o slot sem primária', () => {
  const m = cenario();
  const e = m.entidades[0];
  expect(e.slot).toBe('pistola');
  passo(m, 0.05, new Map([[0, cmd({ slot: 'roda+' })]]));
  expect(e.slot).toBe('faca');
  passo(m, 0.05, new Map([[0, cmd({ slot: 'roda+' })]]));
  expect(e.slot, 'volta sem passar pela primária inexistente').toBe('pistola');
});

test('botComprar: sem dinheiro só colete; com dinheiro, arma + colete com capacete + kit', () => {
  const m = cenario();
  const bot = m.entidades[2];
  bot.dinheiro = 800;
  E.botComprar(bot, 'CT');
  expect(bot.equip.primaria).toBe(null);
  expect(bot.equip.colete).toBe(COLETE.pontos);
  expect(bot.dinheiro).toBe(800 - ITENS.colete.preco);
  const rico = m.entidades[3];
  rico.dinheiro = 9000;
  rico.primariaEscolhida = 'sniper';
  E.botComprar(rico, 'CT');
  expect(rico.equip.primaria).toBe('sniper');
  expect(rico.equip.capacete).toBeTruthy();
  expect(rico.equip.kit).toBeTruthy();
  const medio = m.entidades[4];
  medio.dinheiro = 3000;
  medio.primariaEscolhida = 'sniper';
  E.botComprar(medio, 'T');
  expect(medio.equip.primaria, 'sniper não cabe: cai para o rifle').toBe('rifle');
  expect(medio.equip.kit, 'terrorista não compra kit').toBe(false);
  void direcao; void olho;
});

test('sem economia (treino) nada muda: todos têm primária e dano sem colete', () => {
  const m = criarMundo({ mapa: { ...MAPA, caixas: [chao] }, primariaJogador: 'smg', dificuldade: 'medio', rng: criarRng(2) });
  posicionarParaRound(m, 'A');
  expect(m.economia).toBe(undefined);
  expect(m.entidades[0].armas!.primaria!.tipo).toBe('smg');
});
