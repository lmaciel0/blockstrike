import { expect, test } from 'vitest';
import { pensar } from '../src/bots.js';
import { criarMundo, posicionarParaRound, passo } from '../src/mundo.js';
import { criarGrafo } from '../src/navegacao.js';
import { angulo, olho } from '../src/fisica.js';
import { DIFICULDADE } from '../src/config.js';
import { MAPA } from '../src/mapa.js';
import { criarRng } from '../src/rng.js';
import type { Arma, ArmasEntidade, Caixa, Comandos, Entidade, Mundo, NomeDificuldade, Rng } from '../src/tipos.js';

// Mira humana (Task 7): o bot mira onde percebeu o alvo `mao.atraso` s atrás e move yaw/pitch pela mão virtual.
const DT = 1 / 60;
const NOMES: NomeDificuldade[] = ['facil', 'medio', 'dificil'];
const chao: Caixa = { min: { x: -50, y: -1, z: -50 }, max: { x: 50, y: 0, z: 50 }, cor: 0x888888 };
const parede = (x0: number, z0: number, x1: number, z1: number, h = 3): Caixa => (
  { min: { x: x0, y: 0, z: z0 }, max: { x: x1, y: h, z: z1 }, cor: 1 });
const grafo = criarGrafo(MAPA.waypoints, MAPA.arestas);

type Bot = Entidade & { armas: ArmasEntidade & { primaria: Arma } };

// Ponto no chão a `d` m do bot em (0,0), no yaw `a` (yaw 0 olha para -z; yaw + vira para -x).
const noYaw = (a: number, d: number): { x: number; y: number; z: number } => (
  { x: -Math.sin(a) * d, y: 0, z: -Math.cos(a) * d });
const RAD30 = Math.PI / 6;

// Chão plano, bot 1 em (0,0,0) com yaw 0 e rifle; só ele e os inimigos 5 e 6 vivos (6 só se pedido).
function cena(
  { caixas = [chao], alvo = noYaw(RAD30, 15), seed = 1 }: { caixas?: Caixa[]; alvo?: { x: number; y: number; z: number }; seed?: number } = {},
): { mundo: Mundo; b: Bot; a: Entidade; outro: Entidade } {
  const mundo = criarMundo({ mapa: { ...MAPA, caixas }, primariaJogador: 'rifle', dificuldade: 'medio', rng: criarRng(seed) });
  posicionarParaRound(mundo, 'A');
  for (const e of mundo.entidades) e.vivo = false;
  const b = mundo.entidades[1] as Bot;
  const a = mundo.entidades[5];
  const outro = mundo.entidades[6];
  b.vivo = true;
  a.vivo = true;
  b.armas.primaria = { ...b.armas.primaria, tipo: 'rifle', municao: 30, reserva: 90 };
  b.pos = { x: 0, y: 0, z: 0 };
  b.yaw = 0;
  b.pitch = 0;
  a.pos = { ...alvo };
  a.hp = 1e9;
  outro.hp = 1e9;
  return { mundo, b, a, outro };
}

interface Quadro { t: number; cmd: Comandos; vistoHa: number }

// `n` passos de pensar + passo (só o bot pensa); `antes(i, t)` mexe na cena antes de cada pensar.
function rodar(
  mundo: Mundo, b: Bot, dif: NomeDificuldade, n: number, rng: Rng = criarRng(7),
  antes: (i: number, t: number) => void = () => {},
): Quadro[] {
  const quadros: Quadro[] = [];
  for (let i = 0; i < n; i++) {
    antes(i, mundo.tempo);
    const t = mundo.tempo;
    const cmd = pensar(b, mundo, grafo, dif, DT, rng);
    quadros.push({ t, cmd, vistoHa: b.cerebro!.vistoHa });
    passo(mundo, DT, new Map([[b.id, cmd]]));
  }
  return quadros;
}

const yawDoOlho = (b: Entidade, p: { x: number; z: number }): number => {
  const o = olho(b);
  return Math.atan2(-(p.x - o.x), -(p.z - o.z));
};

test('mira: não começa a girar antes do atraso', () => {
  for (const nome of NOMES) {
    const { mundo, b } = cena();
    const atraso = DIFICULDADE[nome].mao.atraso;
    const quadros = rodar(mundo, b, nome, Math.ceil(atraso / DT) + 10);
    for (const q of quadros.filter((x) => x.t < atraso - DT)) {
      expect(Math.abs(q.cmd.yaw), `${nome} t=${q.t.toFixed(3)} yaw=${q.cmd.yaw}`).toBeLessThan(1e-3);
    }
    expect(Math.abs(quadros.at(-1)!.cmd.yaw), `${nome}: começou a girar depois do atraso`).toBeGreaterThan(1e-3);
  }
});

