import test from 'node:test';
import assert from 'node:assert/strict';
import { mod } from './_repo.mjs';

const { criarMundo, posicionarParaRound, passo, vivosPorTime } =
  await mod('js/games/blockstrike/mundo.js');
const { olho, direcao } = await mod('js/games/blockstrike/fisica.js');
const { MAPA } = await mod('js/games/blockstrike/mapa.js');
const { criarArma } = await mod('js/games/blockstrike/armas.js');
const { criarRng } = await mod('js/games/blockstrike/rng.js');
const { JOGADOR, NOMES_BOTS } = await mod('js/games/blockstrike/config.js');

const chao = { min: { x: -50, y: -1, z: -50 }, max: { x: 50, y: 0, z: 50 }, cor: 0x888888 };
const cmd = (extra = {}) => ({
  frente: 0, lado: 0, pular: false, agachar: false, devagar: false, atirar: false,
  zoom: false, recarregar: false, slot: null, yaw: 0, pitch: 0, ...extra,
});
const novo = (caixas = [chao]) => {
  const mundo = criarMundo({
    mapa: { ...MAPA, caixas }, primariaJogador: 'rifle', dificuldade: 'medio', rng: criarRng(1),
  });
  posicionarParaRound(mundo, 'A');
  mundo.entidades[0].pos = { x: 0, y: 0, z: 0 };
  return mundo;
};
const rodar = (mundo, n, fn, opcoes = { congelado: false }) => {
  for (let i = 0; i < n; i++) passo(mundo, 0.05, new Map([[0, fn(i)]]), opcoes);
};
const jogador = (m) => m.entidades[0];

test('criarMundo tem 5 azuis (jogador id 0) e 5 laranja', () => {
  const m = criarMundo({ mapa: MAPA, primariaJogador: 'smg', dificuldade: 'facil', rng: criarRng(2) });
  assert.equal(m.entidades.length, 10);
  assert.equal(m.jogadorId, 0);
  assert.equal(m.tempo, 0);
  assert.equal(m.entidades[0].bot, false);
  assert.equal(m.entidades[0].time, 'azul');
  assert.equal(m.entidades[0].primariaEscolhida, 'smg');
  assert.equal(m.entidades.filter((e) => e.time === 'azul').length, 5);
  assert.equal(m.entidades.filter((e) => e.time === 'laranja').length, 5);
  m.entidades.forEach((e, i) => assert.equal(e.id, i));
  assert.deepEqual(m.entidades.slice(1, 5).map((e) => e.time), Array(4).fill('azul'));
  assert.deepEqual(m.entidades.slice(5).map((e) => e.time), Array(5).fill('laranja'));
  assert.equal(m.entidades[1].nome, `Bot ${NOMES_BOTS[0]}`);
  assert.equal(m.entidades[9].nome, `Bot ${NOMES_BOTS[8]}`);
  assert.ok(m.entidades.slice(1).every((e) => e.bot));
  for (const time of ['azul', 'laranja']) {
    const bots = m.entidades.filter((e) => e.bot && e.time === time);
    assert.equal(bots.filter((e) => e.primariaEscolhida === 'sniper').length, 1, time);
    assert.ok(bots.every((e) => ['rifle', 'fuzil', 'rifleS', 'smg', 'miniSmg', 'smgS', 'escopeta', 'sniper'].includes(e.primariaEscolhida)));
  }
  assert.equal(m.entidades[1].primariaEscolhida, 'sniper');
  assert.equal(m.entidades[5].primariaEscolhida, 'sniper');
});

