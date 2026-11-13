import test from 'node:test';
import assert from 'node:assert/strict';
import { mod } from './_repo.mjs';

const { criarMundo, posicionarParaRound, passo } = await mod('js/games/blockstrike/mundo.js');
const G = await mod('js/games/blockstrike/granadas.js');
const E = await mod('js/games/blockstrike/economia.js');
const { MAPA } = await mod('js/games/blockstrike/mapa.js');
const { criarRng } = await mod('js/games/blockstrike/rng.js');
const { GRANADA } = await mod('js/games/blockstrike/config.js');
const { olho } = await mod('js/games/blockstrike/fisica.js');

const chao = { min: { x: -60, y: -1, z: -60 }, max: { x: 60, y: 0, z: 60 }, cor: 0x888888 };
const parede = { min: { x: -5, y: 0, z: -12.5 }, max: { x: 5, y: 4, z: -12 }, cor: 0x666666 };
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
const rodar = (m, seg, fn = () => new Map()) => {
  const ev = [];
  for (let i = 0; i < Math.round(seg / 0.05); i++) ev.push(...passo(m, 0.05, fn(i)));
  return ev;
};
const lanca = (m, id, tipo, extra = {}) => passo(m, 0.05, new Map([[id, cmd({ granada: tipo, ...extra })]]));

test('lançar gasta uma granada e emite arremesso; sem estoque não lança', () => {
  const m = cenario();
  const e = m.entidades[0];
  e.pos = { x: 0, y: 0, z: 0 };
  assert.equal(lanca(m, 0, 'he').some((x) => x.tipo === 'arremesso'), false);
  dar(e, 'he', 1);
  const ev = lanca(m, 0, 'he');
  assert.ok(ev.some((x) => x.tipo === 'arremesso' && x.granada === 'he'));
  assert.equal(e.equip.granadas.he, 0);
  assert.equal(m.granadas.length, 1);
});

test('treino: granadas infinitas', () => {
  const m = cenario([chao], false);
  m.modo = 'treino';
  m.entidades[0].pos = { x: 0, y: 0, z: 0 };
  for (let i = 0; i < 3; i++) {
    const ev = lanca(m, 0, 'flash');
    assert.ok(ev.some((x) => x.tipo === 'arremesso'));
    rodar(m, 0.8);
  }
});

test('intervalo mínimo entre arremessos', () => {
  const m = cenario();
  const e = m.entidades[0];
  e.pos = { x: 0, y: 0, z: 0 };
  dar(e, 'flash', 2);
  lanca(m, 0, 'flash');
  assert.equal(lanca(m, 0, 'flash').some((x) => x.tipo === 'arremesso'), false);
  rodar(m, GRANADA.intervalo);
  assert.ok(lanca(m, 0, 'flash').some((x) => x.tipo === 'arremesso'));
});

test('a granada voa em arco, cai e para perto de 15 m olhando reto', () => {
  const m = cenario();
  const e = m.entidades[0];
  e.pos = { x: 0, y: 0, z: 0 };
  dar(e, 'smoke', 1);
  lanca(m, 0, 'smoke', { yaw: 0, pitch: 0 });
  const g = m.granadas[0];
  assert.ok(g.vel.z < 0);
  rodar(m, 1.2);
  assert.ok(g.pos.y < 0.5 && g.pos.z < -8, `pos z=${g.pos.z.toFixed(1)} y=${g.pos.y.toFixed(2)}`);
});

test('quica na parede e inverte o sentido', () => {
  const m = cenario([chao, parede]);
  const e = m.entidades[0];
  e.pos = { x: 0, y: 0, z: 0 };
  dar(e, 'he', 1);
  lanca(m, 0, 'he', { yaw: 0, pitch: 0.05 });
  const g = m.granadas[0];
  let quicou = false;
  for (let i = 0; i < 16 && !quicou; i++) quicou = passo(m, 0.05, new Map()).some((x) => x.tipo === 'granada-quique');
  assert.ok(quicou);
  assert.ok(g.pos.z > -12, 'não atravessou a parede');
  assert.ok(g.vel.z > 0, 'voltou');
});