test('mira: não atira antes da reação', () => {
  for (const nome of NOMES) {
    const { mundo, b } = cena();
    const quadros = rodar(mundo, b, nome, 120);
    for (const q of quadros) {
      if (q.cmd.atirar) expect(q.vistoHa, `${nome} atirou em t=${q.t.toFixed(3)}`).toBeGreaterThanOrEqual(DIFICULDADE[nome].reacao);
    }
    expect(quadros.some((q) => q.cmd.atirar), `${nome}: nunca atirou em 2 s`).toBeTruthy();
    if (nome === 'medio') expect(quadros.find((q) => q.cmd.atirar)!.t).toBeGreaterThanOrEqual(0.35);
    if (nome === 'dificil') expect(quadros.find((q) => Math.abs(q.cmd.yaw) > 1e-3)!.t).toBeGreaterThanOrEqual(0.2);
  }
});

// Erro angular médio (yaw) entre a mira e a posição real do alvo, de 1 s a 3 s; `vel` em m/s ao longo de x.
function erroRastreio(nome: NomeDificuldade, vel: number): number {
  const inicio = noYaw(RAD30, 15);
  const { mundo, b, a } = cena({ alvo: inicio });
  let soma = 0;
  let n = 0;
  rodar(mundo, b, nome, 180, criarRng(9), (_i, t) => {
    a.pos = { x: inicio.x + vel * t, y: 0, z: inicio.z };
    if (t >= 1) {
      soma += Math.abs(angulo(b.yaw - yawDoOlho(b, a.pos)));
      n += 1;
    }
  });
  return soma / n;
}

test('mira: rastreio atrasado em alvo correndo', () => {
  for (const nome of NOMES) {
    const parado = erroRastreio(nome, 0);
    const correndo = erroRastreio(nome, 5);
    expect(correndo, `${nome}: correndo ${correndo.toFixed(4)} x parado ${parado.toFixed(4)}`).toBeGreaterThan(parado);
  }
});

// Task 7b: com previsão, a mão vai para onde o alvo deve estar agora (posição percebida + velocidade × atraso),
// não só para onde ele estava. Alvo a 4 m/s de lado a 15 m (duelo de entrada).
test('mira: previsão aproxima a mira do alvo correndo', () => {
  const perfil = DIFICULDADE.medio.mao;
  const original = perfil.previsao;
  try {
    perfil.previsao = 0;
    const sem = erroRastreio('medio', 4);
    perfil.previsao = 0.7;
    const com = erroRastreio('medio', 4);
    expect(com, `com previsão ${com.toFixed(4)} x sem ${sem.toFixed(4)}`).toBeLessThan(sem);
  } finally {
    perfil.previsao = original;
  }
});

// Task 9 (R9): a mão recebe a velocidade angular do ponto previsto (feedforward) e rastreia sem o erro de regime
// da mola (~2ζ·w/ω, w = 4/15 rad/s). Com previsão 1, sobra quase só o tremor.
test('mira: feedforward tira o erro de regime no rastreio', () => {
  const perfil = DIFICULDADE.medio.mao;
  const original = perfil.previsao;
  try {
    perfil.previsao = 1;
    const erro = erroRastreio('medio', 4);
    const regime = (2 * perfil.amortecimento * (4 / 15)) / perfil.firmeza;
    expect(erro, `erro ${erro.toFixed(4)} x regime ${regime.toFixed(4)}`).toBeLessThan(0.5 * regime);
  } finally {
    perfil.previsao = original;
  }
});

// Parede x -4..-1, z -10..-9: esconde (-2.5, -13) do bot em (0,0), mas não a posição inicial a 30°.
test('mira: alvo escondido não atualiza a mira', () => {
  for (const nome of NOMES) {
    const inicio = noYaw(RAD30, 15);
    const novo = { x: inicio.x + 5, y: 0, z: inicio.z };
    const { mundo, b, a } = cena({ caixas: [chao, parede(-4, -10, -1, -9)], alvo: inicio });
    const quadros = rodar(mundo, b, nome, 90, criarRng(10), (i) => {
      if (i === 60) a.pos = { ...novo }; // visível 1 s; depois entra atrás da caixa, 5 m ao lado
    });
    const yawVelho = yawDoOlho(b, inicio);
    const yawNovo = yawDoOlho(b, novo);
    const tol = 0.06 + 3 * DIFICULDADE[nome].mao.tremor;
    for (const q of quadros.slice(60)) {
      const doVelho = Math.abs(angulo(q.cmd.yaw - yawVelho));
      expect(doVelho, `${nome} t=${q.t.toFixed(3)}: mira saiu do último ponto percebido`).toBeLessThan(tol);
      expect(doVelho, `${nome} t=${q.t.toFixed(3)}: mira foi para a posição nova`).toBeLessThan(Math.abs(angulo(q.cmd.yaw - yawNovo)));
    }
  }
});

