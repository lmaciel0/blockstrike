import { expect, test } from 'vitest';
import { escolherPrimaria, criarCerebro, pensar, ouvir } from '../src/bots.js';
import { criarMundo, posicionarParaRound, passo } from '../src/mundo.js';
import { criarGrafo } from '../src/navegacao.js';
import { criarArma } from '../src/armas.js';
import { olho } from '../src/fisica.js';
import { MAPA } from '../src/mapa.js';
import { DIFICULDADE } from '../src/config.js';
import { criarRng } from '../src/rng.js';
import type {
  Arma, ArmasEntidade, Caixa, Comandos, Dificuldade, Entidade, Evento, Grafo, Mundo, NomeDificuldade, Rng, TipoPrimaria,
} from '../src/tipos.js';

// O sim não carrega tipos de DOM nem de Node: só o `console.log` que o teste original usa.
declare const console: { log(...dados: unknown[]): void };

const DT = 0.05;
const chao: Caixa = { min: { x: -50, y: -1, z: -50 }, max: { x: 50, y: 0, z: 50 }, cor: 0x888888 };
const parede = (x0: number, z0: number, x1: number, z1: number, h = 3): Caixa => (
  { min: { x: x0, y: 0, z: z0 }, max: { x: x1, y: h, z: z1 }, cor: 1 });
const grafoMapa = criarGrafo(MAPA.waypoints, MAPA.arestas);

interface OpcoesCena {
  caixas?: Caixa[]; bot?: { x: number; z: number }; yaw?: number; inimigo?: { x: number; z: number }; seed?: number;
}
// Bot da cena: `armas` e a primária existem depois de `posicionarParaRound` + o ajuste de `cena`.
type PartidaDeBot = Entidade & { armas: ArmasEntidade & { primaria: Arma } };

