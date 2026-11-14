// Baseline determinístico do sim: roda partidas completas só de bots (laço de bs-sim-partida.mjs, com economia,
// compra, C4 e granadas) e resume cada uma. Tudo deriva de seeds — sem Math.random nem Date.now no caminho.
// uso: npx tsx tools/baseline.mjs --out=<arquivo> [--seeds=1..5] [--dt=fixo|variavel|relogio]
// --dt=relogio: os mesmos dt reais sorteados do modo `variavel` alimentam o relógio de passo fixo
// (`criarRelogio`), e a simulação roda `DT_SIM` por passo devolvido. É o laço do cliente.
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { mod } from '../tests/_repo.mjs';
import { criarColetor } from './metricas.mjs';

const DT_FIXO = 1 / 60;
const DT_MIN = 1 / 144;
const DT_MAX = 0.05; // teto atual de index.js (DT_MAX)
const DT_REAL_MAX = 0.25; // teto do dt real entregue ao relógio (o mesmo do laço do cliente)
const LIMITE_PASSOS = 2_000_000;
const DIFICULDADES = ['facil', 'medio', 'dificil'];

// Definição de bot preso de tools/bs-presos.mjs: > 3 s contínuos em rota/cobertura/recuo/procura
// querendo andar com velHoriz < 0.5. Continuidade medida por índice de passo (vale para dt variável).
const ESTADOS_ANDANDO = ['rota', 'cobertura', 'recuo', 'procura'];
const PRESO_MIN = 3;

function contarPresos(log) {
  const abertos = new Map();
  let total = 0;
  const fechar = (k) => {
    const a = abertos.get(k);
    abertos.delete(k);
    if (a && a.dur > PRESO_MIN) total++;
  };
  for (const r of log) {
    const k = `${r.round}:${r.id}`;
    const preso = ESTADOS_ANDANDO.includes(r.estado) && r.queriaAndar && r.velHoriz < 0.5;
    if (!preso) { fechar(k); continue; }
    const a = abertos.get(k);
    if (a && r.n === a.ultimoN + 1) {
      a.dur += r.dt;
      a.ultimoN = r.n;
    } else {
      fechar(k);
      abertos.set(k, { dur: r.dt, ultimoN: r.n });
    }
  }
  for (const k of [...abertos.keys()]) fechar(k);
  return total;
}