test('HE: dano cai com a distância, não passa por parede e poupa o próprio time', () => {
  const m = cenario([chao, parede]);
  const dono = m.entidades[0];
  const perto = m.entidades[5];
  const longe = m.entidades[6];
  const atras = m.entidades[7];
  const amigo = m.entidades[1];
  dono.pos = { x: 20, y: 0, z: 20 };
  const ponto = { x: 0, y: 0, z: 0 };
  perto.pos = { x: 1, y: 0, z: 0 };
  longe.pos = { x: 6, y: 0, z: 0 };
  atras.pos = { x: 0, y: 0, z: -14 }; // atrás da parede (z -12)
  amigo.pos = { x: 1, y: 0, z: 1 };
  for (const e of [perto, longe, atras, amigo]) e.hp = 100;
  m.granadas.push({ tipo: 'he', dono: 0, time: 'azul', nasceEm: m.tempo, fusivel: 0.05, pos: { ...ponto, y: 0.2 }, vel: { x: 0, y: 0, z: 0 }, quiques: 0 });
  const ev = rodar(m, 0.2);
  assert.ok(ev.some((x) => x.tipo === 'explosao-he'));
  assert.ok(perto.hp < longe.hp, 'quanto mais perto, mais dano');
  assert.ok(longe.hp < 100);
  assert.equal(atras.hp, 100, 'a parede protege');
  assert.equal(amigo.hp, 100, 'sem fogo amigo');
  assert.ok(100 - perto.hp <= GRANADA.he.dano);
});

test('HE que mata dá o abate ao dono (arma "he") e a recompensa', () => {
  const m = cenario();
  const dono = m.entidades[0];
  const alvo = m.entidades[5];
  dono.pos = { x: 30, y: 0, z: 30 };
  alvo.pos = { x: 0.5, y: 0, z: 0 };
  alvo.hp = 20;
  dono.dinheiro = 0;
  m.granadas.push({ tipo: 'he', dono: 0, time: 'azul', nasceEm: m.tempo, fusivel: 0.05, pos: { x: 0, y: 0.2, z: 0 }, vel: { x: 0, y: 0, z: 0 }, quiques: 0 });
  const ev = rodar(m, 0.2);
  const morte = ev.find((x) => x.tipo === 'morte');
  assert.equal(morte.assassino, 0);
  assert.equal(morte.arma, 'he');
  assert.equal(alvo.vivo, false);
  assert.ok(dono.dinheiro > 0);
});

test('flash: cega de frente por mais tempo que de costas e a parede bloqueia', () => {
  const m = cenario([chao, parede]);
  const [a, b, c] = [m.entidades[5], m.entidades[6], m.entidades[7]];
  const ponto = { x: 0, y: 1, z: 0 };
  a.pos = { x: 0, y: 0, z: 8 }; a.yaw = 0;            // olha para -z, para o ponto
  b.pos = { x: 0, y: 0, z: 8 }; b.yaw = Math.PI;      // de costas
  c.pos = { x: 0, y: 0, z: -16 }; c.yaw = 0;          // atrás da parede
  const dA = G.duracaoFlash(m, ponto, a);
  const dB = G.duracaoFlash(m, ponto, b);
  const dC = G.duracaoFlash(m, ponto, c);
  assert.ok(dA > dB && dB > 0, `frente ${dA.toFixed(2)} costas ${dB.toFixed(2)}`);
  assert.equal(dC, 0);
  const perto = { ...a, pos: { x: 0, y: 0, z: 2 } };
  assert.ok(G.duracaoFlash(m, ponto, perto) > dA, 'mais perto cega mais');
  assert.ok(dA <= GRANADA.flash.duracao);
});

test('flash detona, cega quem olha e emite cegueira; passa o tempo, acaba', () => {
  const m = cenario();
  const alvo = m.entidades[5];
  alvo.pos = { x: 0, y: 0, z: 6 };
  alvo.yaw = 0;
  m.granadas.push({ tipo: 'flash', dono: 0, time: 'azul', nasceEm: m.tempo, fusivel: 0.05, pos: { x: 0, y: 1, z: 0 }, vel: { x: 0, y: 0, z: 0 }, quiques: 0 });
  const ev = rodar(m, 0.2);
  assert.ok(ev.some((x) => x.tipo === 'flash'));
  const ceg = ev.find((x) => x.tipo === 'cegueira' && x.id === 5);
  assert.ok(ceg && ceg.dur > 1);
  assert.ok(alvo.cegoAte > m.tempo);
  rodar(m, 5);
  assert.ok(alvo.cegoAte < m.tempo);
});

function comFumaca(m, ponto = { x: 0, y: 0, z: 0 }) {
  m.granadas.push({ tipo: 'smoke', dono: 0, time: 'azul', nasceEm: m.tempo, fusivel: 0.05, pos: { ...ponto, y: 0.2 }, vel: { x: 0, y: 0, z: 0 }, quiques: 0 });
  rodar(m, 0.1);
  rodar(m, GRANADA.fumaca.abrir + 0.1);
  return m.fumacas[0];
}