// Mundo com só o bot 1 (azul) e o inimigo 5 (laranja) vivos, em posições à mão.
function cena(
  { caixas = [chao], bot = { x: 0, z: 0 }, yaw = 0, inimigo = { x: 0, z: -10 }, seed = 1 }: OpcoesCena = {},
): { mundo: Mundo; b: PartidaDeBot; alvo: Entidade } {
  const mundo = criarMundo({
    mapa: { ...MAPA, caixas }, primariaJogador: 'rifle', dificuldade: 'medio', rng: criarRng(seed),
  });
  posicionarParaRound(mundo, 'A');
  for (const e of mundo.entidades) e.vivo = false;
  const b = mundo.entidades[1] as PartidaDeBot;
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
function simular(
  mundo: Mundo, b: Entidade, grafo: Grafo, dif: Dificuldade | NomeDificuldade, n: number, rng: Rng = criarRng(7),
): Comandos[] {
  const cmds: Comandos[] = [];
  for (let i = 0; i < n; i++) {
    const cmd = pensar(b, mundo, grafo, dif, DT, rng);
    cmds.push(cmd);
    passo(mundo, DT, new Map([[b.id, cmd]]));
  }
  return cmds;
}

const primeiroTiro = (cmds: Comandos[]): number => {
  const i = cmds.findIndex((c) => c.atirar);
  return i < 0 ? Infinity : (i + 1) * DT;
};

test('sniper fixo no índice 0', () => {
  const rng = criarRng(3);
  for (let i = 0; i < 50; i++) expect(escolherPrimaria(0, rng)).toBe('sniper');
});

test('nunca escolhe faca e respeita os pesos', () => {
  const rng = criarRng(4);
  // Variantes contam pela família: rifles 55%, SMGs 25%, escopeta 20%.
  const FAMILIA: Partial<Record<TipoPrimaria, 'rifle' | 'smg' | 'escopeta'>> = {
    rifle: 'rifle', fuzil: 'rifle', rifleS: 'rifle', smg: 'smg', miniSmg: 'smg', smgS: 'smg', escopeta: 'escopeta',
  };
  const cont = { rifle: 0, smg: 0, escopeta: 0 };
  for (let i = 0; i < 1000; i++) {
    const t = escolherPrimaria(1 + (i % 4), rng);
    expect(t in FAMILIA, t).toBeTruthy();
    cont[FAMILIA[t]!] += 1;
  }
  expect(cont.rifle > 480 && cont.rifle < 620, JSON.stringify(cont)).toBeTruthy();
  expect(cont.smg > 190 && cont.smg < 310, JSON.stringify(cont)).toBeTruthy();
  expect(cont.escopeta > 140 && cont.escopeta < 260, JSON.stringify(cont)).toBeTruthy();
});

test('criarCerebro começa em rota até a metade inimiga', () => {
  const mundo = criarMundo({ mapa: MAPA, primariaJogador: 'rifle', dificuldade: 'medio', rng: criarRng(5) });
  posicionarParaRound(mundo, 'A');
  const rng = criarRng(6);
  const destinos = new Set<string>();
  for (const e of mundo.entidades.filter((x) => x.bot)) {
    const c = criarCerebro(e, grafoMapa, rng);
    expect(c.estado).toBe('rota');
    expect(c.alvoId).toBe(null);
    expect(c.ultimoDano).toBe(null);
    expect(c.rota.length > 1).toBeTruthy();
    const fim = grafoMapa.nos[c.rota.at(-1)!];
    expect(Math.sign(fim.z) === -Math.sign(e.pos.z) || fim.z === 0, `bot ${e.id} vai para ${fim.z}`).toBeTruthy();
    destinos.add(fim.x < -20 ? 'esq' : fim.x > 20 ? 'dir' : 'meio');
  }
  expect(destinos.size, 'usa as três rotas').toBe(3);
});

test('não atira antes do tempo de reação (fácil)', () => {
  const { mundo, b } = cena();
  const cmds = simular(mundo, b, grafoMapa, 'facil', 16);
  expect(cmds.slice(0, 11).every((c) => !c.atirar), 'atirou antes de 0,55 s').toBeTruthy();
  expect(primeiroTiro(cmds) <= 0.8, `1º tiro em ${primeiroTiro(cmds)}`).toBeTruthy();
});

test('difícil reage mais rápido que fácil', () => {
  const f = cena();
  const d = cena();
  const tf = primeiroTiro(simular(f.mundo, f.b, grafoMapa, 'facil', 30));
  const td = primeiroTiro(simular(d.mundo, d.b, grafoMapa, 'dificil', 30));
  expect(td < tf, `difícil ${td} >= fácil ${tf}`).toBeTruthy();
});

test('não vê através da parede', () => {
  const { mundo, b } = cena({ caixas: [chao, parede(-2, -5, 2, -4)] });
  const cmds = simular(mundo, b, grafoMapa, 'dificil', 3);
  expect(b.cerebro!.estado).toBe('rota');
  expect(cmds.every((c) => !c.atirar)).toBeTruthy();
});

test('não vê pelas costas a 20 m; vê a 2 m', () => {
  const longe = cena({ inimigo: { x: 0, z: 20 } });
  simular(longe.mundo, longe.b, grafoMapa, 'dificil', 2);
  expect(longe.b.cerebro!.alvoId).toBe(null);
  const perto = cena({ inimigo: { x: 0, z: 2 } });
  simular(perto.mundo, perto.b, grafoMapa, 'dificil', 1);
  expect(perto.b.cerebro!.alvoId).toBe(5);
  expect(perto.b.cerebro!.estado).toBe('combate');
});

const angulo = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));

// Reescrito no Plano 2: o erro gaussiano sorteado a cada 0,15 s (`erroMira`) saiu. Com o alvo parado, o que sobra
// em regime é o tremor da mão virtual (0,005 rad no difícil): a mira nunca fica cravada, mas fica perto.
test('mira humana no difícil: tremor da mão em regime (média entre 0,001 e 0,02 rad)', () => {
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
    if (i >= 100) soma += Math.abs(angulo(cmd.yaw - certo)); // depois de 5 s, a mão já chegou
  }
  const media = soma / 100;
  expect(media > 0.001 && media < 0.02, `média ${media}`).toBeTruthy();
});

