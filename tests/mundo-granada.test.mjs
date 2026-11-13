import test from 'node:test';
import assert from 'node:assert/strict';
import { mod } from './_repo.mjs';

const { criarMundo, posicionarParaRound, passo } = await mod('packages/sim/src/mundo.js');
const E = await mod('packages/sim/src/economia.js');
const BOMBA_MOD = await mod('packages/sim/src/bomba.js');
const { MAPA } = await mod('packages/sim/src/mapa.js');
const { criarRng } = await mod('packages/sim/src/rng.js');

const chao = { min: { x: -60, y: -1, z: -60 }, max: { x: 60, y: 0, z: 60 }, cor: 0x888888 };
const cmd = (extra = {}) => ({
  frente: 0, lado: 0, pular: false, agachar: false, devagar: false, atirar: false,
  zoom: false, recarregar: false, usar: false, granada: null, slot: null, yaw: 0, pitch: 0, ...extra,
});
function cenario(caixas = [chao], economia = true) {
  const mundo = criarMundo({
    mapa: { ...MAPA, caixas }, primariaJogador: 'rifle', dificuldade: 'medio', rng: criarRng(9),
  });
  if (economia) {
    E.iniciarEconomia(mundo);
    mundo.entidades.forEach((e) => { e.equip.primaria = 'rifle'; }); // sem primária o round começaria na pistola
  }
  posicionarParaRound(mundo, 'A');
  mundo.entidades.forEach((e, i) => { e.pos = { x: 50, y: 0, z: 50 - i * 0.5 }; e.noChao = true; });
  return mundo;
}
const zerar = (e) => { e.equip.granadas = { he: 0, flash: 0, smoke: 0 }; };
const dar = (e, tipo, n = 1) => { e.equip.granadas[tipo] = n; };
const rodar = (m, id, extra = {}) => passo(m, 0.05, new Map([[id, cmd(extra)]]));

test('posicionarParaRound cria a mão da granada com e sem economia', () => {
  for (const eco of [true, false]) {
    const m = cenario([chao], eco);
    for (const e of m.entidades) {
      assert.equal(e.armas.granada.tipo, 'granada');
      assert.equal(e.armas.granada.pino, null);
    }
  }
});

test('4 sem granada não troca de slot', () => {
  const m = cenario(); const eu = m.entidades[0]; zerar(eu);
  rodar(m, 0, { slot: 'granada' });
  assert.equal(eu.slot, 'primaria');
});

test('4 entra na HE e cada 4 cicla', () => {
  const m = cenario(); const eu = m.entidades[0]; zerar(eu); dar(eu, 'he'); dar(eu, 'flash');
  const vistos = [];
  for (let i = 0; i < 3; i++) {
    const ev = rodar(m, 0, { slot: 'granada' });
    rodar(m, 0);
    vistos.push([eu.armas.granada.sel, eu.slot, ev.some((x) => x.tipo === 'saque')]);
  }
  assert.deepEqual(vistos, [['he', 'granada', true], ['flash', 'granada', false], ['he', 'granada', false]]);
});

test('jogar volta para a arma anterior', () => {
  const m = cenario(); const eu = m.entidades[0]; zerar(eu); dar(eu, 'he', 2);
  rodar(m, 0, { slot: 'granada' });
  for (let i = 0; i < 3; i++) rodar(m, 0, { atirar: true });
  assert.equal(m.granadas?.length ?? 0, 0);
  const ev = rodar(m, 0);
  assert.equal(m.granadas.length, 1);
  assert.equal(eu.slot, 'primaria');
  assert.equal(eu.slotAnterior, 'granada');
  assert.ok(ev.some((x) => x.tipo === 'saque' && x.arma === 'rifle'));
});

test('trocar de arma com o pino puxado cancela', () => {
  const m = cenario(); const eu = m.entidades[0]; zerar(eu); dar(eu, 'he');
  rodar(m, 0, { slot: 'granada' });
  rodar(m, 0, { atirar: true });
  assert.ok(eu.armas.granada.pino);
  rodar(m, 0, { slot: 'pistola', atirar: true });
  rodar(m, 0);
  assert.equal(m.granadas?.length ?? 0, 0);
  assert.equal(eu.equip.granadas.he, 1);
  assert.equal(eu.armas.granada.pino, null);
  assert.equal(eu.slot, 'pistola');
});

