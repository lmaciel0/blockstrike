import { expect, test } from 'vitest';
import { pensar } from '../src/bots.js';
import { criarMundo, posicionarParaRound, passo } from '../src/mundo.js';
import { criarGrafo } from '../src/navegacao.js';
import { angulo, olho } from '../src/fisica.js';
import { ARMAS, DIFICULDADE, RECUO_MAX } from '../src/config.js';
import { MAPA } from '../src/mapa.js';
import { criarRng } from '../src/rng.js';
import type {
  Arma, ArmasEntidade, Caixa, Comandos, Dificuldade, Entidade, Mundo, NomeDificuldade, Rng,
} from '../src/tipos.js';

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
  mundo: Mundo, b: Bot, dif: NomeDificuldade | Dificuldade, n: number, rng: Rng = criarRng(7),
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

// Alvo espiando atrás de uma caixa: visível 0,3 s, escondido 0,2 s, por 3 s. Com o alvo guardado (`alvoId`), a reação
// não zera na volta e soma os quadros visíveis até a `reacao`, então o bot atira. Regressão (ruling R14).
test('mira: re-peek do mesmo alvo não zera a reação', () => {
  for (const nome of NOMES) {
    const fora = noYaw(RAD30, 15);
    const atras = { x: fora.x + 5, y: 0, z: fora.z }; // atrás da caixa (mesma cena de "alvo escondido")
    const { mundo, b, a } = cena({ caixas: [chao, parede(-4, -10, -1, -9)], alvo: fora });
    const quadros = rodar(mundo, b, nome, 180, criarRng(17), (i) => {
      a.pos = { ...(i % 30 < 18 ? fora : atras) };
    });
    expect(quadros.some((q) => q.cmd.atirar), `${nome}: nunca atirou no alvo que espia`).toBeTruthy();
  }
});

// Visto 0,3 s, some por mais que a janela de percepção (2 s): ao voltar, conta como novo e a reação começa do zero.
test('mira: inimigo nunca visto começa a reação do zero', () => {
  for (const nome of NOMES) {
    const fora = noYaw(RAD30, 15);
    const atras = { x: fora.x + 5, y: 0, z: fora.z };
    const { mundo, b, a } = cena({ caixas: [chao, parede(-4, -10, -1, -9)], alvo: fora });
    const VOLTA = 18 + 150; // 0,3 s visível + 2,5 s escondido
    const quadros = rodar(mundo, b, nome, VOLTA + 60, criarRng(19), (i) => {
      a.pos = { ...(i < 18 || i >= VOLTA ? fora : atras) };
    });
    const dif = DIFICULDADE[nome];
    expect(quadros[VOLTA].vistoHa, `${nome}: reação não começou do zero`).toBeLessThanOrEqual(DT + 1e-9);
    for (const q of quadros.slice(VOLTA)) {
      if (q.cmd.atirar) expect(q.t - quadros[VOLTA].t, `${nome}: atirou cedo`).toBeGreaterThanOrEqual(dif.reacao - 1e-9);
    }
  }
});

// Tronco atrás de caixa de 1,2 m (z -9..-8), cabeça visível; alvo a 10 m de frente, `c.cabeca` sempre false (`forcar`).
// O bot começa com o pitch no tronco: só a troca para a cabeça faz a mão subir.
function cenaTronco(nome: NomeDificuldade): { mundo: Mundo; b: Bot; a: Entidade; caixa: Caixa; forcar: () => void } {
  const caixa: Caixa = { min: { x: -3, y: 0, z: -9 }, max: { x: 3, y: 1.2, z: -8 }, cor: 1 };
  const { mundo, b, a } = cena({ caixas: [chao, caixa], alvo: { x: 0, y: 0, z: -10 } });
  b.pitch = pitchesTronco(b, a, nome).tronco;
  return { mundo, b, a, caixa, forcar: () => { if (b.cerebro) b.cerebro.cabeca = false; } };
}

