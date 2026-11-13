import test from 'node:test';
import assert from 'node:assert/strict';
import { mod } from './_repo.mjs';

const { escolherPrimaria, criarCerebro, pensar, ouvir } = await mod('js/games/blockstrike/bots.js');
const { criarMundo, posicionarParaRound, passo } = await mod('js/games/blockstrike/mundo.js');
const { criarGrafo } = await mod('js/games/blockstrike/navegacao.js');
const { olho } = await mod('js/games/blockstrike/fisica.js');
const { MAPA } = await mod('js/games/blockstrike/mapa.js');
const { criarRng } = await mod('js/games/blockstrike/rng.js');

const DT = 0.05;
const chao = { min: { x: -50, y: -1, z: -50 }, max: { x: 50, y: 0, z: 50 }, cor: 0x888888 };
const parede = (x0, z0, x1, z1, h = 3) => ({ min: { x: x0, y: 0, z: z0 }, max: { x: x1, y: h, z: z1 }, cor: 1 });
const grafoMapa = criarGrafo(MAPA.waypoints, MAPA.arestas);

// Mundo com só o bot 1 (azul) e o inimigo 5 (laranja) vivos, em posições à mão.
function cena({ caixas = [chao], bot = { x: 0, z: 0 }, yaw = 0, inimigo = { x: 0, z: -10 }, seed = 1 } = {}) {
  const mundo = criarMundo({
    mapa: { ...MAPA, caixas }, primariaJogador: 'rifle', dificuldade: 'medio', rng: criarRng(seed),
  });
  posicionarParaRound(mundo, 'A');
  for (const e of mundo.entidades) e.vivo = false;
  const b = mundo.entidades[1];
  const alvo = mundo.entidades[5];
  b.vivo = true;
  alvo.vivo = true;
  b.primariaEscolhida = 'rifle';
  b.armas.primaria = { ...b.armas.primaria, tipo: 'rifle', municao: 30, reserva: 90 };
  b.pos = { x: bot.x, y: 0, z: bot.z };
  b.yaw = yaw;
  alvo.pos = { x: inimigo.x, y: 0, z: inimigo.z };
  return { mundo, b, alvo };
}

// Roda pensar + passo; devolve os comandos do bot.
function simular(mundo, b, grafo, dif, n, rng = criarRng(7)) {
  const cmds = [];
  for (let i = 0; i < n; i++) {
    const cmd = pensar(b, mundo, grafo, dif, DT, rng);
    cmds.push(cmd);
    passo(mundo, DT, new Map([[b.id, cmd]]));
  }
  return cmds;
}

const primeiroTiro = (cmds) => {
  const i = cmds.findIndex((c) => c.atirar);
  return i < 0 ? Infinity : (i + 1) * DT;
};

test('sniper fixo no índice 0', () => {
  const rng = criarRng(3);
  for (let i = 0; i < 50; i++) assert.equal(escolherPrimaria(0, rng), 'sniper');
});

test('nunca escolhe faca e respeita os pesos', () => {
  const rng = criarRng(4);
  // Variantes contam pela família: rifles 55%, SMGs 25%, escopeta 20%.
  const FAMILIA = { rifle: 'rifle', fuzil: 'rifle', rifleS: 'rifle', smg: 'smg', miniSmg: 'smg', smgS: 'smg', escopeta: 'escopeta' };
  const cont = { rifle: 0, smg: 0, escopeta: 0 };
  for (let i = 0; i < 1000; i++) {
    const t = escolherPrimaria(1 + (i % 4), rng);
    assert.ok(t in FAMILIA, t);
    cont[FAMILIA[t]] += 1;
  }
  assert.ok(cont.rifle > 480 && cont.rifle < 620, JSON.stringify(cont));
  assert.ok(cont.smg > 190 && cont.smg < 310, JSON.stringify(cont));
  assert.ok(cont.escopeta > 140 && cont.escopeta < 260, JSON.stringify(cont));
});

test('criarCerebro começa em rota até a metade inimiga', () => {
  const mundo = criarMundo({ mapa: MAPA, primariaJogador: 'rifle', dificuldade: 'medio', rng: criarRng(5) });
  posicionarParaRound(mundo, 'A');
  const rng = criarRng(6);
  const destinos = new Set();
  for (const e of mundo.entidades.filter((x) => x.bot)) {
    const c = criarCerebro(e, grafoMapa, rng);
    assert.equal(c.estado, 'rota');
    assert.equal(c.alvoId, null);
    assert.equal(c.ultimoDanoDe, null);
    assert.ok(c.rota.length > 1);
    const fim = grafoMapa.nos[c.rota.at(-1)];
    assert.ok(Math.sign(fim.z) === -Math.sign(e.pos.z) || fim.z === 0, `bot ${e.id} vai para ${fim.z}`);
    destinos.add(fim.x < -20 ? 'esq' : fim.x > 20 ? 'dir' : 'meio');
  }
  assert.equal(destinos.size, 3, 'usa as três rotas');
});