test('posicionarParaRound troca os spawns', () => {
  const m = criarMundo({ mapa: MAPA, primariaJogador: 'rifle', dificuldade: 'medio', rng: criarRng(3) });
  posicionarParaRound(m, 'A');
  assert.deepEqual(m.entidades[0].pos, MAPA.spawns.A[0]);
  assert.deepEqual(m.entidades[5].pos, MAPA.spawns.B[0]);
  assert.equal(m.entidades[0].yaw, MAPA.yawSpawn.A);
  assert.equal(m.entidades[5].yaw, MAPA.yawSpawn.B);
  posicionarParaRound(m, 'B');
  assert.deepEqual(m.entidades[0].pos, MAPA.spawns.B[0]);
  assert.deepEqual(m.entidades[5].pos, MAPA.spawns.A[0]);
  assert.ok(m.entidades.every((e) => e.hp === 100 && e.vivo && e.slot === 'primaria'));
});

test('andar para frente com yaw 0 diminui z', () => {
  const m = novo();
  rodar(m, 20, () => cmd({ frente: 1 }));
  assert.ok(Math.abs(jogador(m).pos.z - -5.1) < 0.3, `z=${jogador(m).pos.z}`); // rifle: 5,1 m/s
  assert.ok(Math.abs(jogador(m).pos.x) < 1e-6);
});

test('lado +1 anda para a direita (x+)', () => {
  const m = novo();
  rodar(m, 20, () => cmd({ lado: 1 }));
  assert.ok(jogador(m).pos.x > 5);
});

test('devagar e agachado são mais lentos', () => {
  const m1 = novo();
  rodar(m1, 20, () => cmd({ frente: 1, devagar: true }));
  assert.ok(Math.abs(-jogador(m1).pos.z - 5.1 * 0.52) < 0.2);
  const m2 = novo();
  rodar(m2, 20, () => cmd({ frente: 1, agachar: true }));
  assert.ok(Math.abs(-jogador(m2).pos.z - 5.1 * 0.34) < 0.2);
  assert.equal(jogador(m2).agachado, true);
});

test('diagonal não é mais rápida', () => {
  const m = novo();
  rodar(m, 20, () => cmd({ frente: 1, lado: 1 }));
  const { x, z } = jogador(m).pos;
  assert.ok(Math.hypot(x, z) < 5.8);
});

test('congelado não anda mas gira', () => {
  const m = novo();
  rodar(m, 10, () => cmd({ frente: 1, yaw: 1 }), { congelado: true });
  assert.equal(jogador(m).yaw, 1);
  assert.deepEqual(jogador(m).pos, { x: 0, y: 0, z: 0 });
});

test('pulo só no chão', () => {
  const m = novo();
  let pico = 0;
  rodar(m, 30, () => {
    pico = Math.max(pico, jogador(m).pos.y);
    return cmd({ pular: true });
  });
  pico = Math.max(pico, jogador(m).pos.y);
  assert.ok(pico > 0.5 && pico < 1.2, `pico=${pico}`);
});

test('pitch limitado', () => {
  const m = novo();
  rodar(m, 1, () => cmd({ pitch: 3 }));
  assert.equal(jogador(m).pitch, 1.5);
  rodar(m, 1, () => cmd({ pitch: -3 }));
  assert.equal(jogador(m).pitch, -1.5);
});

test('não levanta embaixo de teto', () => {
  const teto = { min: { x: -5, y: 1.4, z: -5 }, max: { x: 5, y: 2, z: 5 }, cor: 1 };
  const m = novo([chao, teto]);
  rodar(m, 5, () => cmd({ agachar: true }));
  assert.equal(jogador(m).agachado, true);
  rodar(m, 5, () => cmd({ agachar: false }));
  assert.equal(jogador(m).agachado, true);
});

test('levanta quando livre', () => {
  const m = novo();
  rodar(m, 3, () => cmd({ agachar: true }));
  rodar(m, 3, () => cmd({ agachar: false }));
  assert.equal(jogador(m).agachado, false);
});

test('dt máximo não atravessa parede', () => {
  const parede = { min: { x: -5, y: 0, z: -1.2 }, max: { x: 5, y: 3, z: -1 }, cor: 1 };
  const m = novo([chao, parede]);
  rodar(m, 40, () => cmd({ frente: 1 }));
  assert.ok(jogador(m).pos.z >= -1 + JOGADOR.raio - 1e-6, `z=${jogador(m).pos.z}`);
});