// Reescrito no Plano 2: o teto fixo de 8 rad/s (`girar`) não vale mais para a mira; quem limita é a aceleração da
// mão virtual. O passo de yaw só cresce acelMax·dt² de um quadro para o outro (sem teleporte de mira).
test('giro da mira limitado pela aceleração da mão com alvo às costas', () => {
  const { mundo, b } = cena({ inimigo: { x: 0, z: 2 } });
  const rng = criarRng(12);
  const { acelMax } = DIFICULDADE.dificil.mao;
  let giroAntes = 0;
  for (let i = 0; i < 20; i++) {
    const antes = b.yaw;
    const cmd = pensar(b, mundo, grafoMapa, 'dificil', DT, rng);
    const giro = cmd.yaw - antes;
    expect(Math.abs(giro) <= Math.abs(giroAntes) + acelMax * DT * DT + 1e-9, `passo ${i}: ${giro}`).toBeTruthy();
    giroAntes = giro;
    b.yaw = cmd.yaw;
    mundo.tempo += DT;
  }
  expect(Math.abs(angulo(b.yaw - Math.PI)) < 0.1, `yaw final ${b.yaw}`).toBeTruthy();
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
  const cmds: Comandos[] = [];
  const rng = criarRng(13);
  for (let i = 0; i < 120; i++) {
    const cmd = pensar(b, mundo, grafoCobertura, 'medio', DT, rng);
    cmds.push(cmd);
    passo(mundo, DT, new Map([[b.id, cmd]]));
    if (i === 0) expect(b.cerebro!.estado).toBe('recuo');
  }
  expect(b.cerebro!.estado).toBe('recuo');
  expect(Math.hypot(b.pos.x - 8, b.pos.z) < 1, `parou em ${b.pos.x},${b.pos.z}`).toBeTruthy();
  expect(cmds.at(-1)!.agachar, 'agachado na cobertura').toBeTruthy();
});

// Reescrito no Plano 2: o bot não recebe mais o id (nem a posição) de quem atirou, só a direção do tiro.
// O atirador (0,-20) fica atrás do bot (yaw π): direção real 0 rad, e a cobertura é escolhida contra um
// ponto a 15 m nessa direção ±15°, não contra a posição dele.
test('dano sem visada leva à cobertura', () => {
  const { mundo, b } = cena({ caixas: caixasCobertura, yaw: Math.PI, inimigo: { x: 0, z: -20 } });
  pensar(b, mundo, grafoCobertura, 'medio', DT, criarRng(14));
  b.cerebro!.ultimoDano = { angulo: 0, em: mundo.tempo };
  pensar(b, mundo, grafoCobertura, 'medio', DT, criarRng(14));
  expect(b.cerebro!.estado).toBe('cobertura');
  expect(b.cerebro!.rota.length > 1).toBeTruthy();
  expect(b.cerebro!.ultimoDano).toBe(null);
});

// Reescrito no Plano 2: o mundo grava o ângulo (yaw da vítima para o atirador), não o id do atirador.
test('mundo grava a direção do dano no bot atingido', () => {
  const { mundo, b } = cena({ inimigo: { x: 0, z: -10 } });
  b.cerebro = criarCerebro(b, grafoMapa, criarRng(15));
  const j = mundo.entidades[0];
  j.vivo = true;
  j.time = 'laranja';
  j.pos = { x: 0, y: 0, z: 10 };
  j.yaw = 0;
  j.pitch = Math.atan2(1.1 - 1.6, 10);
  // Sem `usar` e `granada`, como no teste original: os campos que faltam valem undefined (falso) no `passo`.
  const cmd = { frente: 0, lado: 0, pular: false, agachar: false, devagar: false, atirar: true,
    zoom: false, recarregar: false, slot: null, yaw: 0, pitch: j.pitch } as Comandos;
  const ev = passo(mundo, DT, new Map([[0, cmd], [b.id, { ...cmd, atirar: false, yaw: b.yaw, pitch: 0 }]]));
  expect(ev.some((e) => e.tipo === 'acerto' && e.alvo === b.id), JSON.stringify(ev)).toBeTruthy();
  // Jogador em (0,10), bot em (0,-10): o atirador está em +z, yaw π (yaw 0 olha para -z).
  expect(b.cerebro.ultimoDano).not.toBe(null);
  expect(Math.abs(Math.abs(b.cerebro.ultimoDano!.angulo) - Math.PI)).toBeLessThan(1e-9);
});