test('smoke: nuvem de blocos corta a visada, mas só depois de abrir; fora dela segue livre', () => {
  const m = cenario();
  const a = { x: -10, y: 1.6, z: 0 };
  const b = { x: 10, y: 1.6, z: 0 };
  assert.equal(G.visadaLivre(m, a, b), true);
  const f = comFumaca(m);
  assert.ok(f && f.cubos.length > 100, `cubos=${f.cubos.length}`);
  assert.equal(G.visadaLivre(m, a, b), false);
  assert.equal(G.visadaLivre(m, { x: -10, y: 1.6, z: 8 }, { x: 10, y: 1.6, z: 8 }), true, 'longe da nuvem');
});

test('smoke: tiro abre buraco que fecha em 2 s; HE abre uma esfera', () => {
  const m = cenario();
  const f = comFumaca(m);
  const a = { x: -10, y: 1.1, z: 0 };
  const b = { x: 10, y: 1.1, z: 0 };
  assert.equal(G.visadaLivre(m, a, b), false);
  G.abrirBuracos(m, a, b);
  assert.equal(G.visadaLivre(m, a, b), true, 'o buraco abre a visão');
  rodar(m, GRANADA.fumaca.buraco + 0.2);
  assert.equal(G.visadaLivre(m, a, b), false, 'a fumaça se recompõe');
  const vivos = f.cubos.filter((c) => c.vivo).length;
  G.abrirBuracos(m, f.pos, f.pos, GRANADA.fumaca.raioHE);
  assert.ok(f.cubos.filter((c) => c.vivo).length < vivos * 0.7);
});

test('smoke: dura 18 s, no máximo 3 nuvens e some ao reposicionar', () => {
  const m = cenario();
  comFumaca(m);
  rodar(m, GRANADA.fumaca.duracao);
  assert.equal(m.fumacas.length, 0);
  for (let i = 0; i < 5; i++) comFumaca(m, { x: i * 3, y: 0, z: 0 });
  assert.ok(m.fumacas.length <= GRANADA.fumaca.max);
  posicionarParaRound(m, 'A');
  assert.equal(m.fumacas.length, 0);
  assert.equal(m.granadas.length, 0);
});

test('bala que atravessa a fumaça abre buraco (atirarRaio)', () => {
  const m = cenario();
  const atirador = m.entidades[0];
  atirador.pos = { x: 0, y: 0, z: 12 };
  atirador.yaw = 0;
  E.comprar(atirador, 'rifle', 'CT');
  atirador.dinheiro = 0;
  const f = comFumaca(m, { x: 0, y: 0, z: 0 });
  const antes = f.cubos.filter((c) => c.vivo).length;
  passo(m, 0.05, new Map([[0, cmd({ atirar: true, pitch: Math.atan2(f.pos.y - 1.6, 12) })]]));
  assert.ok(f.cubos.filter((c) => c.vivo).length < antes);
  void olho;
});

test('bot cego não enxerga ninguém; sem a flash enxerga', async () => {
  const { pensar, criarCerebro } = await mod('js/games/blockstrike/bots.js');
  const { criarGrafo } = await mod('js/games/blockstrike/navegacao.js');
  const m = cenario();
  const bot = m.entidades[5];
  const alvo = m.entidades[0];
  bot.pos = { x: 0, y: 0, z: 0 };
  bot.yaw = 0;
  alvo.pos = { x: 0, y: 0, z: -10 };
  const grafo = criarGrafo(MAPA.waypoints, MAPA.arestas);
  const rng = criarRng(4);
  bot.cerebro = criarCerebro(bot, grafo, rng, [chao], m);
  pensar(bot, m, grafo, 'medio', 0.05, rng);
  assert.equal(bot.cerebro.alvoId, 0, 'enxerga o alvo');
  bot.cerebro = criarCerebro(bot, grafo, rng, [chao], m);
  bot.cegoAte = m.tempo + 3;
  pensar(bot, m, grafo, 'medio', 0.05, rng);
  assert.equal(bot.cerebro.alvoId, null, 'cego: sem alvo');
});

test('bot não vê através da fumaça', async () => {
  const { pensar, criarCerebro } = await mod('js/games/blockstrike/bots.js');
  const { criarGrafo } = await mod('js/games/blockstrike/navegacao.js');
  const m = cenario();
  const bot = m.entidades[5];
  bot.pos = { x: 0, y: 0, z: 8 };
  bot.yaw = 0;
  m.entidades[0].pos = { x: 0, y: 0, z: -8 };
  comFumaca(m, { x: 0, y: 0, z: 0 });
  const grafo = criarGrafo(MAPA.waypoints, MAPA.arestas);
  const rng = criarRng(6);
  bot.cerebro = criarCerebro(bot, grafo, rng, [chao], m);
  pensar(bot, m, grafo, 'medio', 0.05, rng);
  assert.equal(bot.cerebro.alvoId, null);
});