test('jogar a última granada sai do slot e o 4 não entra mais', () => {
  const m = cenario(); const eu = m.entidades[0]; zerar(eu); dar(eu, 'he');
  rodar(m, 0, { slot: 'granada' });
  rodar(m, 0, { atirar: true });
  rodar(m, 0);
  assert.equal(m.granadas.length, 1);
  assert.equal(eu.slot, 'primaria');
  rodar(m, 0, { slot: 'granada' });
  assert.equal(eu.slot, 'primaria');
});

test('lembra o último tipo ao voltar; troca se acabou', () => {
  const m = cenario(); const eu = m.entidades[0]; zerar(eu); dar(eu, 'he'); dar(eu, 'flash', 2);
  rodar(m, 0, { slot: 'granada' });
  rodar(m, 0, { slot: 'granada' });
  assert.equal(eu.armas.granada.sel, 'flash');
  rodar(m, 0, { slot: 'primaria' });
  rodar(m, 0, { slot: 'granada' });
  assert.equal(eu.armas.granada.sel, 'flash');
  rodar(m, 0, { slot: 'primaria' });
  eu.equip.granadas.flash = 0;
  rodar(m, 0, { slot: 'granada' });
  assert.equal(eu.armas.granada.sel, 'he');
});

test('a roda só passa pela granada com estoque', () => {
  const m = cenario(); const eu = m.entidades[0]; zerar(eu);
  eu.slot = 'faca';
  rodar(m, 0, { slot: 'roda+' });
  assert.equal(eu.slot, 'primaria');
  const m2 = cenario(); const eu2 = m2.entidades[0]; zerar(eu2); dar(eu2, 'flash');
  eu2.slot = 'faca';
  rodar(m2, 0, { slot: 'roda+' });
  assert.equal(eu2.slot, 'granada');
});

test('velocidade com granada na mão é a da faca', () => {
  const m = cenario(); const eu = m.entidades[0]; zerar(eu); dar(eu, 'he');
  eu.pos = { x: 0, y: 0, z: 0 };
  rodar(m, 0, { slot: 'granada' });
  for (let i = 0; i < 20; i++) rodar(m, 0, { frente: 1 });
  assert.ok(Math.abs(eu.velHoriz - 6.2) < 0.05, String(eu.velHoriz));
});

test('pino puxado e fim do round (comBomba falso) cancela, não lança', () => {
  const m = cenario(); const eu = m.entidades[0]; zerar(eu); dar(eu, 'he');
  rodar(m, 0, { slot: 'granada' });
  rodar(m, 0, { atirar: true });
  assert.ok(eu.armas.granada.pino);
  passo(m, 0.05, new Map([[0, cmd()]]), { comBomba: false });
  assert.equal(m.granadas?.length ?? 0, 0);
  assert.equal(eu.equip.granadas.he, 1);
  assert.equal(eu.armas.granada.pino, null);
  assert.equal(eu.slot, 'granada');
});

test('pino puxado e congelado cancela, não lança', () => {
  const m = cenario(); const eu = m.entidades[0]; zerar(eu); dar(eu, 'he');
  rodar(m, 0, { slot: 'granada' });
  rodar(m, 0, { atirar: true });
  passo(m, 0.05, new Map([[0, cmd()]]), { congelado: true });
  passo(m, 0.05, new Map([[0, cmd()]]));
  assert.equal(m.granadas?.length ?? 0, 0);
  assert.equal(eu.equip.granadas.he, 1);
  assert.equal(eu.armas.granada.pino, null);
});

test('pino puxado e segurar usar (plantar) cancela, não lança', () => {
  const { criarBomba, acaoPossivel } = BOMBA_MOD;
  const m = cenario(); const t = m.entidades[5]; zerar(t); dar(t, 'he');
  m.bomba = criarBomba(m, 'laranja');
  m.bomba.portador = 5;
  t.pos = { ...MAPA.bombsites.A.centro, y: 0 };
  rodar(m, 5, { slot: 'granada' });
  rodar(m, 5, { atirar: true });
  assert.ok(t.armas.granada.pino);
  assert.equal(acaoPossivel(m, t), 'plantar');
  const ev = passo(m, 0.05, new Map([[5, cmd({ usar: true })]]));
  assert.ok(ev.some((x) => x.tipo === 'acao-inicio'));
  passo(m, 0.05, new Map([[5, cmd()]]));
  assert.equal(m.granadas?.length ?? 0, 0);
  assert.equal(t.equip.granadas.he, 1);
  assert.equal(t.armas.granada.pino, null);
});