test('passo emite evento a cada 1,8 m correndo', () => {
  const m = novo();
  let n = 0;
  for (let i = 0; i < 20; i++) {
    n += passo(m, 0.05, new Map([[0, cmd({ frente: 1 })]]), { congelado: false })
      .filter((e) => e.tipo === 'passo' && e.id === 0).length;
  }
  assert.ok(n >= 2 && n <= 4, `n=${n}`); // 1 s a 5,5 m/s ≈ 3 passos
  const q = novo();
  const ev = passo(q, 0.05, new Map([[0, cmd({ frente: 1, devagar: true })]]), { congelado: false });
  assert.equal(ev.length, 0);
});

test('vivosPorTime soma n e hp', () => {
  const m = novo();
  assert.deepEqual(vivosPorTime(m), { azul: { n: 5, hp: 500 }, laranja: { n: 5, hp: 500 } });
  m.entidades[2].vivo = false;
  m.entidades[6].hp = 40;
  assert.deepEqual(vivosPorTime(m), { azul: { n: 4, hp: 400 }, laranja: { n: 5, hp: 440 } });
});

test('olho usa altura em pé e agachado', () => {
  assert.deepEqual(olho({ pos: { x: 1, y: 2, z: 3 }, agachado: false }), { x: 1, y: 3.6, z: 3 });
  const o = olho({ pos: { x: 1, y: 2, z: 3 }, agachado: true });
  assert.ok(Math.abs(o.y - 3.1) < 1e-9);
});

test('direcao é unitária, yaw 0 olha -z, yaw positivo vira à esquerda', () => {
  const d0 = direcao(0, 0);
  assert.ok(Math.abs(d0.x) < 1e-9 && Math.abs(d0.y) < 1e-9 && Math.abs(d0.z + 1) < 1e-9);
  const d1 = direcao(Math.PI / 2, 0);
  assert.ok(Math.abs(d1.x + 1) < 1e-9 && Math.abs(d1.z) < 1e-9);
  const d2 = direcao(0, Math.PI / 2);
  assert.ok(Math.abs(d2.y - 1) < 1e-9);
  const d3 = direcao(0.7, 0.4);
  assert.ok(Math.abs(Math.hypot(d3.x, d3.y, d3.z) - 1) < 1e-9);
});

// ---- Tiro (Task 5) ----
const alvoEm = (m, i, x, y, z, time) => {
  const e = m.entidades[i];
  e.pos = { x, y, z };
  e.time = time;
  return e;
};
const pitchPara = (altura, dist) => Math.atan2(altura - JOGADOR.olho, dist);
const atirar = (m, extra = {}, opcoes = { congelado: false }) =>
  passo(m, 0.05, new Map([[0, cmd({ atirar: true, ...extra })]]), opcoes);
// Troca de arma e espera o saque (0,5 s cobre todos) antes do ataque.
const sacar = (m, slot) => {
  passo(m, 0.05, new Map([[0, cmd({ slot })]]), { congelado: false });
  rodar(m, 10, () => cmd());
};

test('rifle no tronco tira 36', () => {
  const m = novo();
  const alvo = alvoEm(m, 5, 0, 0, -10, 'laranja');
  const ev = atirar(m, { pitch: pitchPara(1.1, 10) });
  assert.equal(alvo.hp, 64);
  const acerto = ev.find((e) => e.tipo === 'acerto');
  assert.equal(acerto.parte, 'tronco');
  assert.equal(acerto.atirador, 0);
  assert.equal(acerto.alvo, 5);
  assert.equal(acerto.dano, 36);
  assert.ok(ev.some((e) => e.tipo === 'tiro' && e.atirador === 0 && e.arma === 'rifle'));
  assert.equal(jogador(m).armas.primaria.municao, 29);
});

