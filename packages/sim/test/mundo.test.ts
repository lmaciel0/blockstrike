import { expect, test } from 'vitest';
import { criarMundo, posicionarParaRound, passo, vivosPorTime } from '../src/mundo.js';
import { olho, direcao } from '../src/fisica.js';
import { MAPA } from '../src/mapa.js';
import { criarArma, danoDe } from '../src/armas.js';
import { criarRng } from '../src/rng.js';
import { JOGADOR, NOMES_BOTS } from '../src/config.js';
import type {
  Caixa, Comandos, Entidade, Evento, Mundo, OpcoesPasso, Slot, SlotPedido, Time, TipoPrimaria,
} from '../src/tipos.js';

const chao: Caixa = { min: { x: -50, y: -1, z: -50 }, max: { x: 50, y: 0, z: 50 }, cor: 0x888888 };
// Sem `usar` e `granada`, como no teste original: os campos que faltam valem undefined (falso) no `passo`.
const cmd = (extra: Partial<Comandos> = {}): Comandos => ({
  frente: 0, lado: 0, pular: false, agachar: false, devagar: false, atirar: false,
  zoom: false, recarregar: false, slot: null, yaw: 0, pitch: 0, ...extra,
}) as Comandos;
const novo = (caixas: Caixa[] = [chao]): Mundo => {
  const mundo = criarMundo({
    mapa: { ...MAPA, caixas }, primariaJogador: 'rifle', dificuldade: 'medio', rng: criarRng(1),
  });
  posicionarParaRound(mundo, 'A');
  mundo.entidades[0].pos = { x: 0, y: 0, z: 0 };
  return mundo;
};
const rodar = (mundo: Mundo, n: number, fn: (i: number) => Comandos, opcoes: OpcoesPasso = { congelado: false }): void => {
  for (let i = 0; i < n; i++) passo(mundo, 0.05, new Map([[0, fn(i)]]), opcoes);
};
const jogador = (m: Mundo): Entidade => m.entidades[0];

test('criarMundo tem 5 azuis (jogador id 0) e 5 laranja', () => {
  const m = criarMundo({ mapa: MAPA, primariaJogador: 'smg', dificuldade: 'facil', rng: criarRng(2) });
  expect(m.entidades.length).toBe(10);
  expect(m.jogadorId).toBe(0);
  expect(m.tempo).toBe(0);
  expect(m.entidades[0].bot).toBe(false);
  expect(m.entidades[0].time).toBe('azul');
  expect(m.entidades[0].primariaEscolhida).toBe('smg');
  expect(m.entidades.filter((e) => e.time === 'azul').length).toBe(5);
  expect(m.entidades.filter((e) => e.time === 'laranja').length).toBe(5);
  m.entidades.forEach((e, i) => expect(e.id).toBe(i));
  expect(m.entidades.slice(1, 5).map((e) => e.time)).toStrictEqual(Array(4).fill('azul'));
  expect(m.entidades.slice(5).map((e) => e.time)).toStrictEqual(Array(5).fill('laranja'));
  expect(m.entidades[1].nome).toBe(`Bot ${NOMES_BOTS[0]}`);
  expect(m.entidades[9].nome).toBe(`Bot ${NOMES_BOTS[8]}`);
  expect(m.entidades.slice(1).every((e) => e.bot)).toBeTruthy();
  for (const time of ['azul', 'laranja']) {
    const bots = m.entidades.filter((e) => e.bot && e.time === time);
    expect(bots.filter((e) => e.primariaEscolhida === 'sniper').length, time).toBe(1);
    expect(bots.every((e) => ['rifle', 'fuzil', 'rifleS', 'smg', 'miniSmg', 'smgS', 'escopeta', 'sniper'].includes(e.primariaEscolhida))).toBeTruthy();
  }
  expect(m.entidades[1].primariaEscolhida).toBe('sniper');
  expect(m.entidades[5].primariaEscolhida).toBe('sniper');
});