// Integração: 5×5 bots por 120 s no médio (o limite de 10 s do original vira o timeout do Vitest).
test('integração: 5×5 bots por 120 s no médio', () => {
  const inicio = Date.now();
  const mundo = criarMundo({ mapa: MAPA, primariaJogador: 'rifle', dificuldade: 'medio', rng: criarRng(21) });
  posicionarParaRound(mundo, 'A');
  const grafo = criarGrafo(MAPA.waypoints, MAPA.arestas);
  const rng = criarRng(22);
  let mortes = 0;
  let tiros = 0;
  for (let i = 0; i < 120 / DT; i++) {
    const comandos = new Map<number, Comandos>();
    for (const e of mundo.entidades) if (e.vivo) comandos.set(e.id, pensar(e, mundo, grafo, 'medio', DT, rng));
    const eventos: Evento[] = passo(mundo, DT, comandos);
    for (const ev of eventos) {
      if (ev.tipo === 'morte') mortes += 1;
      if (ev.tipo === 'tiro') tiros += 1;
    }
    for (const e of mundo.entidades) {
      expect(Math.abs(e.pos.x) <= 40.5 && Math.abs(e.pos.z) <= 30.5 && e.pos.y > -0.5, `${e.id} fora`).toBeTruthy();
    }
  }
  console.log(`integração: ${mortes} mortes, ${tiros} tiros, ${Date.now() - inicio} ms`);
  expect(mortes >= 3, `só ${mortes} mortes`).toBeTruthy();
  expect(Date.now() - inicio < 10000).toBeTruthy();
}, 60_000);

test('recarrega com pente vazio mesmo em combate e nunca troca para a faca', () => {
  const { mundo, b } = cena();
  b.armas.primaria.municao = 0;
  const rng = criarRng(30);
  const cmds = simular(mundo, b, grafoMapa, 'medio', 20, rng);
  expect(b.cerebro!.estado).toBe('combate');
  expect(cmds.some((c) => c.recarregar)).toBeTruthy();
  expect(cmds.every((c) => c.slot !== 'faca')).toBeTruthy();
  b.armas.primaria.reserva = 0;
  b.armas.primaria.municao = 0;
  b.armas.primaria.recarregandoAte = 0;
  const cmd = pensar(b, mundo, grafoMapa, 'medio', DT, rng);
  expect(cmd.slot).toBe('pistola');
});

