// Duelos controlados de um bot contra um alvo, por dificuldade.
// uso: node --import tsx tools/bs-duelo.mjs --cenario=entrada [--seeds=1..50]   (padrão: entrada)
//        [--vel=<m/s do alvo, padrão 4>]
//      node --import tsx tools/bs-duelo.mjs --cenario=parado                    (bot atira em alvo parado)
// Importável: `dueloEntrada(carregar, dificuldade, seed)` (carregar = (nome) => módulo do sim, como em resumoPartida).
import { pathToFileURL } from 'node:url';
import { mod } from '../tests/_repo.mjs';
import { lerSeeds } from './baseline.mjs';

const DIFICULDADES = ['facil', 'medio', 'dificil'];
const DT = 1 / 60;
const DURACAO_MAX = 6; // s
const DIST_ALVO = 15; // m
const VEL_ALVO = 4; // m/s, de lado
const X_INICIAL = -2; // atrás da caixa (a visada do olho do bot fica coberta até x = 0)
const LIMIAR_YAW = 1e-3; // rad por passo: acima disso a mira "começou a mexer"
const chao = { min: { x: -50, y: -1, z: -50 }, max: { x: 50, y: 0, z: 50 }, cor: 0x888888 };
// Caixa a 8-9 m do bot, de x = -4 a 0 e 3 m de altura: cobre o alvo em x < 0 a 15 m.
const caixa = { min: { x: -4, y: 0, z: -9 }, max: { x: 0, y: 3, z: -8 }, cor: 0x444444 };

/**
 * Duelo de entrada: o alvo anda de lado a 4 m/s, a 15 m, saindo de trás de uma caixa e cruzando o cone do bot.
 * Os tempos contam em segundos desde o primeiro passo em que o bot vê o alvo (a visão é a do próprio sim: o
 * cérebro grava uma amostra de percepção do alvo no passo em que o `enxergar` o devolve).
 * Antes de ver o alvo o bot é mantido parado na origem (a rota do round o faria andar); depois anda livre.
 * `inicioMira`: primeiro passo, depois de ver, com |Δyaw| > 1e-3. `primeiroTiro`/`primeiroAcerto`: eventos do bot.
 * `velAlvo` (m/s, padrão 4) existe só para diagnóstico/calibração; o cenário oficial é o padrão.
 * Cada campo é null se não acontece em 6 s de cenário (ou se o alvo nunca é visto).
 */
export async function dueloEntrada(carregar, dificuldade, seed, { velAlvo = VEL_ALVO } = {}) {
  const { MAPA } = await carregar('mapa');
  const { criarMundo, posicionarParaRound, passo } = await carregar('mundo');
  const { pensar, criarCerebro } = await carregar('bots');
  const { criarGrafo } = await carregar('navegacao');
  const { criarRng } = await carregar('rng');
  const grafo = criarGrafo(MAPA.waypoints, MAPA.arestas);
  const mundo = criarMundo({ mapa: { ...MAPA, caixas: [chao, caixa] }, primariaJogador: 'rifle', dificuldade, rng: criarRng(seed) });
  posicionarParaRound(mundo, 'A');
  for (const e of mundo.entidades) e.vivo = false;
  const bot = mundo.entidades[1];
  const alvo = mundo.entidades[5];
  bot.vivo = alvo.vivo = true;
  bot.pos = { x: 0, y: 0, z: 0 };
  bot.yaw = 0;
  bot.armas.primaria = { ...bot.armas.primaria, tipo: 'rifle', municao: 9999, reserva: 9999, recuoAcum: 0 };
  bot.primariaEscolhida = 'rifle';
  const rng = criarRng(seed + 99);
  bot.cerebro = criarCerebro(bot, grafo, rng, mundo.mapa.caixas, mundo);

  const r = { inicioMira: null, primeiroTiro: null, primeiroAcerto: null };
  let tVisto = null;
  let yawAnterior = bot.yaw;
  for (let i = 0; i < DURACAO_MAX / DT; i++) {
    alvo.hp = 100;
    alvo.pos = { x: X_INICIAL + velAlvo * i * DT, y: 0, z: -DIST_ALVO };
    const agora = mundo.tempo;
    const cmd = pensar(bot, mundo, grafo, dificuldade, DT, rng);
    if (tVisto === null && bot.cerebro.percepcao.some((a) => a.id === alvo.id && a.t === agora)) tVisto = agora;
    const eventos = passo(mundo, DT, new Map([[bot.id, cmd]]));
    if (tVisto === null) {
      bot.pos = { x: 0, y: 0, z: 0 };
      bot.yaw = 0;
      yawAnterior = 0;
      continue;
    }
    const t = agora - tVisto;
    const dYaw = Math.atan2(Math.sin(bot.yaw - yawAnterior), Math.cos(bot.yaw - yawAnterior));
    yawAnterior = bot.yaw;
    if (r.inicioMira === null && Math.abs(dYaw) > LIMIAR_YAW) r.inicioMira = t;
    for (const ev of eventos) {
      if (ev.tipo === 'tiro' && ev.atirador === bot.id && r.primeiroTiro === null) r.primeiroTiro = t;
      if (ev.tipo === 'acerto' && ev.atirador === bot.id && ev.alvo === alvo.id && r.primeiroAcerto === null) r.primeiroAcerto = t;
    }
    if (r.primeiroAcerto !== null) break; // tudo medido
  }
  return r;
}

function minimo(xs) {
  return xs.length ? Math.min(...xs) : null;
}
function mediana(xs) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
const fmt = (x) => (x === null ? '   -' : x.toFixed(2).padStart(4));