test('não atira antes do tempo de reação (fácil)', () => {
  const { mundo, b } = cena();
  const cmds = simular(mundo, b, grafoMapa, 'facil', 16);
  assert.ok(cmds.slice(0, 11).every((c) => !c.atirar), 'atirou antes de 0,55 s');
  assert.ok(primeiroTiro(cmds) <= 0.8, `1º tiro em ${primeiroTiro(cmds)}`);
});

test('difícil reage mais rápido que fácil', () => {
  const f = cena();
  const d = cena();
  const tf = primeiroTiro(simular(f.mundo, f.b, grafoMapa, 'facil', 30));
  const td = primeiroTiro(simular(d.mundo, d.b, grafoMapa, 'dificil', 30));
  assert.ok(td < tf, `difícil ${td} >= fácil ${tf}`);
});

test('não vê através da parede', () => {
  const { mundo, b } = cena({ caixas: [chao, parede(-2, -5, 2, -4)] });
  const cmds = simular(mundo, b, grafoMapa, 'dificil', 3);
  assert.equal(b.cerebro.estado, 'rota');
  assert.ok(cmds.every((c) => !c.atirar));
});

test('não vê pelas costas a 20 m; vê a 2 m', () => {
  const longe = cena({ inimigo: { x: 0, z: 20 } });
  simular(longe.mundo, longe.b, grafoMapa, 'dificil', 2);
  assert.equal(longe.b.cerebro.alvoId, null);
  const perto = cena({ inimigo: { x: 0, z: 2 } });
  simular(perto.mundo, perto.b, grafoMapa, 'dificil', 1);
  assert.equal(perto.b.cerebro.alvoId, 5);
  assert.equal(perto.b.cerebro.estado, 'combate');
});

const angulo = (a) => Math.atan2(Math.sin(a), Math.cos(a));

test('erro de mira humano no difícil (média entre 0,005 e 0,04 rad)', () => {
  const { mundo, b, alvo } = cena({ inimigo: { x: 0, z: -15 } });
  const rng = criarRng(11);
  const o = olho(b);
  const certo = Math.atan2(-(alvo.pos.x - o.x), -(alvo.pos.z - o.z));
  let soma = 0;
  for (let i = 0; i < 200; i++) {
    const cmd = pensar(b, mundo, grafoMapa, 'dificil', DT, rng);
    b.yaw = cmd.yaw;
    b.pitch = cmd.pitch;
    mundo.tempo += DT;
    soma += Math.abs(angulo(cmd.yaw - certo));
  }
  const media = soma / 200;
  assert.ok(media > 0.005 && media < 0.04, `média ${media}`);
});

test('giro limitado a 8 rad/s com alvo às costas', () => {
  const { mundo, b } = cena({ inimigo: { x: 0, z: 2 } });
  const rng = criarRng(12);
  for (let i = 0; i < 20; i++) {
    const antes = b.yaw;
    const cmd = pensar(b, mundo, grafoMapa, 'dificil', DT, rng);
    assert.ok(Math.abs(cmd.yaw - antes) <= 8 * DT + 1e-9, `passo ${i}: ${cmd.yaw - antes}`);
    b.yaw = cmd.yaw;
    mundo.tempo += DT;
  }
});

// Parede x 5..6, z -6..2. Cobertura em (8,0) escondida de (0,-10); acesso por (5.5,4).
const caixasCobertura = [chao, parede(5, -6, 6, 2)];
const grafoCobertura = criarGrafo(
  [{ id: 0, x: 0, z: 0 }, { id: 1, x: 8, z: 0, cobertura: true }, { id: 2, x: 5.5, z: 4 },
    { id: 3, x: -8, z: 0, cobertura: true }],
  [[0, 2], [2, 1], [0, 3]],
);

test('recua com hp baixo e agacha ao chegar na cobertura', () => {
  const { mundo, b } = cena({ caixas: caixasCobertura, inimigo: { x: 0, z: -10 } });
  b.hp = 20;
  const cmds = [];
  const rng = criarRng(13);
  for (let i = 0; i < 120; i++) {
    const cmd = pensar(b, mundo, grafoCobertura, 'medio', DT, rng);
    cmds.push(cmd);
    passo(mundo, DT, new Map([[b.id, cmd]]));
    if (i === 0) assert.equal(b.cerebro.estado, 'recuo');
  }
  assert.equal(b.cerebro.estado, 'recuo');
  assert.ok(Math.hypot(b.pos.x - 8, b.pos.z) < 1, `parou em ${b.pos.x},${b.pos.z}`);
  assert.ok(cmds.at(-1).agachar, 'agachado na cobertura');
});