// A a 30° à esquerda; aos 0,8 s A morre e B (nunca visto) aparece a 15° à direita (dentro do cone de 110°).
test('mira: troca de alvo respeita o atraso do novo alvo', () => {
  for (const nome of NOMES) {
    const { mundo, b, a, outro } = cena();
    outro.pos = noYaw(-RAD30 / 2, 15);
    const TROCA = 48;
    const quadros = rodar(mundo, b, nome, 150, criarRng(11), (i) => {
      if (i === TROCA) {
        a.vivo = false;
        outro.vivo = true;
      }
    });
    const dif = DIFICULDADE[nome];
    for (const q of quadros.slice(TROCA)) {
      if (q.cmd.atirar) expect(q.t - quadros[TROCA].t, `${nome}: atirou em B cedo`).toBeGreaterThanOrEqual(dif.reacao - 1e-9);
    }
    expect(quadros.slice(TROCA).some((q) => q.cmd.atirar), `${nome}: nunca atirou em B`).toBeTruthy();
    // Sem teleporte: o passo de yaw só cresce o que a aceleração máxima deixa.
    for (let i = TROCA - 5; i < quadros.length; i++) {
      const d0 = angulo(quadros[i - 1].cmd.yaw - quadros[i - 2].cmd.yaw);
      const d1 = angulo(quadros[i].cmd.yaw - quadros[i - 1].cmd.yaw);
      expect(Math.abs(d1), `${nome} passo ${i}`).toBeLessThanOrEqual(dif.mao.acelMax * DT * DT + Math.abs(d0) + 1e-9);
    }
    expect(Math.abs(angulo(quadros.at(-1)!.cmd.yaw - yawDoOlho(b, outro.pos))), `${nome}: não chegou em B`).toBeLessThan(0.05);
  }
});

// Alvo a 2,5 m (dentro da visão de 360°) a 90°: a mão médio passa do ângulo e volta.
test('mira: passa do ponto em giro de 90°', () => {
  let passou = 0;
  for (let seed = 1; seed <= 20; seed++) {
    const { mundo, b, a } = cena({ alvo: noYaw(Math.PI / 2, 2.5) });
    const quadros = rodar(mundo, b, 'medio', 90, criarRng(seed));
    const alvo = yawDoOlho(b, a.pos);
    const i = quadros.findIndex((q) => q.cmd.yaw > alvo);
    if (i >= 0 && quadros.slice(i).some((q) => q.cmd.yaw < alvo)) passou += 1;
  }
  expect(passou, 'nenhum dos 20 seeds passou do ponto').toBeGreaterThan(0);
});

// Review Focus 3: o bot volta da rota para o combate com a mão parada há muito tempo (velocidade velha de 20 rad/s,
// usada pela última vez há 5 s): a velocidade zera e o primeiro passo só anda o que a aceleração máxima deixa.
test('mão: velocidade zera depois de um tempo sem uso', () => {
  for (const nome of NOMES) {
    const { mundo, b } = cena();
    rodar(mundo, b, nome, 1); // cria o cérebro
    const c = b.cerebro!;
    mundo.tempo = 10;
    c.mao = { ...c.mao, vYaw: 20, vPitch: -20, usadaEm: 5 };
    const dif = DIFICULDADE[nome];
    const antes = b.yaw;
    const [q] = rodar(mundo, b, nome, 1, criarRng(12));
    // Partindo de velocidade 0, um passo anda no máximo acelMax·dt² (com a velocidade velha, 20/60 = 0,33 rad).
    expect(Math.abs(angulo(q.cmd.yaw - antes)), nome).toBeLessThanOrEqual(dif.mao.acelMax * DT * DT + 1e-9);
    expect(Math.abs(c.mao.vYaw), `${nome}: velocidade velha sobrou`).toBeLessThanOrEqual(dif.mao.acelMax * DT + 1e-9);
    expect(Math.abs(c.mao.vPitch), nome).toBeLessThanOrEqual(dif.mao.acelMax * DT + 1e-9);
  }
});

// Dois inimigos que se revezam espiando: a troca para um inimigo já visto há pouco (dentro da janela de percepção)
// não zera a reação; ela conta desde que ele foi visto pela primeira vez. Antes, o CT no posto trocava de alvo a cada
// espiada e nunca chegava a atirar.
test('mira: troca para inimigo visto há pouco conta a reação desde a primeira vez', () => {
  const { mundo, b, a, outro } = cena();
  outro.pos = noYaw(RAD30 / 2, 15);
  rodar(mundo, b, 'medio', 90, criarRng(13), (i) => {
    a.vivo = i < 36 || i >= 48; // A visível 0,6 s, some 0,2 s (B visível), volta
    outro.vivo = i >= 36 && i < 48;
  });
  expect(b.cerebro!.alvoId).toBe(a.id);
  expect(b.cerebro!.vistoHa, 'reação zerada na volta de A').toBeGreaterThan(1.4);
});