test('compensação de recuo não sobe para a cabeça', () => {
  const { mundo, b, alvo } = cena({ inimigo: { x: 0, z: -20 } });
  alvo.hp = 1e9;
  // Reescrito no Plano 2: sem `erroMira`; o bot "ideal" agora é a mão do difícil sem tremor, que tenta
  // compensar o recuo (a compensação sai atrasada pela inércia) e nunca escolhe a cabeça.
  const ideal: Dificuldade = {
    reacao: 0.2, chanceCabeca: 0, toleranciaTiro: 0.05, trocaParaCabeca: true,
    mao: { atraso: 0.2, firmeza: 16, amortecimento: 0.7, acelMax: 140, tremor: 0, previsao: 0.7 },
  };
  const rng = criarRng(31);
  const partes = { cabeca: 0, tronco: 0, pernas: 0 };
  for (let i = 0; i < 400; i++) {
    const cmd = pensar(b, mundo, grafoMapa, ideal, DT, rng);
    const eventos: Evento[] = passo(mundo, DT, new Map([[b.id, cmd]]));
    for (const ev of eventos) {
      if (ev.tipo === 'acerto' && ev.atirador === b.id) partes[ev.parte] += 1;
    }
  }
  const total = partes.cabeca + partes.tronco + partes.pernas;
  console.log(`recuo ideal 20 m: ${JSON.stringify(partes)}`);
  expect(total >= 20, `só ${total} acertos`).toBeTruthy();
  expect(partes.cabeca <= 0.05 * total, JSON.stringify(partes)).toBeTruthy();
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
    expect(e.cerebro!.passoRota <= 1, `bot ${e.id} em passoRota ${e.cerebro!.passoRota}`).toBeTruthy();
  }
  // Fim do freeze: pensar volta e o bot anda (nada de waypoint pulado de cara).
  for (let i = 0; i < 2 / DT; i++) {
    const comandos = new Map<number, Comandos>();
    for (const e of mundo.entidades) if (e.bot && e.vivo) comandos.set(e.id, pensar(e, mundo, grafo, 'medio', DT, rng));
    passo(mundo, DT, comandos);
  }
  for (const e of mundo.entidades.filter((x) => x.bot)) {
    expect(e.cerebro!.passoRota <= 3, `bot ${e.id} em passoRota ${e.cerebro!.passoRota}`).toBeTruthy();
    expect(e.distAndada > 3, `bot ${e.id} andou ${e.distAndada.toFixed(1)} m`).toBeTruthy();
  }
});

test('desencalhe só conta quadros em que o bot tentava andar', () => {
  // `pensar` sem `passo`: velHoriz fica 0, como no freeze ou contra uma parede.
  const { mundo, b, alvo } = cena({ bot: { x: 0, z: 15 } });
  alvo.vivo = false;
  const rng = criarRng(8);
  const c = criarCerebro(b, grafoMapa, rng, [chao]);
  b.cerebro = c;
  expect(c.rota.length > 3).toBeTruthy();
  pensar(b, mundo, grafoMapa, 'medio', 0.6, rng);
  const base = c.passoRota;
  expect(c.preso, 'sem intenção de andar no quadro anterior, não acumula').toBe(0);
  pensar(b, mundo, grafoMapa, 'medio', 0.6, rng);
  expect(Math.abs(c.preso - 0.6) < 1e-9, `preso=${c.preso}`).toBeTruthy();
  pensar(b, mundo, grafoMapa, 'medio', 0.6, rng);
  expect(c.passoRota, 'encalhado de verdade: pula um waypoint').toBe(base + 1);
  expect(c.preso).toBe(0);
});

test('tiro silenciado só é ouvido de perto; tiro normal chega longe', () => {
  const casos: ['rifleS' | 'rifle', boolean, boolean][] = [['rifleS', true, false], ['rifle', true, true]];
  for (const [arma, perto, longe] of casos) {
    const mundo = criarMundo({ mapa: MAPA, primariaJogador: arma, dificuldade: 'medio', rng: criarRng(9) });
    posicionarParaRound(mundo, 'A');
    const eu = mundo.entidades[0];
    eu.armas!.primaria = criarArma(arma);
    eu.slot = 'primaria';
    eu.pos = { x: 0, y: 0, z: 10 };
    passo(mundo, 0.016, new Map([[0, { frente: 0, lado: 0, yaw: 0, pitch: 0, atirar: true } as Comandos]])); // parcial, como no teste original
    const ruido = mundo.ruidos.find((r) => r.id === 0);
    expect(ruido, arma).toBeTruthy();
    const bot = mundo.entidades[5];
    bot.pos = { x: 0, y: 0, z: 4 }; // 6 m
    expect(Boolean(ouvir(bot, mundo, { ouvidoEm: -Infinity })), `${arma} perto`).toBe(perto);
    bot.pos = { x: 0, y: 0, z: -20 }; // 30 m
    expect(Boolean(ouvir(bot, mundo, { ouvidoEm: -Infinity })), `${arma} longe`).toBe(longe);
  }
});