// Pitch esperado do tronco e da cabeça; a mira desce o recuo do próximo tiro (`atacar`).
function pitchesTronco(b: Bot, a: Entidade, nome: NomeDificuldade): { tronco: number; cabeca: number } {
  const o = olho(b);
  const distancia = Math.hypot(a.pos.x - o.x, a.pos.z - o.z);
  const recuo = Math.min(b.armas.primaria.recuoAcum + ARMAS.rifle.recuo, RECUO_MAX);
  const pitchDe = (y: number): number => Math.atan2(y - o.y, distancia) - recuo;
  return { tronco: pitchDe(DIFICULDADE[nome].alturaTronco ?? 1.1), cabeca: pitchDe(1.6) };
}

// Roda até a primeira vez que o bot vê o tronco escondido (`troncoEscondidoDesde` gravado) e devolve esse quadro.
function ateEsconder(mundo: Mundo, b: Bot, nome: NomeDificuldade, rng: Rng, forcar: () => void): Quadro {
  for (let i = 0; i < 120; i++) {
    const [q] = rodar(mundo, b, nome, 1, rng, forcar);
    if (b.cerebro?.troncoEscondidoDesde != null) return q;
  }
  throw new Error(`${nome}: nunca gravou troncoEscondidoDesde`);
}

const perto = (x: number, y: number): boolean => Math.abs(x - y) < 0.025;

test('mira: tronco escondido, fácil e médio só trocam para a cabeça depois de trocaParaCabecaApos', () => {
  for (const nome of ['facil', 'medio'] as NomeDificuldade[]) {
    const apos = DIFICULDADE[nome].trocaParaCabecaApos;
    expect(apos, `${nome}: espera positiva`).toBeGreaterThan(0);
    const { mundo, b, a, forcar } = cenaTronco(nome);
    const rng = criarRng(21);
    const q0 = ateEsconder(mundo, b, nome, rng, forcar);
    expect(b.cerebro!.troncoEscondidoDesde, `${nome}: grava o instante`).toBe(q0.t);
    // Antes do tempo: segue no tronco escondido e não atira (regressão da H1).
    const antes = rodar(mundo, b, nome, Math.floor(apos / DT) - 2, rng, forcar);
    expect(antes.at(-1)!.t, `${nome}: ainda antes do tempo`).toBeLessThan(q0.t + apos);
    expect(antes.some((q) => q.cmd.atirar), `${nome}: atirou no tronco escondido`).toBeFalsy();
    const p1 = pitchesTronco(b, a, nome);
    expect(perto(antes.at(-1)!.cmd.pitch, p1.tronco), `${nome}: pitch ${antes.at(-1)!.cmd.pitch.toFixed(4)} x tronco ${p1.tronco.toFixed(4)}`).toBeTruthy();
    // Depois do tempo: mira na cabeça e o gatilho volta a valer.
    const depois = rodar(mundo, b, nome, Math.round(1 / DT), rng, forcar);
    expect(depois.some((q) => q.cmd.atirar), `${nome}: não atirou na cabeça`).toBeTruthy();
    expect(depois.find((q) => q.cmd.atirar)!.t, `${nome}: atirou antes do tempo`).toBeGreaterThanOrEqual(q0.t + apos - 1e-9);
    const p2 = pitchesTronco(b, a, nome);
    expect(perto(depois.at(-1)!.cmd.pitch, p2.cabeca), `${nome}: pitch ${depois.at(-1)!.cmd.pitch.toFixed(4)} x cabeça ${p2.cabeca.toFixed(4)}`).toBeTruthy();
  }
});

test('mira: tronco aparece e some de novo, a contagem para a cabeça recomeça do zero', () => {
  for (const nome of ['facil', 'medio'] as NomeDificuldade[]) {
    const apos = DIFICULDADE[nome].trocaParaCabecaApos;
    const { mundo, b, a, caixa, forcar } = cenaTronco(nome);
    const rng = criarRng(21);
    const q0 = ateEsconder(mundo, b, nome, rng, forcar);
    rodar(mundo, b, nome, Math.round((0.5 * apos) / DT), rng, forcar);
    // A caixa sai por 3 quadros: o tronco aparece e a contagem zera.
    mundo.mapa.caixas.splice(mundo.mapa.caixas.indexOf(caixa), 1);
    rodar(mundo, b, nome, 3, rng, forcar);
    expect(b.cerebro!.troncoEscondidoDesde, `${nome}: tronco à vista zera a contagem`).toBe(null);
    mundo.mapa.caixas.push(caixa);
    const [volta] = rodar(mundo, b, nome, 1, rng, forcar);
    expect(b.cerebro!.troncoEscondidoDesde, `${nome}: recomeça na volta da caixa`).toBe(volta.t);
    // Passa do tempo contado desde o primeiro sumiço, mas não do novo: segue no tronco, sem atirar.
    const resto = rodar(mundo, b, nome, Math.floor(apos / DT) - 2, rng, forcar);
    expect(resto.at(-1)!.t, `${nome}: passou do tempo antigo`).toBeGreaterThan(q0.t + apos);
    expect(resto.some((q) => q.cmd.atirar), `${nome}: atirou antes da nova contagem`).toBeFalsy();
    const p = pitchesTronco(b, a, nome);
    expect(perto(resto.at(-1)!.cmd.pitch, p.tronco), `${nome}: pitch ${resto.at(-1)!.cmd.pitch.toFixed(4)} x tronco ${p.tronco.toFixed(4)}`).toBeTruthy();
  }
});