test('posicionarParaRound troca os spawns', () => {
  const m = criarMundo({ mapa: MAPA, primariaJogador: 'rifle', dificuldade: 'medio', rng: criarRng(3) });
  posicionarParaRound(m, 'A');
  expect(m.entidades[0].pos).toStrictEqual(MAPA.spawns.A[0]);
  expect(m.entidades[5].pos).toStrictEqual(MAPA.spawns.B[0]);
  expect(m.entidades[0].yaw).toBe(MAPA.yawSpawn.A);
  expect(m.entidades[5].yaw).toBe(MAPA.yawSpawn.B);
  posicionarParaRound(m, 'B');
  expect(m.entidades[0].pos).toStrictEqual(MAPA.spawns.B[0]);
  expect(m.entidades[5].pos).toStrictEqual(MAPA.spawns.A[0]);
  expect(m.entidades.every((e) => e.hp === 100 && e.vivo && e.slot === 'primaria')).toBeTruthy();
});

test('andar para frente com yaw 0 diminui z', () => {
  const m = novo();
  rodar(m, 20, () => cmd({ frente: 1 }));
  expect(Math.abs(jogador(m).pos.z - -5.1) < 0.3, `z=${jogador(m).pos.z}`).toBeTruthy(); // rifle: 5,1 m/s
  expect(Math.abs(jogador(m).pos.x) < 1e-6).toBeTruthy();
});

test('lado +1 anda para a direita (x+)', () => {
  const m = novo();
  rodar(m, 20, () => cmd({ lado: 1 }));
  expect(jogador(m).pos.x > 5).toBeTruthy();
});

test('devagar e agachado são mais lentos', () => {
  const m1 = novo();
  rodar(m1, 20, () => cmd({ frente: 1, devagar: true }));
  expect(Math.abs(-jogador(m1).pos.z - 5.1 * 0.52) < 0.2).toBeTruthy();
  const m2 = novo();
  rodar(m2, 20, () => cmd({ frente: 1, agachar: true }));
  expect(Math.abs(-jogador(m2).pos.z - 5.1 * 0.34) < 0.2).toBeTruthy();
  expect(jogador(m2).agachado).toBe(true);
});

test('diagonal não é mais rápida', () => {
  const m = novo();
  rodar(m, 20, () => cmd({ frente: 1, lado: 1 }));
  const { x, z } = jogador(m).pos;
  expect(Math.hypot(x, z) < 5.8).toBeTruthy();
});

test('congelado não anda mas gira', () => {
  const m = novo();
  rodar(m, 10, () => cmd({ frente: 1, yaw: 1 }), { congelado: true });
  expect(jogador(m).yaw).toBe(1);
  expect(jogador(m).pos).toStrictEqual({ x: 0, y: 0, z: 0 });
});

test('pulo só no chão', () => {
  const m = novo();
  let pico = 0;
  rodar(m, 30, () => {
    pico = Math.max(pico, jogador(m).pos.y);
    return cmd({ pular: true });
  });
  pico = Math.max(pico, jogador(m).pos.y);
  expect(pico > 0.5 && pico < 1.2, `pico=${pico}`).toBeTruthy();
});

test('pitch limitado', () => {
  const m = novo();
  rodar(m, 1, () => cmd({ pitch: 3 }));
  expect(jogador(m).pitch).toBe(1.5);
  rodar(m, 1, () => cmd({ pitch: -3 }));
  expect(jogador(m).pitch).toBe(-1.5);
});

test('não levanta embaixo de teto', () => {
  const teto = { min: { x: -5, y: 1.4, z: -5 }, max: { x: 5, y: 2, z: 5 }, cor: 1 };
  const m = novo([chao, teto]);
  rodar(m, 5, () => cmd({ agachar: true }));
  expect(jogador(m).agachado).toBe(true);
  rodar(m, 5, () => cmd({ agachar: false }));
  expect(jogador(m).agachado).toBe(true);
});

test('levanta quando livre', () => {
  const m = novo();
  rodar(m, 3, () => cmd({ agachar: true }));
  rodar(m, 3, () => cmd({ agachar: false }));
  expect(jogador(m).agachado).toBe(false);
});

test('dt máximo não atravessa parede', () => {
  const parede = { min: { x: -5, y: 0, z: -1.2 }, max: { x: 5, y: 3, z: -1 }, cor: 1 };
  const m = novo([chao, parede]);
  rodar(m, 40, () => cmd({ frente: 1 }));
  expect(jogador(m).pos.z >= -1 + JOGADOR.raio - 1e-6, `z=${jogador(m).pos.z}`).toBeTruthy();
});