test('headshot de rifle mata', () => {
  const m = novo();
  const alvo = alvoEm(m, 5, 0, 0, -10, 'laranja');
  const ev = atirar(m, { pitch: pitchPara(1.6, 10) });
  assert.equal(alvo.vivo, false);
  const morte = ev.find((e) => e.tipo === 'morte');
  assert.deepEqual(morte, { tipo: 'morte', vitima: 5, assassino: 0, arma: 'rifle', cabeca: true, assistente: null });
  assert.equal(jogador(m).kills, 1);
  assert.equal(jogador(m).killsCabeca, 1);
  assert.equal(alvo.mortes, 1);
});

test('fogo amigo desligado', () => {
  const m = novo();
  const alvo = alvoEm(m, 5, 0, 0, -10, 'azul');
  const ev = atirar(m, { pitch: pitchPara(1.1, 10) });
  assert.equal(alvo.hp, 100);
  assert.equal(ev.filter((e) => e.tipo === 'acerto').length, 0);
});

test('aliado na frente bloqueia o tiro', () => {
  const m = novo();
  alvoEm(m, 1, 0, 0, -5, 'azul');
  const inimigo = alvoEm(m, 5, 0, 0, -10, 'laranja');
  const ev = atirar(m, { pitch: pitchPara(1.1, 8) });
  assert.equal(inimigo.hp, 100);
  assert.equal(m.entidades[1].hp, 100);
  assert.equal(ev.filter((e) => e.tipo === 'impacto').length, 0);
});

test('parede bloqueia o tiro e gera impacto', () => {
  const parede = { min: { x: -2, y: 0, z: -6 }, max: { x: 2, y: 4, z: -5 }, cor: 0x555555 };
  const m = novo([chao, parede]);
  const alvo = alvoEm(m, 5, 0, 0, -10, 'laranja');
  const ev = atirar(m, { pitch: pitchPara(1.1, 10) });
  assert.equal(alvo.hp, 100);
  const imp = ev.find((e) => e.tipo === 'impacto');
  assert.ok(imp && Math.abs(imp.ponto.z - -5) < 1e-6);
  assert.deepEqual(imp.normal, { x: 0, y: 0, z: 1 });
});

test('congelado não atira', () => {
  const m = novo();
  const alvo = alvoEm(m, 5, 0, 0, -10, 'laranja');
  const ev = atirar(m, { pitch: pitchPara(1.1, 10) }, { congelado: true });
  assert.equal(alvo.hp, 100);
  assert.equal(jogador(m).armas.primaria.municao, 30);
  assert.equal(ev.filter((e) => e.tipo === 'tiro').length, 0);
});

test('faca não alcança 3 m, alcança 1,5 m', () => {
  const longe = novo();
  const a1 = alvoEm(longe, 5, 0, 0, -3, 'laranja');
  a1.yaw = Math.PI; // de frente para o jogador
  sacar(longe, 'faca');
  atirar(longe, { pitch: pitchPara(1.1, 3) });
  assert.equal(a1.hp, 100);
  const perto = novo();
  const a2 = alvoEm(perto, 5, 0, 0, -1.5, 'laranja');
  a2.yaw = Math.PI;
  sacar(perto, 'faca');
  const ev = atirar(perto, { pitch: pitchPara(1.1, 1.5) });
  assert.equal(a2.hp, 60);
  assert.equal(ev.filter((e) => e.tipo === 'tiro' || e.tipo === 'raio').length, 0, 'faca não atira');
  assert.ok(ev.some((e) => e.tipo === 'golpe' && e.acerto === 'corpo' && !e.forte && !e.costas));
});

test('faca: estocada (botão direito) tira 65, pelas costas mata', () => {
  const frente = novo();
  const a1 = alvoEm(frente, 5, 0, 0, -1.2, 'laranja');
  a1.yaw = Math.PI;
  sacar(frente, 'faca');
  passo(frente, 0.05, new Map([[0, cmd({ zoom: true, pitch: pitchPara(1.1, 1.2) })]]), { congelado: false });
  assert.equal(a1.hp, 35);
  const costas = novo();
  const a2 = alvoEm(costas, 5, 0, 0, -1.2, 'laranja');
  a2.yaw = 0; // olha para longe do jogador
  sacar(costas, 'faca');
  const ev = atirar(costas, { pitch: pitchPara(1.1, 1.2) });
  assert.equal(a2.hp, 10); // golpe leve pelas costas: 90
  assert.ok(ev.some((e) => e.tipo === 'golpe' && e.costas));
});