test('mira: tronco escondido, o difícil troca para a cabeça já no primeiro quadro', () => {
  const nome: NomeDificuldade = 'dificil';
  expect(DIFICULDADE[nome].trocaParaCabecaApos).toBe(0);
  const { mundo, b, a, forcar } = cenaTronco(nome);
  const rng = criarRng(21);
  const inicio = b.pitch;
  const q0 = ateEsconder(mundo, b, nome, rng, forcar);
  // A mão sai do tronco para cima já no quadro em que o tronco some.
  expect(q0.cmd.pitch, 'difícil: a mão não subiu no primeiro quadro').toBeGreaterThan(inicio + 1e-4);
  const depois = rodar(mundo, b, nome, Math.round(0.5 / DT), rng, forcar);
  const p = pitchesTronco(b, a, nome);
  expect(perto(depois.at(-1)!.cmd.pitch, p.cabeca), `difícil: pitch ${depois.at(-1)!.cmd.pitch.toFixed(4)} x cabeça ${p.cabeca.toFixed(4)}`).toBeTruthy();
});

// Tronco escondido, cabeça à vista, a 25 m (além do alcance ideal de 15 m da pistola e de 20 m do rifle): sem visada
// o bot não conta como "disparando", então não fica parado olhando o tronco: segue avançando e não atira.
// `trocaParaCabecaApos` infinito: o bot nunca troca para a cabeça, e o teste mede só o caminho sem visada.
// Rifle (automática): `disparando` exige `emRajada`; o caso que trava é o da rajada em curso quando o tronco some.
test('mira: tronco escondido sem troca não trava o bot parado (pistola e rifle)', () => {
  for (const slot of ['pistola', 'primaria'] as const) {
    for (const nome of ['facil', 'medio'] as NomeDificuldade[]) {
      const caixa: Caixa = { min: { x: -3, y: 0, z: -24 }, max: { x: 3, y: 1.2, z: -23 }, cor: 1 };
      const { mundo, b } = cena({ caixas: [chao, caixa], alvo: { x: 0, y: 0, z: -25 } });
      b.slot = slot;
      const reacao = DIFICULDADE[nome].reacao;
      const rotulo = `${nome}/${slot}`;
      const semTroca: Dificuldade = { ...DIFICULDADE[nome], trocaParaCabecaApos: Infinity };
      const quadros = rodar(mundo, b, semTroca, 240, criarRng(23), (i) => {
        const c = b.cerebro;
        if (c) c.cabeca = false;
        if (c && i === 1 && slot === 'primaria') {
          c.emRajada = true; // rajada em curso (sem tiro, `rajada` não cai) quando o tronco some atrás da caixa
          c.rajada = 5;
        }
        b.slot = slot;
      });
      const prontos = quadros.filter((q) => q.vistoHa >= reacao);
      expect(prontos.length, `${rotulo}: nunca passou da reação`).toBeGreaterThan(0);
      expect(quadros.some((q) => q.cmd.atirar), `${rotulo}: atirou no tronco escondido`).toBeFalsy();
      expect(b.cerebro!.disparando, `${rotulo}: travado como disparando sem visada`).toBeFalsy();
      expect(Math.hypot(b.pos.x, b.pos.z), `${rotulo}: não avançou`).toBeGreaterThan(1);
    }
  }
});
