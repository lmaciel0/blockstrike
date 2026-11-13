import test from 'node:test';
import assert from 'node:assert/strict';
import { mod } from './_repo.mjs';

const E = await mod('js/games/blockstrike/economia.js');
const { criarMundo, posicionarParaRound, passo } = await mod('js/games/blockstrike/mundo.js');
const { criarPartida } = await mod('js/games/blockstrike/rounds.js');
const { MAPA } = await mod('js/games/blockstrike/mapa.js');
const { criarRng } = await mod('js/games/blockstrike/rng.js');
const { ECONOMIA, ITENS, COLETE } = await mod('js/games/blockstrike/config.js');
const { direcao, olho } = await mod('js/games/blockstrike/fisica.js');

const chao = { min: { x: -50, y: -1, z: -50 }, max: { x: 50, y: 0, z: 50 }, cor: 0x888888 };
const cmd = (extra = {}) => ({
  frente: 0, lado: 0, pular: false, agachar: false, devagar: false, atirar: false,
  zoom: false, recarregar: false, usar: false, slot: null, yaw: 0, pitch: 0, ...extra,
});
function cenario() {
  const mundo = criarMundo({
    mapa: { ...MAPA, caixas: [chao] }, primariaJogador: 'rifle', dificuldade: 'medio', rng: criarRng(5),
  });
  E.iniciarEconomia(mundo);
  posicionarParaRound(mundo, 'A');
  mundo.entidades.forEach((e, i) => { e.pos = { x: 40, y: 0, z: -40 + i }; });
  return mundo;
}

test('iniciarEconomia: $800, sem equipamento e só pistola e faca no primeiro round', () => {
  const m = cenario();
  for (const e of m.entidades) {
    assert.equal(e.dinheiro, ECONOMIA.inicial);
    assert.equal(e.equip.primaria, null);
    assert.equal(e.armas.primaria, undefined);
    assert.equal(e.slot, 'pistola');
  }
});

test('comprar arma: desconta, entrega na hora e põe na mão', () => {
  const m = cenario();
  const e = m.entidades[0];
  e.dinheiro = 3000;
  const r = E.comprar(e, 'rifle', 'CT');
  assert.ok(r.ok);
  assert.equal(e.dinheiro, 300);
  assert.equal(e.armas.primaria.tipo, 'rifle');
  assert.equal(e.slot, 'primaria');
  e.dinheiro = 5000;
  assert.equal(E.comprar(e, 'rifle', 'CT').motivo, 'ja-tem');
});

test('sem dinheiro não compra', () => {
  const e = cenario().entidades[0];
  assert.deepEqual(E.comprar(e, 'sniper', 'CT'), { ok: false, motivo: 'dinheiro' });
  assert.equal(e.dinheiro, 800);
});

test('colete, colete + capacete, kit só CT e granadas com limite', () => {
  const m = cenario();
  const e = m.entidades[0];
  e.dinheiro = 16000;
  assert.ok(E.comprar(e, 'colete', 'CT').ok);
  assert.equal(e.equip.colete, COLETE.pontos);
  assert.equal(E.comprar(e, 'colete', 'CT').motivo, 'ja-tem');
  assert.ok(E.comprar(e, 'coleteCapacete', 'CT').ok, 'colete cheio sem capacete ainda dá para completar');
  assert.ok(e.equip.capacete);
  assert.equal(E.comprar(e, 'kit', 'T').motivo, 'papel');
  assert.ok(E.comprar(e, 'kit', 'CT').ok);
  assert.equal(e.kit, true);
  assert.ok(E.comprar(e, 'smoke', 'CT').ok);
  assert.equal(E.comprar(e, 'smoke', 'CT').motivo, 'ja-tem');
  assert.ok(E.comprar(e, 'flash', 'CT').ok && E.comprar(e, 'flash', 'CT').ok);
  assert.equal(E.comprar(e, 'flash', 'CT').motivo, 'ja-tem');
  assert.ok(E.comprar(e, 'he', 'CT').ok);
});

test('kill dá dinheiro conforme a arma (limite $16000)', () => {
  const e = cenario().entidades[0];
  for (const [arma, v] of Object.entries(ECONOMIA.recompensaKill)) {
    e.dinheiro = 0;
    E.premiarKill(e, arma);
    assert.equal(e.dinheiro, v, arma);
  }
  e.dinheiro = 15900;
  E.premiarKill(e, 'escopeta');
  assert.equal(e.dinheiro, ECONOMIA.maximo);
});

test('fim de round: vitória $3250; derrotas seguidas sobem o bônus até $3400', () => {
  const m = cenario();
  const p = criarPartida();
  for (const e of m.entidades) e.dinheiro = 0;
  E.premiarRound(m, p, 'azul');
  assert.equal(m.entidades[0].dinheiro, ECONOMIA.vitoria);
  assert.equal(m.entidades[9].dinheiro, 1400);
  const seq = [];
  for (let i = 0; i < 6; i++) {
    for (const e of m.entidades) e.dinheiro = 0;
    E.premiarRound(m, p, 'azul');
    seq.push(m.entidades[9].dinheiro);
  }
  assert.deepEqual(seq, [1900, 2400, 2900, 3400, 3400, 3400]);
  // O laranja ganha um round: a sequência dele cai uma.
  for (const e of m.entidades) e.dinheiro = 0;
  E.premiarRound(m, p, 'laranja');
  assert.equal(m.entidades[9].dinheiro, ECONOMIA.vitoria);
  assert.equal(p.derrotasSeguidas.laranja, 6, '7 derrotas seguidas e uma vitória: cai uma');
});