test('faca: golpe na parede avisa e respeita o intervalo', () => {
  const parede = { min: { x: -2, y: 0, z: -2 }, max: { x: 2, y: 4, z: -1 }, cor: 1 };
  const m = novo([chao, parede]);
  sacar(m, 'faca');
  const ev1 = atirar(m);
  assert.ok(ev1.some((e) => e.tipo === 'golpe' && e.acerto === 'parede'));
  const ev2 = atirar(m); // 0,05 s depois: ainda no intervalo de 0,4 s
  assert.equal(ev2.filter((e) => e.tipo === 'golpe').length, 0);
});

test('faca à queima-roupa acerta', () => {
  for (const dist of [0.3, 0.1]) {
    const m = novo();
    const alvo = alvoEm(m, 5, 0, 0, -dist, 'laranja');
    sacar(m, 'faca');
    atirar(m, { pitch: pitchPara(1.1, dist) });
    assert.ok(alvo.hp < 100, `dist=${dist} hp=${alvo.hp}`);
  }
});

test('recarregar emite evento e enche o pente depois do tempo', () => {
  const m = novo();
  jogador(m).armas.primaria.municao = 10;
  const ev = passo(m, 0.05, new Map([[0, cmd({ recarregar: true })]]), { congelado: false });
  assert.ok(ev.some((e) => e.tipo === 'recarga' && e.atirador === 0));
  rodar(m, 52, () => cmd());
  assert.equal(jogador(m).armas.primaria.municao, 30);
  assert.equal(jogador(m).armas.primaria.reserva, 70);
});

test('trocar de slot muda a arma ativa e posicionarParaRound recria as armas', () => {
  const m = novo();
  atirar(m, { slot: 'pistola' });
  assert.equal(jogador(m).slot, 'pistola');
  assert.equal(jogador(m).armas.pistola.municao, 12, 'sacando: ainda não atira');
  rodar(m, 6, () => cmd());
  atirar(m);
  assert.equal(jogador(m).armas.pistola.municao, 11);
  assert.equal(jogador(m).armas.primaria.municao, 30);
  posicionarParaRound(m, 'A');
  assert.equal(jogador(m).armas.pistola.municao, 12);
  assert.equal(jogador(m).slot, 'primaria');
});

test('trocas no mesmo passo: dois inimigos com 1 HP se matam', () => {
  const m = novo();
  const inimigo = alvoEm(m, 5, 0, 0, -10, 'laranja');
  const eu = jogador(m);
  eu.hp = 1;
  inimigo.hp = 1;
  inimigo.armas.primaria = criarArma('rifle');
  for (const e of m.entidades) if (e.id !== 0 && e.id !== 5) e.vivo = false;
  const ev = passo(m, 0.05, new Map([
    [0, cmd({ atirar: true, pitch: pitchPara(1.1, 10) })],
    [5, cmd({ atirar: true, yaw: Math.PI, pitch: Math.atan2(1.1 - JOGADOR.olho, 10) })],
  ]), { congelado: false });
  assert.equal(inimigo.vivo, false);
  assert.equal(eu.vivo, false, 'o azul (id menor) não pode escapar do revide');
  assert.equal(ev.filter((e) => e.tipo === 'morte').length, 2);
  assert.equal(eu.kills, 1);
  assert.equal(inimigo.kills, 1);
});