test('passo emite evento a cada 1,8 m correndo', () => {
  const m = novo();
  let n = 0;
  for (let i = 0; i < 20; i++) {
    n += passo(m, 0.05, new Map([[0, cmd({ frente: 1 })]]), { congelado: false })
      .filter((e) => e.tipo === 'passo' && e.id === 0).length;
  }
  expect(n >= 2 && n <= 4, `n=${n}`).toBeTruthy(); // 1 s a 5,5 m/s ≈ 3 passos
  const q = novo();
  const ev = passo(q, 0.05, new Map([[0, cmd({ frente: 1, devagar: true })]]), { congelado: false });
  expect(ev.length).toBe(0);
});

test('vivosPorTime soma n e hp', () => {
  const m = novo();
  expect(vivosPorTime(m)).toStrictEqual({ azul: { n: 5, hp: 500 }, laranja: { n: 5, hp: 500 } });
  m.entidades[2].vivo = false;
  m.entidades[6].hp = 40;
  expect(vivosPorTime(m)).toStrictEqual({ azul: { n: 4, hp: 400 }, laranja: { n: 5, hp: 440 } });
});

test('olho usa altura em pé e agachado', () => {
  expect(olho({ pos: { x: 1, y: 2, z: 3 }, agachado: false })).toStrictEqual({ x: 1, y: 3.6, z: 3 });
  const o = olho({ pos: { x: 1, y: 2, z: 3 }, agachado: true });
  expect(Math.abs(o.y - 3.1) < 1e-9).toBeTruthy();
});

test('direcao é unitária, yaw 0 olha -z, yaw positivo vira à esquerda', () => {
  const d0 = direcao(0, 0);
  expect(Math.abs(d0.x) < 1e-9 && Math.abs(d0.y) < 1e-9 && Math.abs(d0.z + 1) < 1e-9).toBeTruthy();
  const d1 = direcao(Math.PI / 2, 0);
  expect(Math.abs(d1.x + 1) < 1e-9 && Math.abs(d1.z) < 1e-9).toBeTruthy();
  const d2 = direcao(0, Math.PI / 2);
  expect(Math.abs(d2.y - 1) < 1e-9).toBeTruthy();
  const d3 = direcao(0.7, 0.4);
  expect(Math.abs(Math.hypot(d3.x, d3.y, d3.z) - 1) < 1e-9).toBeTruthy();
});

// ---- Tiro (Task 5) ----
const alvoEm = (m: Mundo, i: number, x: number, y: number, z: number, time: Time): Entidade => {
  const e = m.entidades[i];
  e.pos = { x, y, z };
  e.time = time;
  return e;
};
const pitchPara = (altura: number, dist: number): number => Math.atan2(altura - JOGADOR.olho, dist);
const atirar = (m: Mundo, extra: Partial<Comandos> = {}, opcoes: OpcoesPasso = { congelado: false }): Evento[] =>
  passo(m, 0.05, new Map([[0, cmd({ atirar: true, ...extra })]]), opcoes);
// Troca de arma e espera o saque (0,5 s cobre todos) antes do ataque.
const sacar = (m: Mundo, slot: SlotPedido): void => {
  passo(m, 0.05, new Map([[0, cmd({ slot })]]), { congelado: false });
  rodar(m, 10, () => cmd());
};

test('rifle no tronco tira 36', () => {
  const m = novo();
  const alvo = alvoEm(m, 5, 0, 0, -10, 'laranja');
  const ev = atirar(m, { pitch: pitchPara(1.1, 10) });
  expect(alvo.hp).toBe(64);
  const acerto = ev.find((e) => e.tipo === 'acerto');
  expect(acerto!.parte).toBe('tronco');
  expect(acerto!.atirador).toBe(0);
  expect(acerto!.alvo).toBe(5);
  expect(acerto!.dano).toBe(36);
  expect(ev.some((e) => e.tipo === 'tiro' && e.atirador === 0 && e.arma === 'rifle')).toBeTruthy();
  expect(jogador(m).armas!.primaria!.municao).toBe(29);
});

