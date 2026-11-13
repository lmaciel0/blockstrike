import test from 'node:test';
import assert from 'node:assert/strict';
import { mod } from './_repo.mjs';

const { criarMundo, posicionarParaRound, passo } = await mod('packages/sim/src/mundo.js');
const { criarBomba, siteEm, acaoPossivel } = await mod('packages/sim/src/bomba.js');
const { MAPA } = await mod('packages/sim/src/mapa.js');
const { criarRng } = await mod('packages/sim/src/rng.js');
const { BOMBA } = await mod('packages/sim/src/config.js');

const chao = { min: { x: -50, y: -1, z: -50 }, max: { x: 50, y: 0, z: 50 }, cor: 0x888888 };
const cmd = (extra = {}) => ({
  frente: 0, lado: 0, pular: false, agachar: false, devagar: false, atirar: false,
  zoom: false, recarregar: false, usar: false, slot: null, yaw: 0, pitch: 0, ...extra,
});

// Round 1: laranja é T. Todos longe, exceto o que o teste mexer. Entidade 5 = T, 0 = CT.
function cenario() {
  const mundo = criarMundo({
    mapa: { ...MAPA, caixas: [chao] }, primariaJogador: 'rifle', dificuldade: 'medio', rng: criarRng(11),
  });
  posicionarParaRound(mundo, 'A');
  mundo.entidades.forEach((e, i) => { e.pos = { x: 45, y: 0, z: -45 + i * 0.5 }; e.noChao = true; });
  mundo.bomba = criarBomba(mundo, 'laranja');
  mundo.bomba.portador = 5;
  return mundo;
}
const siteA = MAPA.bombsites.A.centro;
const rodar = (m, seg, comandos, opcoes) => {
  const ev = [];
  for (let i = 0; i < Math.round(seg / 0.05); i++) ev.push(...passo(m, 0.05, comandos(i), opcoes));
  return ev;
};
const so = (id, c) => () => new Map([[id, c]]);

test('criarBomba sorteia um terrorista vivo e um bombsite', () => {
  const m = cenario();
  const b = criarBomba(m, 'laranja');
  assert.equal(m.entidades[b.portador].time, 'laranja');
  assert.ok(['A', 'B'].includes(b.siteAlvo));
  assert.equal(b.plantada, false);
  assert.equal(b.restante, BOMBA.explode);
});

test('siteEm reconhece A, B e fora', () => {
  assert.equal(siteEm(MAPA, siteA), 'A');
  assert.equal(siteEm(MAPA, MAPA.bombsites.B.centro), 'B');
  assert.equal(siteEm(MAPA, { x: 0, z: 20 }), null);
});

test('portador planta no site segurando E por 3,2 s, parado', () => {
  const m = cenario();
  const t = m.entidades[5];
  t.pos = { x: siteA.x, y: 0, z: siteA.z };
  assert.equal(acaoPossivel(m, t), 'plantar');
  const ev = rodar(m, 1, so(5, cmd({ usar: true, frente: 1 })));
  assert.ok(ev.some((e) => e.tipo === 'acao-inicio' && e.acao === 'plantar'));
  assert.equal(t.pos.x, siteA.x, 'não anda enquanto planta');
  assert.ok(m.bomba.acao.t > 0.9 && !m.bomba.plantada);
  const ev2 = rodar(m, 2.4, so(5, cmd({ usar: true })));
  assert.ok(m.bomba.plantada);
  const plantada = ev2.find((e) => e.tipo === 'plantada');
  assert.equal(plantada.site, 'A');
  assert.deepEqual(m.bomba.pos, { x: siteA.x, y: 0, z: siteA.z });
  assert.equal(m.bomba.portador, null);
});

test('soltar E cancela e zera o progresso', () => {
  const m = cenario();
  m.entidades[5].pos = { x: siteA.x, y: 0, z: siteA.z };
  rodar(m, 2, so(5, cmd({ usar: true })));
  const ev = rodar(m, 0.1, so(5, cmd()));
  assert.ok(ev.some((e) => e.tipo === 'acao-cancelada'));
  assert.equal(m.bomba.acao, null);
  rodar(m, 2, so(5, cmd({ usar: true })));
  assert.ok(!m.bomba.plantada, 'recomeçou do zero');
});

test('fora do bombsite, no ar ou sem a C4 não planta', () => {
  const m = cenario();
  const t = m.entidades[5];
  t.pos = { x: 0, y: 0, z: 20 };
  assert.equal(acaoPossivel(m, t), null);
  t.pos = { x: siteA.x, y: 0, z: siteA.z };
  m.bomba.portador = 6;
  assert.equal(acaoPossivel(m, t), null);
  m.bomba.portador = 5;
  t.noChao = false;
  assert.equal(acaoPossivel(m, t), null);
});

