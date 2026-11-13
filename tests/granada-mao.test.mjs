import test from 'node:test';
import assert from 'node:assert/strict';
import { mod } from './_repo.mjs';

const { criarMundo, posicionarParaRound } = await mod('packages/sim/src/mundo.js');
const G = await mod('packages/sim/src/granadas.js');
const E = await mod('packages/sim/src/economia.js');
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
  if (economia) E.iniciarEconomia(mundo);
  posicionarParaRound(mundo, 'A');
  mundo.entidades.forEach((e, i) => { e.pos = { x: 50, y: 0, z: 50 - i * 0.5 }; e.noChao = true; });
  return mundo;
}
const dar = (e, tipo, n = 1) => { e.equip.granadas[tipo] = n; };

test('proximaGranada segue HE → flash → smoke e pula estoque zero', () => {
  assert.equal(G.proximaGranada({ he: 1, flash: 2, smoke: 1 }, null), 'he');
  assert.equal(G.proximaGranada({ he: 1, flash: 2, smoke: 1 }, 'he'), 'flash');
  assert.equal(G.proximaGranada({ he: 1, flash: 2, smoke: 1 }, 'smoke'), 'he');
  assert.equal(G.proximaGranada({ he: 0, flash: 1, smoke: 0 }, 'flash'), 'flash');
  assert.equal(G.proximaGranada({ he: 0, flash: 0, smoke: 0 }, 'he'), null);
});
test('lancar usa a força pedida (mira reta)', () => {
  for (const [forca, v, s] of [['longe', 18, 4], ['medio', 12, 3], ['curto', 7, 2]]) {
    const m = cenario(); const eu = m.entidades[0]; dar(eu, 'he'); eu.yaw = 0; eu.pitch = 0;
    assert.ok(G.lancar(m, eu, 'he', [], null, forca));
    const g = m.granadas[0];
    assert.ok(Math.abs(Math.hypot(g.vel.x, g.vel.z) - v) < 1e-6, forca);
    assert.ok(Math.abs(g.vel.y - s) < 1e-6, forca);
  }
});
test('atualizarMao: segurar e soltar o esquerdo joga longe; o direito, curto; os dois, médio', () => {
  for (const [seq, v] of [[[{ atirar: true }], 18], [[{ zoom: true }], 7], [[{ atirar: true }, { atirar: true, zoom: true }, { zoom: true }], 12]]) {
    const m = cenario(); const eu = m.entidades[0]; dar(eu, 'he');
    eu.armas.granada = G.criarMao(); eu.armas.granada.sel = 'he';
    for (const c of seq) assert.equal(G.atualizarMao(m, eu, cmd(c), []), false);
    assert.equal(m.granadas?.length ?? 0, 0); // ainda segurando: nada saiu
    assert.equal(G.atualizarMao(m, eu, cmd(), []), true);
    assert.ok(Math.abs(Math.hypot(m.granadas[0].vel.x, m.granadas[0].vel.z) - v) < 1e-6);
    assert.equal(eu.equip.granadas.he, 0);
  }
});
test('atualizarMao sem botão não faz nada', () => {
  const m = cenario(); const eu = m.entidades[0]; dar(eu, 'he');
  eu.armas.granada = G.criarMao(); eu.armas.granada.sel = 'he';
  assert.equal(G.atualizarMao(m, eu, cmd(), []), false);
  assert.equal(eu.armas.granada.pino, null);
});
test('criarMao, ARMAS.granada, SAQUE e ORDEM_GRANADAS', async () => {
  const C = await mod('packages/sim/src/config.js');
  const A = await mod('packages/sim/src/armas.js');
  assert.deepEqual(C.ORDEM_GRANADAS, ['he', 'molotov', 'flash', 'smoke']);
  assert.equal(C.ARMAS.granada.slot, 'granada');
  assert.equal(C.ARMAS.granada.vel, 6.2);
  assert.equal(A.SAQUE.granada, 0.3);
  const mao = G.criarMao();
  assert.equal(mao.tipo, 'granada'); assert.equal(mao.sel, null); assert.equal(mao.pino, null);
});
test('curto sai 0,3 m mais baixo', () => {
  const alt = {};
  for (const f of ['longe', 'curto']) {
    const m = cenario(); const eu = m.entidades[0]; dar(eu, 'he'); eu.yaw = 0; eu.pitch = 0;
    G.lancar(m, eu, 'he', [], null, f); alt[f] = m.granadas[0].pos.y;
  }
  assert.ok(Math.abs(alt.longe - alt.curto - 0.3) < 1e-6);
});