test('headshot de rifle mata', () => {
  const m = novo();
  const alvo = alvoEm(m, 5, 0, 0, -10, 'laranja');
  alvo.hp = danoDe('rifle', 'cabeca'); // cabeça ×2,5: rifle (36) dá 90 na cabeça, não mata mais um alvo com 100 de vida
  const ev = atirar(m, { pitch: pitchPara(1.6, 10) });
  expect(alvo.vivo).toBe(false);
  const morte = ev.find((e) => e.tipo === 'morte');
  expect(morte).toStrictEqual({ tipo: 'morte', vitima: 5, assassino: 0, arma: 'rifle', cabeca: true, assistente: null });
  expect(jogador(m).kills).toBe(1);
  expect(jogador(m).killsCabeca).toBe(1);
  expect(alvo.mortes).toBe(1);
});

test('headshot de rifle sem capacete em alvo com 100 de vida não mata', () => {
  const m = novo();
  const alvo = alvoEm(m, 5, 0, 0, -10, 'laranja');
  expect(alvo.hp).toBe(100);
  const ev = atirar(m, { pitch: pitchPara(1.6, 10) });
  expect(alvo.vivo).toBe(true);
  expect(alvo.hp).toBe(100 - danoDe('rifle', 'cabeca'));
  expect(alvo.hp).toBe(10);
  const acerto = ev.find((e) => e.tipo === 'acerto');
  expect(acerto!.parte).toBe('cabeca');
  expect(acerto!.capacete).toBe(false);
  expect(ev.some((e) => e.tipo === 'morte')).toBe(false);
});

test('fogo amigo desligado', () => {
  const m = novo();
  const alvo = alvoEm(m, 5, 0, 0, -10, 'azul');
  const ev = atirar(m, { pitch: pitchPara(1.1, 10) });
  expect(alvo.hp).toBe(100);
  expect(ev.filter((e) => e.tipo === 'acerto').length).toBe(0);
});

test('aliado na frente bloqueia o tiro', () => {
  const m = novo();
  alvoEm(m, 1, 0, 0, -5, 'azul');
  const inimigo = alvoEm(m, 5, 0, 0, -10, 'laranja');
  const ev = atirar(m, { pitch: pitchPara(1.1, 8) });
  expect(inimigo.hp).toBe(100);
  expect(m.entidades[1].hp).toBe(100);
  expect(ev.filter((e) => e.tipo === 'impacto').length).toBe(0);
});

test('parede bloqueia o tiro e gera impacto', () => {
  const parede = { min: { x: -2, y: 0, z: -6 }, max: { x: 2, y: 4, z: -5 }, cor: 0x555555 };
  const m = novo([chao, parede]);
  const alvo = alvoEm(m, 5, 0, 0, -10, 'laranja');
  const ev = atirar(m, { pitch: pitchPara(1.1, 10) });
  expect(alvo.hp).toBe(100);
  const imp = ev.find((e) => e.tipo === 'impacto');
  expect(imp && Math.abs(imp.ponto.z - -5) < 1e-6).toBeTruthy();
  expect(imp!.normal).toStrictEqual({ x: 0, y: 0, z: 1 });
});

test('congelado não atira', () => {
  const m = novo();
  const alvo = alvoEm(m, 5, 0, 0, -10, 'laranja');
  const ev = atirar(m, { pitch: pitchPara(1.1, 10) }, { congelado: true });
  expect(alvo.hp).toBe(100);
  expect(jogador(m).armas!.primaria!.municao).toBe(30);
  expect(ev.filter((e) => e.tipo === 'tiro').length).toBe(0);
});

test('faca não alcança 3 m, alcança 1,5 m', () => {
  const longe = novo();
  const a1 = alvoEm(longe, 5, 0, 0, -3, 'laranja');
  a1.yaw = Math.PI; // de frente para o jogador
  sacar(longe, 'faca');
  atirar(longe, { pitch: pitchPara(1.1, 3) });
  expect(a1.hp).toBe(100);
  const perto = novo();
  const a2 = alvoEm(perto, 5, 0, 0, -1.5, 'laranja');
  a2.yaw = Math.PI;
  sacar(perto, 'faca');
  const ev = atirar(perto, { pitch: pitchPara(1.1, 1.5) });
  expect(a2.hp).toBe(60);
  expect(ev.filter((e) => e.tipo === 'tiro' || e.tipo === 'raio').length, 'faca não atira').toBe(0);
  expect(ev.some((e) => e.tipo === 'golpe' && e.acerto === 'corpo' && !e.forte && !e.costas)).toBeTruthy();
});