test('empate conta como derrota para os dois; dinheiro limitado a $16000', () => {
  const m = cenario();
  const p = criarPartida();
  m.entidades[0].dinheiro = 15500;
  E.premiarRound(m, p, null);
  assert.equal(m.entidades[0].dinheiro, ECONOMIA.maximo);
  assert.equal(m.entidades[9].dinheiro, 800 + 1400);
});

test('resetarEconomia (intervalo) zera dinheiro, equipamento e sequência', () => {
  const m = cenario();
  const p = criarPartida();
  m.entidades[0].dinheiro = 9000;
  E.comprar(m.entidades[0], 'rifle', 'CT');
  p.derrotasSeguidas = { azul: 3, laranja: 2 };
  E.resetarEconomia(m, p);
  assert.equal(m.entidades[0].dinheiro, 800);
  assert.equal(m.entidades[0].equip.primaria, null);
  assert.deepEqual(p.derrotasSeguidas, { azul: 0, laranja: 0 });
});

test('colete reduz dano no corpo e o capacete, na cabeça; o colete se gasta', () => {
  const eq = { colete: 100, capacete: false };
  assert.deepEqual(E.danoComColete(eq, 'tronco', 36), { dano: Math.round(36 * COLETE.corpo), colete: 100 - (36 - Math.round(36 * COLETE.corpo)) });
  assert.equal(E.danoComColete(eq, 'cabeca', 120).dano, 120, 'sem capacete a cabeça leva tudo');
  const com = { colete: 100, capacete: true };
  assert.equal(E.danoComColete(com, 'cabeca', 120).dano, Math.round(120 * COLETE.cabeca));
  assert.ok(E.danoComColete(com, 'cabeca', 120).dano < 100, 'capacete evita o one-shot de pistola');
  assert.deepEqual(E.danoComColete({ colete: 0, capacete: true }, 'tronco', 36), { dano: 36, colete: 0 });
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
  assert.ok(acertos >= 3, 'com colete leva mais de 2 tiros no tronco');
  assert.equal(alvo.vivo, false);
  assert.equal(eu.dinheiro, ECONOMIA.recompensaKill.rifle);
  assert.equal(alvo.equip.primaria, null, 'morreu: perdeu a primária');
  assert.equal(alvo.equip.colete, 0);
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
  assert.equal(b.equip.primaria, null);
  a.armas.primaria.municao = 3;
  posicionarParaRound(m, 'A');
  assert.equal(a.armas.primaria.tipo, 'rifle');
  assert.equal(a.armas.primaria.municao, 30);
  assert.equal(a.slot, 'primaria');
  assert.equal(b.armas.primaria, undefined);
  assert.equal(b.slot, 'pistola');
});

test('roda do mouse pula o slot sem primária', () => {
  const m = cenario();
  const e = m.entidades[0];
  assert.equal(e.slot, 'pistola');
  passo(m, 0.05, new Map([[0, cmd({ slot: 'roda+' })]]));
  assert.equal(e.slot, 'faca');
  passo(m, 0.05, new Map([[0, cmd({ slot: 'roda+' })]]));
  assert.equal(e.slot, 'pistola', 'volta sem passar pela primária inexistente');
});

test('botComprar: sem dinheiro só colete; com dinheiro, arma + colete com capacete + kit', () => {
  const m = cenario();
  const bot = m.entidades[2];
  bot.dinheiro = 800;
  E.botComprar(bot, 'CT');
  assert.equal(bot.equip.primaria, null);
  assert.equal(bot.equip.colete, COLETE.pontos);
  assert.equal(bot.dinheiro, 800 - ITENS.colete.preco);
  const rico = m.entidades[3];
  rico.dinheiro = 9000;
  rico.primariaEscolhida = 'sniper';
  E.botComprar(rico, 'CT');
  assert.equal(rico.equip.primaria, 'sniper');
  assert.ok(rico.equip.capacete);
  assert.ok(rico.equip.kit);
  const medio = m.entidades[4];
  medio.dinheiro = 3000;
  medio.primariaEscolhida = 'sniper';
  E.botComprar(medio, 'T');
  assert.equal(medio.equip.primaria, 'rifle', 'sniper não cabe: cai para o rifle');
  assert.equal(medio.equip.kit, false, 'terrorista não compra kit');
  void direcao; void olho;
});

test('sem economia (treino) nada muda: todos têm primária e dano sem colete', () => {
  const m = criarMundo({ mapa: { ...MAPA, caixas: [chao] }, primariaJogador: 'smg', dificuldade: 'medio', rng: criarRng(2) });
  posicionarParaRound(m, 'A');
  assert.equal(m.economia, undefined);
  assert.equal(m.entidades[0].armas.primaria.tipo, 'smg');
});