test('dano sem visada leva à cobertura', () => {
  const { mundo, b } = cena({ caixas: caixasCobertura, yaw: Math.PI, inimigo: { x: 0, z: -20 } });
  pensar(b, mundo, grafoCobertura, 'medio', DT, criarRng(14));
  b.cerebro.ultimoDanoDe = 5;
  pensar(b, mundo, grafoCobertura, 'medio', DT, criarRng(14));
  assert.equal(b.cerebro.estado, 'cobertura');
  assert.equal(b.cerebro.rota.at(-1), 1);
  assert.equal(b.cerebro.ultimoDanoDe, null);
});

test('mundo grava ultimoDanoDe no bot atingido', () => {
  const { mundo, b } = cena({ inimigo: { x: 0, z: -10 } });
  b.cerebro = criarCerebro(b, grafoMapa, criarRng(15));
  const j = mundo.entidades[0];
  j.vivo = true;
  j.time = 'laranja';
  j.pos = { x: 0, y: 0, z: 10 };
  j.yaw = 0;
  j.pitch = Math.atan2(1.1 - 1.6, 10);
  const cmd = { frente: 0, lado: 0, pular: false, agachar: false, devagar: false, atirar: true,
    zoom: false, recarregar: false, slot: null, yaw: 0, pitch: j.pitch };
  const ev = passo(mundo, DT, new Map([[0, cmd], [b.id, { ...cmd, atirar: false, yaw: b.yaw, pitch: 0 }]]));
  assert.ok(ev.some((e) => e.tipo === 'acerto' && e.alvo === b.id), JSON.stringify(ev));
  assert.equal(b.cerebro.ultimoDanoDe, 0);
});

test('integração: 5×5 bots por 120 s no médio', () => {
  const inicio = Date.now();
  const mundo = criarMundo({ mapa: MAPA, primariaJogador: 'rifle', dificuldade: 'medio', rng: criarRng(21) });
  posicionarParaRound(mundo, 'A');
  const grafo = criarGrafo(MAPA.waypoints, MAPA.arestas);
  const rng = criarRng(22);
  let mortes = 0;
  let tiros = 0;
  for (let i = 0; i < 120 / DT; i++) {
    const comandos = new Map();
    for (const e of mundo.entidades) if (e.vivo) comandos.set(e.id, pensar(e, mundo, grafo, 'medio', DT, rng));
    for (const ev of passo(mundo, DT, comandos)) {
      if (ev.tipo === 'morte') mortes += 1;
      if (ev.tipo === 'tiro') tiros += 1;
    }
    for (const e of mundo.entidades) {
      assert.ok(Math.abs(e.pos.x) <= 40.5 && Math.abs(e.pos.z) <= 30.5 && e.pos.y > -0.5, `${e.id} fora`);
    }
  }
  console.log(`integração: ${mortes} mortes, ${tiros} tiros, ${Date.now() - inicio} ms`);
  assert.ok(mortes >= 3, `só ${mortes} mortes`);
  assert.ok(Date.now() - inicio < 10000);
});

test('recarrega com pente vazio mesmo em combate e nunca troca para a faca', () => {
  const { mundo, b } = cena();
  b.armas.primaria.municao = 0;
  const rng = criarRng(30);
  const cmds = simular(mundo, b, grafoMapa, 'medio', 20, rng);
  assert.equal(b.cerebro.estado, 'combate');
  assert.ok(cmds.some((c) => c.recarregar));
  assert.ok(cmds.every((c) => c.slot !== 'faca'));
  b.armas.primaria.reserva = 0;
  b.armas.primaria.municao = 0;
  b.armas.primaria.recarregandoAte = 0;
  const cmd = pensar(b, mundo, grafoMapa, 'medio', DT, rng);
  assert.equal(cmd.slot, 'pistola');
});

test('compensação de recuo não sobe para a cabeça', () => {
  const { mundo, b, alvo } = cena({ inimigo: { x: 0, z: -20 } });
  alvo.hp = 1e9;
  const ideal = { reacao: 0.2, erroMira: 0, chanceCabeca: 0 };
  const rng = criarRng(31);
  const partes = { cabeca: 0, tronco: 0, pernas: 0 };
  for (let i = 0; i < 400; i++) {
    const cmd = pensar(b, mundo, grafoMapa, ideal, DT, rng);
    for (const ev of passo(mundo, DT, new Map([[b.id, cmd]]))) {
      if (ev.tipo === 'acerto' && ev.atirador === b.id) partes[ev.parte] += 1;
    }
  }
  const total = partes.cabeca + partes.tronco + partes.pernas;
  console.log(`recuo ideal 20 m: ${JSON.stringify(partes)}`);
  assert.ok(total >= 20, `só ${total} acertos`);
  assert.ok(partes.cabeca <= 0.05 * total, JSON.stringify(partes));
});