// FNV-1a de 32 bits sobre texto.
function fnv1a(texto) {
  let h = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/**
 * Roda uma partida completa e devolve o resumo.
 * @param carregar (nome) => módulo do sim (mundo, bots, rounds, navegacao, mapa, config, rng, fisica, economia, bomba)
 * @param opcoesDt { modo: 'fixo', dt } | { modo: 'variavel', seed } (variável: dt sorteado em [1/144, 0.05])
 *   | { modo: 'relogio', seed } (os mesmos dt do `variavel` passam pelo relógio; a simulação anda em DT_SIM)
 * @param opcoes { metricas: true } acrescenta `metricas` (tools/metricas.mjs) ao resumo; sem ela o resumo não muda
 */
export async function resumoPartida(carregar, dificuldade, seed, opcoesDt, { metricas = false } = {}) {
  const { criarMundo, posicionarParaRound, passo, vivosPorTime } = await carregar('mundo');
  const { criarBomba } = await carregar('bomba');
  const { pensar, criarCerebro } = await carregar('bots');
  const { criarGrafo } = await carregar('navegacao');
  const { criarPartida, tickPartida } = await carregar('rounds');
  const E = await carregar('economia');
  const { MAPA } = await carregar('mapa');
  const { criarRng } = await carregar('rng');
  const { ECONOMIA, TICK_HZ, DT_SIM, MAX_PASSOS_POR_QUADRO } = await carregar('config');
  const { criarRelogio } = await carregar('relogio');

  const mundo = criarMundo({ mapa: MAPA, primariaJogador: 'rifle', dificuldade, rng: criarRng(seed) });
  mundo.entidades[0].bot = true;
  E.iniciarEconomia(mundo);
  const rngBots = criarRng(seed * 77);
  // `relogio` sorteia os dt reais com a mesma seed do `variavel`: a sequência é idêntica nos dois modos.
  const rngDt = opcoesDt.modo === 'variavel' || opcoesDt.modo === 'relogio' ? criarRng(opcoesDt.seed) : null;
  const relogio = opcoesDt.modo === 'relogio' ? criarRelogio(TICK_HZ, MAX_PASSOS_POR_QUADRO) : null;
  const proximoDt = () => (rngDt ? DT_MIN + rngDt() * (DT_MAX - DT_MIN) : opcoesDt.dt);
  const grafo = criarGrafo(MAPA.waypoints, MAPA.arestas);
  const p = criarPartida({ freeze: ECONOMIA.freezeCompra });
  const papel = (e) => (e.time === p.terroristas ? 'T' : 'CT');
  function novoRound() {
    for (const e of mundo.entidades) if (e.bot) E.botComprar(e, papel(e));
    posicionarParaRound(mundo, p.round <= 12 ? 'A' : 'B');
    mundo.bomba = criarBomba(mundo, p.terroristas);
    for (const e of mundo.entidades) e.cerebro = criarCerebro(e, grafo, rngBots, MAPA.caixas, mundo);
  }
  novoRound();

  const coletor = metricas ? criarColetor() : null;
  const log = [];
  const sequencia = [];
  let mortes = 0;
  let cabecas = 0;
  // Vitórias por papel (não por time: azul e laranja trocam de lado no intervalo).
  let vitoriasT = 0;
  let vitoriasCT = 0;
  let n = 0;
  // Um passo da simulação com o `dt` dado: bots pensam, o mundo anda e as regras da partida contam o tempo.
  function umPasso(dt) {
    if (n >= LIMITE_PASSOS) throw new Error(`partida não terminou em ${LIMITE_PASSOS} passos (seed=${seed} ${dificuldade})`);
    const jogando = p.fase !== 'freeze';
    const cmds = new Map();
    if (jogando) for (const e of mundo.entidades) if (e.vivo) cmds.set(e.id, pensar(e, mundo, grafo, dificuldade, dt, rngBots));
    const ev = passo(mundo, dt, cmds, { congelado: p.fase === 'freeze', comBomba: p.fase === 'jogo' });
    for (const x of ev) {
      if (x.tipo !== 'morte') continue;
      mortes++;
      if (x.cabeca) cabecas++;
      sequencia.push(`${n},${x.vitima},${x.assassino},${x.arma},${x.cabeca ? 1 : 0}`);
    }
    if (jogando) {
      for (const e of mundo.entidades) {
        if (!e.vivo || !e.cerebro) continue;
        const c = e.cerebro;
        log.push({ n, round: p.round, dt, id: e.id, estado: c.estado, queriaAndar: c.queriaAndar, velHoriz: e.velHoriz });
      }
    }
    if (coletor && jogando) coletor.passo({ n, t: mundo.tempo, round: p.round, entidades: mundo.entidades, eventos: ev });
    const eventos = tickPartida(p, dt, vivosPorTime(mundo), mundo.bomba);
    if (eventos.includes('troca-lados')) E.resetarEconomia(mundo, p);
    for (const x of eventos) {
      if (x === 'fim-round') {
        // `p.terroristas` ainda é o do round que acabou (só muda no `novo-round`). Round sem vencedor não conta.
        if (p.vencedorRound) {
          if (p.vencedorRound === p.terroristas) vitoriasT++;
          else vitoriasCT++;
        }
        E.premiarRound(mundo, p, p.vencedorRound ?? null);
      }
      if (x === 'novo-round') {
        coletor?.fimRound(mundo.entidades); // antes de recriar os cérebros
        novoRound();
      }
    }
    n++;
  }
  while (p.fase !== 'fim-partida') {
    const dtReal = proximoDt();
    if (!relogio) {
      umPasso(dtReal);
      continue;
    }
    // Laço do cliente: o relógio diz quantos passos fixos cabem no tempo real do quadro.
    const passos = relogio.avancar(Math.min(dtReal, DT_REAL_MAX));
    for (let i = 0; i < passos && p.fase !== 'fim-partida'; i++) umPasso(DT_SIM);
  }

  coletor?.fimRound(mundo.entidades);
  const resumo = {
    rounds: p.round,
    placar: { azul: p.placar.azul, laranja: p.placar.laranja },
    vitoriasT,
    vitoriasCT,
    mortes,
    cabecas,
    presos: contarPresos(log),
    dinheiroFinal: mundo.entidades.map((e) => e.dinheiro),
    hash: fnv1a(sequencia.join(';')),
  };
  return coletor ? { ...resumo, metricas: coletor.resultado() } : resumo;
}

// "1..5" ou "1,3,5" -> [numeros]
export function lerSeeds(texto) {
  const faixa = /^(\d+)\.\.(\d+)$/.exec(texto);
  if (faixa) {
    const [a, b] = [Number(faixa[1]), Number(faixa[2])];
    return Array.from({ length: b - a + 1 }, (_, i) => a + i);
  }
  return texto.split(',').map(Number);
}

async function principal(argv) {
  const arg = (nome, padrao) => argv.find((a) => a.startsWith(`--${nome}=`))?.slice(nome.length + 3) ?? padrao;
  const saida = arg('out');
  if (!saida) throw new Error('uso: baseline.mjs --out=<arquivo> [--seeds=1..5] [--dt=fixo|variavel|relogio]');
  const seeds = lerSeeds(arg('seeds', '1..5'));
  const modo = arg('dt', 'fixo');
  if (modo !== 'fixo' && modo !== 'variavel' && modo !== 'relogio') throw new Error(`--dt inválido: ${modo}`);
  const carregar = (nome) => mod(`packages/sim/src/${nome}.js`);
  const partidas = [];
  for (const dificuldade of DIFICULDADES) {
    for (const seed of seeds) {
      const opcoesDt = modo === 'fixo' ? { modo, dt: DT_FIXO } : { modo, seed };
      partidas.push({ dificuldade, seed, ...(await resumoPartida(carregar, dificuldade, seed, opcoesDt)) });
    }
  }
  let dt = modo === 'fixo' ? { modo, dt: DT_FIXO } : { modo, min: DT_MIN, max: DT_MAX };
  if (modo === 'relogio') {
    const { TICK_HZ, MAX_PASSOS_POR_QUADRO } = await carregar('config');
    dt = { ...dt, hz: TICK_HZ, maxPassos: MAX_PASSOS_POR_QUADRO, dtRealMax: DT_REAL_MAX };
  }
  writeFileSync(saida, `${JSON.stringify({ dt, partidas }, null, 2)}\n`);
  console.log(`${partidas.length} partidas gravadas em ${saida}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await principal(process.argv.slice(2));