test('morto no passo não leva um segundo acerto nem dá kill dupla', () => {
  const m = novo();
  const alvo = alvoEm(m, 5, 0, 0, -10, 'laranja');
  alvo.hp = 1;
  const a = m.entidades[1];
  a.pos = { x: 0, y: 0, z: 0.5 };
  const ev = passo(m, 0.05, new Map([
    [0, cmd({ atirar: true, pitch: pitchPara(1.1, 10) })],
    [1, cmd({ atirar: true, pitch: pitchPara(1.1, 9.5) })],
  ]), { congelado: false });
  assert.equal(ev.filter((e) => e.tipo === 'morte').length, 1);
  assert.equal(jogador(m).kills + a.kills, 1);
  assert.equal(alvo.mortes, 1);
});

test('trocar de arma zera o recuo da arma que sai', () => {
  const m = novo();
  atirar(m);
  assert.ok(jogador(m).armas.primaria.recuoAcum > 0);
  atirar(m, { atirar: false, slot: 'pistola' });
  assert.equal(jogador(m).slot, 'pistola');
  assert.equal(jogador(m).armas.primaria.recuoAcum, 0);
});

test('velocidade depende da arma: faca > pistola > rifle > sniper', () => {
  const dist = (slot, primaria = 'rifle') => {
    const m = novo();
    if (primaria !== 'rifle') m.entidades[0].armas.primaria = criarArma(primaria);
    if (slot !== 'primaria') sacar(m, slot);
    m.entidades[0].pos = { x: 0, y: 0, z: 0 };
    rodar(m, 20, () => cmd({ frente: 1 }));
    return -jogador(m).pos.z;
  };
  const faca = dist('faca');
  const pistola = dist('pistola');
  const rifle = dist('primaria');
  const sniper = dist('primaria', 'sniper');
  assert.ok(faca > pistola + 0.2 && pistola > rifle + 0.4 && rifle > sniper, `${faca} ${pistola} ${rifle} ${sniper}`);
  assert.ok(Math.abs(faca - 6.2) < 0.3);
});

test('Q volta para a arma anterior e a roda do mouse cicla', () => {
  const m = novo();
  sacar(m, 'faca');
  sacar(m, 'anterior');
  assert.equal(jogador(m).slot, 'primaria');
  sacar(m, 'anterior');
  assert.equal(jogador(m).slot, 'faca');
  sacar(m, 'roda+');
  assert.equal(jogador(m).slot, 'primaria');
  sacar(m, 'roda-');
  assert.equal(jogador(m).slot, 'faca');
});

test('tiro gera rastro do olho até o ponto atingido', () => {
  const m = novo();
  alvoEm(m, 5, 0, 0, -10, 'laranja');
  const ev = atirar(m, { pitch: pitchPara(1.1, 10) });
  const r = ev.find((e) => e.tipo === 'raio');
  assert.ok(r && r.atirador === 0 && Math.abs(r.ate.z - -9.75) < 0.01, JSON.stringify(r));
});

test('pulo e pouso emitem eventos', () => {
  const m = novo();
  rodar(m, 2, () => cmd());
  const ev = [];
  for (let i = 0; i < 30; i++) ev.push(...passo(m, 0.05, new Map([[0, cmd({ pular: i === 0 })]]), { congelado: false }));
  assert.equal(ev.filter((e) => e.tipo === 'pulo').length, 1);
  assert.equal(ev.filter((e) => e.tipo === 'pouso').length, 1);
});

test('treino: só o jogador, reserva infinita', () => {
  const m = criarMundo({ mapa: MAPA, primariaJogador: 'rifle', dificuldade: 'medio', rng: criarRng(4), modo: 'treino' });
  assert.equal(m.entidades.length, 1);
  posicionarParaRound(m, 'A');
  const arma = m.entidades[0].armas.primaria;
  for (let i = 0; i < 300; i++) passo(m, 0.05, new Map([[0, cmd({ atirar: true, yaw: m.entidades[0].yaw })]]), { congelado: false });
  assert.equal(arma.reserva, 90);
  assert.deepEqual(vivosPorTime(m), { azul: { n: 1, hp: 100 }, laranja: { n: 0, hp: 0 } });
});