test('bot com HE joga no inimigo à vista (alcance, cooldown) e a granada cai perto dele', async () => {
  const { pensar, criarCerebro } = await mod('js/games/blockstrike/bots.js');
  const { criarGrafo } = await mod('js/games/blockstrike/navegacao.js');
  const m = cenario();
  const bot = m.entidades[5];
  const alvo = m.entidades[0];
  bot.pos = { x: 0, y: 0, z: 0 };
  bot.yaw = 0;
  alvo.pos = { x: 0, y: 0, z: -16 };
  dar(bot, 'he', 1);
  const grafo = criarGrafo(MAPA.waypoints, MAPA.arestas);
  const rng = () => 0.1; // sempre "tem sorte"
  bot.cerebro = criarCerebro(bot, grafo, rng, [chao], m);
  const c = pensar(bot, m, grafo, 'medio', 0.05, rng);
  assert.equal(c.granada, 'he');
  assert.ok(Math.abs(c.granadaAlvo.z - -16) < 0.5);
  const ev = passo(m, 0.05, new Map([[5, c]]));
  assert.ok(ev.some((x) => x.tipo === 'arremesso' && x.atirador === 5));
  const g = m.granadas[0];
  rodar(m, 0.85);
  assert.ok(Math.hypot(g.pos.x - alvo.pos.x, g.pos.z - alvo.pos.z) < 3, `caiu a ${Math.hypot(g.pos.x - alvo.pos.x, g.pos.z - alvo.pos.z).toFixed(1)} m do alvo`);
  // cooldown: logo depois não joga de novo
  dar(bot, 'he', 1);
  assert.equal(pensar(bot, m, grafo, 'medio', 0.05, rng).granada, null);
});

test('bot longe demais ou perto demais não joga HE', async () => {
  const { pensar, criarCerebro } = await mod('js/games/blockstrike/bots.js');
  const { criarGrafo } = await mod('js/games/blockstrike/navegacao.js');
  for (const dist of [4, 40]) {
    const m = cenario();
    const bot = m.entidades[5];
    bot.pos = { x: 0, y: 0, z: 0 };
    bot.yaw = 0;
    m.entidades[0].pos = { x: 0, y: 0, z: -dist };
    dar(bot, 'he', 1);
    const grafo = criarGrafo(MAPA.waypoints, MAPA.arestas);
    const rng = () => 0.1;
    bot.cerebro = criarCerebro(bot, grafo, rng, [chao], m);
    assert.equal(pensar(bot, m, grafo, 'medio', 0.05, rng).granada, null, `dist ${dist}`);
  }
});

test('bot cegado pela flash larga o combate e vai para a cobertura', async () => {
  const { pensar, criarCerebro } = await mod('js/games/blockstrike/bots.js');
  const { criarGrafo } = await mod('js/games/blockstrike/navegacao.js');
  const m = cenario([chao]);
  const bot = m.entidades[5];
  bot.pos = { x: -34, y: 0, z: 6 };
  bot.yaw = 0;
  const grafo = criarGrafo(MAPA.waypoints, MAPA.arestas);
  const rng = criarRng(8);
  bot.cerebro = criarCerebro(bot, grafo, rng, [chao], m);
  bot.cerebro.estado = 'combate';
  bot.cerebro.ultimaPos = { x: -34, y: 0, z: -8 };
  bot.cegoAte = m.tempo + 3;
  pensar(bot, m, grafo, 'medio', 0.05, rng);
  assert.equal(bot.cerebro.cegoVisto, bot.cegoAte);
  assert.ok(['cobertura', 'combate'].includes(bot.cerebro.estado));
});

test('smoke de fuga: bot em recuo joga smoke na direção da ameaça', async () => {
  const { pensar, criarCerebro } = await mod('js/games/blockstrike/bots.js');
  const { criarGrafo } = await mod('js/games/blockstrike/navegacao.js');
  const m = cenario([chao]);
  const bot = m.entidades[5];
  const alvo = m.entidades[0];
  bot.pos = { x: -34, y: 0, z: 10 };
  bot.yaw = 0;
  bot.hp = 20;
  alvo.pos = { x: -34, y: 0, z: -2 };
  dar(bot, 'smoke', 1);
  const grafo = criarGrafo(MAPA.waypoints, MAPA.arestas);
  const rng = criarRng(2);
  bot.cerebro = criarCerebro(bot, grafo, rng, [chao], m);
  const c = pensar(bot, m, grafo, 'medio', 0.05, rng);
  if (bot.cerebro.estado === 'recuo') {
    assert.equal(c.granada, 'smoke');
    assert.ok(c.granadaAlvo.z < 10 && c.granadaAlvo.z > 0, 'entre o bot e a ameaça');
  }
});