test('freeze sem pensar: a rota fica no início e os bots seguem pela rota depois', () => {
  const mundo = criarMundo({ mapa: MAPA, primariaJogador: 'rifle', dificuldade: 'medio', rng: criarRng(31) });
  posicionarParaRound(mundo, 'A');
  const grafo = criarGrafo(MAPA.waypoints, MAPA.arestas);
  const rng = criarRng(32);
  for (const e of mundo.entidades) if (e.bot) e.cerebro = criarCerebro(e, grafo, rng, MAPA.caixas);
  // Freeze de 5 s: o index não chama `pensar`, o passo roda congelado com comandos vazios.
  for (let i = 0; i < 5 / DT; i++) passo(mundo, DT, new Map(), { congelado: true });
  for (const e of mundo.entidades.filter((x) => x.bot)) {
    assert.ok(e.cerebro.passoRota <= 1, `bot ${e.id} em passoRota ${e.cerebro.passoRota}`);
  }
  // Fim do freeze: pensar volta e o bot anda (nada de waypoint pulado de cara).
  for (let i = 0; i < 2 / DT; i++) {
    const comandos = new Map();
    for (const e of mundo.entidades) if (e.bot && e.vivo) comandos.set(e.id, pensar(e, mundo, grafo, 'medio', DT, rng));
    passo(mundo, DT, comandos);
  }
  for (const e of mundo.entidades.filter((x) => x.bot)) {
    assert.ok(e.cerebro.passoRota <= 3, `bot ${e.id} em passoRota ${e.cerebro.passoRota}`);
    assert.ok(e.distAndada > 3, `bot ${e.id} andou ${e.distAndada.toFixed(1)} m`);
  }
});

test('desencalhe só conta quadros em que o bot tentava andar', () => {
  // `pensar` sem `passo`: velHoriz fica 0, como no freeze ou contra uma parede.
  const { mundo, b, alvo } = cena({ bot: { x: 0, z: 15 } });
  alvo.vivo = false;
  const rng = criarRng(8);
  const c = criarCerebro(b, grafoMapa, rng, [chao]);
  b.cerebro = c;
  assert.ok(c.rota.length > 3);
  pensar(b, mundo, grafoMapa, 'medio', 0.6, rng);
  const base = c.passoRota;
  assert.equal(c.preso, 0, 'sem intenção de andar no quadro anterior, não acumula');
  pensar(b, mundo, grafoMapa, 'medio', 0.6, rng);
  assert.ok(Math.abs(c.preso - 0.6) < 1e-9, `preso=${c.preso}`);
  pensar(b, mundo, grafoMapa, 'medio', 0.6, rng);
  assert.equal(c.passoRota, base + 1, 'encalhado de verdade: pula um waypoint');
  assert.equal(c.preso, 0);
});

test('tiro silenciado só é ouvido de perto; tiro normal chega longe', async () => {
  const { passo } = await mod('js/games/blockstrike/mundo.js');
  for (const [arma, perto, longe] of [['rifleS', true, false], ['rifle', true, true]]) {
    const mundo = criarMundo({ mapa: MAPA, primariaJogador: arma, dificuldade: 'medio', rng: criarRng(9) });
    posicionarParaRound(mundo, 'A');
    const eu = mundo.entidades[0];
    eu.armas.primaria = (await mod('js/games/blockstrike/armas.js')).criarArma(arma);
    eu.slot = 'primaria';
    eu.pos = { x: 0, y: 0, z: 10 };
    passo(mundo, 0.016, new Map([[0, { frente: 0, lado: 0, yaw: 0, pitch: 0, atirar: true }]]));
    const ruido = mundo.ruidos.find((r) => r.id === 0);
    assert.ok(ruido, arma);
    const bot = mundo.entidades[5];
    bot.pos = { x: 0, y: 0, z: 4 }; // 6 m
    assert.equal(Boolean(ouvir(bot, mundo, { ouvidoEm: -Infinity })), perto, `${arma} perto`);
    bot.pos = { x: 0, y: 0, z: -20 }; // 30 m
    assert.equal(Boolean(ouvir(bot, mundo, { ouvidoEm: -Infinity })), longe, `${arma} longe`);
  }
});