test('CT desarma em 10 s (5 s com kit) perto da C4 plantada', () => {
  for (const [kit, seg] of [[false, BOMBA.desarmar], [true, BOMBA.desarmarKit]]) {
    const m = cenario();
    m.bomba.plantada = true;
    m.bomba.pos = { x: siteA.x, y: 0, z: siteA.z };
    m.bomba.site = 'A';
    const ct = m.entidades[0];
    ct.kit = kit;
    ct.pos = { x: siteA.x + 1, y: 0, z: siteA.z };
    assert.equal(acaoPossivel(m, ct), 'desarmar');
    rodar(m, seg - 0.5, so(0, cmd({ usar: true })));
    assert.ok(!m.bomba.desarmada, `kit=${kit}: ainda não`);
    const ev = rodar(m, 0.7, so(0, cmd({ usar: true })));
    assert.ok(m.bomba.desarmada, `kit=${kit}: desarmou`);
    assert.ok(ev.some((e) => e.tipo === 'desarmada'));
  }
});

test('CT longe da C4 não desarma', () => {
  const m = cenario();
  m.bomba.plantada = true;
  m.bomba.pos = { x: siteA.x, y: 0, z: siteA.z };
  m.entidades[0].pos = { x: siteA.x + 3, y: 0, z: siteA.z };
  assert.equal(acaoPossivel(m, m.entidades[0]), null);
});

test('explode em 40 s e mata quem está no raio', () => {
  const m = cenario();
  m.bomba.plantada = true;
  m.bomba.pos = { x: siteA.x, y: 0, z: siteA.z };
  m.entidades[0].pos = { x: siteA.x + 5, y: 0, z: siteA.z };
  m.entidades[1].pos = { x: siteA.x + 30, y: 0, z: siteA.z };
  const ev = rodar(m, BOMBA.explode - 1, () => new Map());
  assert.ok(!m.bomba.explodiu);
  assert.ok(Math.abs(m.bomba.restante - 1) < 0.2);
  const ev2 = rodar(m, 1.2, () => new Map());
  assert.ok(m.bomba.explodiu);
  assert.ok(ev2.some((e) => e.tipo === 'explosao'));
  assert.equal(m.entidades[0].vivo, false);
  assert.equal(m.entidades[1].vivo, true, 'longe do raio sobrevive');
  const morte = ev2.find((e) => e.tipo === 'morte' && e.vitima === 0);
  assert.equal(morte.assassino, null);
  assert.equal(morte.arma, 'c4');
  void ev;
});

test('portador morto solta a C4 e outro terrorista a pega passando por cima', () => {
  const m = cenario();
  const t = m.entidades[5];
  t.pos = { x: 10, y: 0, z: 10 };
  t.hp = 0;
  const ev = rodar(m, 0.2, () => new Map());
  assert.ok(ev.some((e) => e.tipo === 'bomba-solta'));
  assert.equal(m.bomba.portador, null);
  assert.deepEqual(m.bomba.pos, { x: 10, y: 0, z: 10 });
  m.entidades[7].pos = { x: 10.5, y: 0, z: 10 };
  const ev2 = rodar(m, 0.1, () => new Map());
  assert.ok(ev2.some((e) => e.tipo === 'bomba-pega' && e.id === 7));
  assert.equal(m.bomba.portador, 7);
  assert.equal(m.bomba.pos, null);
});

test('CT não pega a C4 solta', () => {
  const m = cenario();
  m.bomba.portador = null;
  m.bomba.pos = { x: 10, y: 0, z: 10 };
  m.entidades[0].pos = { x: 10, y: 0, z: 10 };
  rodar(m, 0.2, () => new Map());
  assert.equal(m.bomba.portador, null);
});

test('comBomba falso congela a C4; congelado também', () => {
  const m = cenario();
  m.bomba.plantada = true;
  m.bomba.pos = { x: siteA.x, y: 0, z: siteA.z };
  rodar(m, 2, () => new Map(), { comBomba: false });
  assert.equal(m.bomba.restante, BOMBA.explode);
  rodar(m, 2, () => new Map(), { congelado: true });
  assert.equal(m.bomba.restante, BOMBA.explode);
});

test('sem mundo.bomba (treino) nada muda', () => {
  const m = cenario();
  m.bomba = null;
  m.entidades[5].pos = { x: siteA.x, y: 0, z: siteA.z };
  rodar(m, 1, so(5, cmd({ usar: true })));
  assert.equal(m.bomba, null);
});