test('faca: estocada (botão direito) tira 65, pelas costas mata', () => {
  const frente = novo();
  const a1 = alvoEm(frente, 5, 0, 0, -1.2, 'laranja');
  a1.yaw = Math.PI;
  sacar(frente, 'faca');
  passo(frente, 0.05, new Map([[0, cmd({ zoom: true, pitch: pitchPara(1.1, 1.2) })]]), { congelado: false });
  expect(a1.hp).toBe(35);
  const costas = novo();
  const a2 = alvoEm(costas, 5, 0, 0, -1.2, 'laranja');
  a2.yaw = 0; // olha para longe do jogador
  sacar(costas, 'faca');
  const ev = atirar(costas, { pitch: pitchPara(1.1, 1.2) });
  expect(a2.hp).toBe(10); // golpe leve pelas costas: 90
  expect(ev.some((e) => e.tipo === 'golpe' && e.costas)).toBeTruthy();
});

test('faca: golpe na parede avisa e respeita o intervalo', () => {
  const parede = { min: { x: -2, y: 0, z: -2 }, max: { x: 2, y: 4, z: -1 }, cor: 1 };
  const m = novo([chao, parede]);
  sacar(m, 'faca');
  const ev1 = atirar(m);
  expect(ev1.some((e) => e.tipo === 'golpe' && e.acerto === 'parede')).toBeTruthy();
  const ev2 = atirar(m); // 0,05 s depois: ainda no intervalo de 0,4 s
  expect(ev2.filter((e) => e.tipo === 'golpe').length).toBe(0);
});

test('faca à queima-roupa acerta', () => {
  for (const dist of [0.3, 0.1]) {
    const m = novo();
    const alvo = alvoEm(m, 5, 0, 0, -dist, 'laranja');
    sacar(m, 'faca');
    atirar(m, { pitch: pitchPara(1.1, dist) });
    expect(alvo.hp < 100, `dist=${dist} hp=${alvo.hp}`).toBeTruthy();
  }
});

test('recarregar emite evento e enche o pente depois do tempo', () => {
  const m = novo();
  jogador(m).armas!.primaria!.municao = 10;
  const ev = passo(m, 0.05, new Map([[0, cmd({ recarregar: true })]]), { congelado: false });
  expect(ev.some((e) => e.tipo === 'recarga' && e.atirador === 0)).toBeTruthy();
  rodar(m, 52, () => cmd());
  expect(jogador(m).armas!.primaria!.municao).toBe(30);
  expect(jogador(m).armas!.primaria!.reserva).toBe(70);
});

test('trocar de slot muda a arma ativa e posicionarParaRound recria as armas', () => {
  const m = novo();
  atirar(m, { slot: 'pistola' });
  expect(jogador(m).slot).toBe('pistola');
  expect(jogador(m).armas!.pistola.municao, 'sacando: ainda não atira').toBe(12);
  rodar(m, 6, () => cmd());
  atirar(m);
  expect(jogador(m).armas!.pistola.municao).toBe(11);
  expect(jogador(m).armas!.primaria!.municao).toBe(30);
  posicionarParaRound(m, 'A');
  expect(jogador(m).armas!.pistola.municao).toBe(12);
  expect(jogador(m).slot).toBe('primaria');
});