/** Agrega duelos de entrada por dificuldade: mínimo e mediana de cada tempo (só dos duelos em que ocorreu) e % sem acerto. */
export function resumirEntrada(porDificuldade) {
  const linhas = [];
  for (const [nome, duelos] of Object.entries(porDificuldade)) {
    const col = (k) => duelos.map((d) => d[k]).filter((x) => x !== null);
    const sem = duelos.filter((d) => d.primeiroAcerto === null).length;
    linhas.push({
      dificuldade: nome,
      inicioMira: { min: minimo(col('inicioMira')), med: mediana(col('inicioMira')) },
      primeiroTiro: { min: minimo(col('primeiroTiro')), med: mediana(col('primeiroTiro')) },
      primeiroAcerto: { min: minimo(col('primeiroAcerto')), med: mediana(col('primeiroAcerto')) },
      semAcertoPct: (100 * sem) / duelos.length,
    });
  }
  return linhas;
}

function imprimirEntrada(linhas, seeds, vel) {
  console.log(`duelo de entrada (alvo a ${DIST_ALVO} m, ${vel} m/s de lado, seeds ${seeds[0]}..${seeds.at(-1)}, s desde que viu)`);
  console.log('dificuldade  mira(min/med)  tiro(min/med)  acerto(min/med)  semAcerto');
  for (const l of linhas) {
    const par = (c) => `${fmt(c.min)} /${fmt(c.med)}`;
    console.log(`${l.dificuldade.padEnd(11)}  ${par(l.inicioMira)}  ${par(l.primeiroTiro)}  ${par(l.primeiroAcerto)}   ${l.semAcertoPct.toFixed(0)}%`);
  }
}

// Cenário antigo: bot atira em alvo parado; partes atingidas por dificuldade, chance de cabeça e distância.
async function cenarioParado(carregar) {
  const { MAPA } = await carregar('mapa');
  const { criarMundo, posicionarParaRound, passo } = await carregar('mundo');
  const { pensar, criarCerebro } = await carregar('bots');
  const { criarGrafo } = await carregar('navegacao');
  const { criarRng } = await carregar('rng');
  const { DIFICULDADE } = await carregar('config');
  const grafo = criarGrafo(MAPA.waypoints, MAPA.arestas);
  const DT_PARADO = 1 / 30;
  function duelo(dif, tipo, dist, seed) {
    const mundo = criarMundo({ mapa: { ...MAPA, caixas: [chao] }, primariaJogador: 'rifle', dificuldade: 'medio', rng: criarRng(seed) });
    posicionarParaRound(mundo, 'A');
    for (const e of mundo.entidades) e.vivo = false;
    const b = mundo.entidades[1]; const alvo = mundo.entidades[5];
    b.vivo = alvo.vivo = true;
    b.pos = { x: 0, y: 0, z: 0 }; b.yaw = 0;
    alvo.pos = { x: 0, y: 0, z: -dist };
    b.armas.primaria = { ...b.armas.primaria, tipo, municao: 9999, reserva: 9999, recuoAcum: 0 };
    b.primariaEscolhida = tipo;
    const rng = criarRng(seed + 99);
    b.cerebro = criarCerebro(b, grafo, rng, [chao]);
    const cont = { cabeca: 0, tronco: 0, pernas: 0 };
    for (let i = 0; i < 20 / DT_PARADO; i++) {
      alvo.hp = 100; alvo.vivo = true; if (b.armas.primaria.municao < 100) b.armas.primaria.municao = 9999;
      const cmd = pensar(b, mundo, grafo, dif, DT_PARADO, rng);
      for (const ev of passo(mundo, DT_PARADO, new Map([[1, cmd]]))) if (ev.tipo === 'acerto') cont[ev.parte]++;
    }
    return cont;
  }
  for (const nome of DIFICULDADES) {
    for (const chance of [0, null]) {
      const dif = { ...DIFICULDADE[nome], ...(chance === null ? {} : { chanceCabeca: chance }) };
      const linha = [];
      for (const [tipo, dist] of [['rifle', 8], ['rifle', 20], ['smg', 12]]) {
        const tot = { cabeca: 0, tronco: 0, pernas: 0 };
        for (let s = 1; s <= 4; s++) { const c = duelo(dif, tipo, dist, s); for (const k in tot) tot[k] += c[k]; }
        const n = tot.cabeca + tot.tronco + tot.pernas;
        linha.push(`${tipo}@${dist}: n=${n} cab=${(100 * tot.cabeca / n).toFixed(0)}% pern=${(100 * tot.pernas / n).toFixed(0)}%`);
      }
      console.log(`${nome.padEnd(8)} chance=${chance ?? DIFICULDADE[nome].chanceCabeca} | ${linha.join(' | ')}`);
    }
  }
}

async function principal(argv) {
  const arg = (nome, padrao) => argv.find((a) => a.startsWith(`--${nome}=`))?.slice(nome.length + 3) ?? padrao;
  const cenario = arg('cenario', 'entrada');
  const carregar = (nome) => mod(`packages/sim/src/${nome}.js`);
  if (cenario === 'parado') return cenarioParado(carregar);
  if (cenario !== 'entrada') throw new Error(`--cenario inválido: ${cenario} (entrada|parado)`);
  const seeds = lerSeeds(arg('seeds', '1..50'));
  const velAlvo = Number(arg('vel', VEL_ALVO));
  const porDificuldade = {};
  for (const nome of DIFICULDADES) {
    porDificuldade[nome] = [];
    for (const seed of seeds) porDificuldade[nome].push(await dueloEntrada(carregar, nome, seed, { velAlvo }));
  }
  imprimirEntrada(resumirEntrada(porDificuldade), seeds, velAlvo);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  principal(process.argv.slice(2)).catch((e) => { console.error(e); process.exit(1); });
}