test('trocas no mesmo passo: dois inimigos com 1 HP se matam', () => {
  const m = novo();
  const inimigo = alvoEm(m, 5, 0, 0, -10, 'laranja');
  const eu = jogador(m);
  eu.hp = 1;
  inimigo.hp = 1;
  inimigo.armas!.primaria = criarArma('rifle');
  for (const e of m.entidades) if (e.id !== 0 && e.id !== 5) e.vivo = false;
  const ev = passo(m, 0.05, new Map([
    [0, cmd({ atirar: true, pitch: pitchPara(1.1, 10) })],
    [5, cmd({ atirar: true, yaw: Math.PI, pitch: Math.atan2(1.1 - JOGADOR.olho, 10) })],
  ]), { congelado: false });
  expect(inimigo.vivo).toBe(false);
  expect(eu.vivo, 'o azul (id menor) não pode escapar do revide').toBe(false);
  expect(ev.filter((e) => e.tipo === 'morte').length).toBe(2);
  expect(eu.kills).toBe(1);
  expect(inimigo.kills).toBe(1);
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
  expect(ev.filter((e) => e.tipo === 'morte').length).toBe(1);
  expect(jogador(m).kills + a.kills).toBe(1);
  expect(alvo.mortes).toBe(1);
});

test('trocar de arma zera o recuo da arma que sai', () => {
  const m = novo();
  atirar(m);
  expect(jogador(m).armas!.primaria!.recuoAcum > 0).toBeTruthy();
  atirar(m, { atirar: false, slot: 'pistola' });
  expect(jogador(m).slot).toBe('pistola');
  expect(jogador(m).armas!.primaria!.recuoAcum).toBe(0);
});

test('velocidade depende da arma: faca > pistola > rifle > sniper', () => {
  const dist = (slot: Slot, primaria: TipoPrimaria = 'rifle'): number => {
    const m = novo();
    if (primaria !== 'rifle') m.entidades[0].armas!.primaria = criarArma(primaria);
    if (slot !== 'primaria') sacar(m, slot);
    m.entidades[0].pos = { x: 0, y: 0, z: 0 };
    rodar(m, 20, () => cmd({ frente: 1 }));
    return -jogador(m).pos.z;
  };
  const faca = dist('faca');
  const pistola = dist('pistola');
  const rifle = dist('primaria');
  const sniper = dist('primaria', 'sniper');
  expect(faca > pistola + 0.2 && pistola > rifle + 0.4 && rifle > sniper, `${faca} ${pistola} ${rifle} ${sniper}`).toBeTruthy();
  expect(Math.abs(faca - 6.2) < 0.3).toBeTruthy();
});

test('Q volta para a arma anterior e a roda do mouse cicla', () => {
  const m = novo();
  sacar(m, 'faca');
  sacar(m, 'anterior');
  expect(jogador(m).slot).toBe('primaria');
  sacar(m, 'anterior');
  expect(jogador(m).slot).toBe('faca');
  sacar(m, 'roda+');
  expect(jogador(m).slot).toBe('primaria');
  sacar(m, 'roda-');
  expect(jogador(m).slot).toBe('faca');
});

test('tiro gera rastro do olho até o ponto atingido', () => {
  const m = novo();
  alvoEm(m, 5, 0, 0, -10, 'laranja');
  const ev = atirar(m, { pitch: pitchPara(1.1, 10) });
  const r = ev.find((e) => e.tipo === 'raio');
  expect(r && r.atirador === 0 && Math.abs(r.ate.z - -9.75) < 0.01, JSON.stringify(r)).toBeTruthy();
});

test('pulo e pouso emitem eventos', () => {
  const m = novo();
  rodar(m, 2, () => cmd());
  const ev = [];
  for (let i = 0; i < 30; i++) ev.push(...passo(m, 0.05, new Map([[0, cmd({ pular: i === 0 })]]), { congelado: false }));
  expect(ev.filter((e) => e.tipo === 'pulo').length).toBe(1);
  expect(ev.filter((e) => e.tipo === 'pouso').length).toBe(1);
});

test('treino: só o jogador, reserva infinita', () => {
  const m = criarMundo({ mapa: MAPA, primariaJogador: 'rifle', dificuldade: 'medio', rng: criarRng(4), modo: 'treino' });
  expect(m.entidades.length).toBe(1);
  posicionarParaRound(m, 'A');
  const arma = m.entidades[0].armas!.primaria!;
  for (let i = 0; i < 300; i++) passo(m, 0.05, new Map([[0, cmd({ atirar: true, yaw: m.entidades[0].yaw })]]), { congelado: false });
  expect(arma.reserva).toBe(90);
  expect(vivosPorTime(m)).toStrictEqual({ azul: { n: 1, hp: 100 }, laranja: { n: 0, hp: 0 } });
});
