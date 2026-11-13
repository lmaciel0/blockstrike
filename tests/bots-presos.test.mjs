import test from 'node:test';
import assert from 'node:assert/strict';
import { mod } from './_repo.mjs';

const { criarMundo, posicionarParaRound, passo, vivosPorTime } = await mod('js/games/blockstrike/mundo.js');
const { criarBomba } = await mod('js/games/blockstrike/bomba.js');
const { pensar, criarCerebro } = await mod('js/games/blockstrike/bots.js');
const { criarGrafo } = await mod('js/games/blockstrike/navegacao.js');
const { criarPartida, tickPartida } = await mod('js/games/blockstrike/rounds.js');
const E = await mod('js/games/blockstrike/economia.js');
const { MAPA } = await mod('js/games/blockstrike/mapa.js');
const { criarRng } = await mod('js/games/blockstrike/rng.js');
const { ECONOMIA } = await mod('js/games/blockstrike/config.js');

const DT = 0.05;
const ESTADOS_ANDANDO = ['rota', 'cobertura', 'recuo', 'procura'];
const PRESO_MIN = 3;
const grafo = criarGrafo(MAPA.waypoints, MAPA.arestas);

// Intervalos contínuos (por round e bot) com estado andando, queriaAndar e velHoriz < 0.5, de mais de 3 s.
function episodiosPresos(log) {
  const abertos = new Map();
  const saida = [];
  const fechar = (k) => {
    const a = abertos.get(k);
    abertos.delete(k);
    if (a && a.dur > PRESO_MIN) saida.push({ ...a, dur: +a.dur.toFixed(2) });
  };
  for (const r of log) {
    const k = `${r.round}:${r.id}`;
    const preso = ESTADOS_ANDANDO.includes(r.estado) && r.queriaAndar && r.velHoriz < 0.5;
    if (!preso) { fechar(k); continue; }
    const a = abertos.get(k);
    if (a && Math.abs(r.t - a.ultimo - r.dt) < 1e-6) {
      a.dur += r.dt;
      a.ultimo = r.t;
    } else {
      fechar(k);
      abertos.set(k, { round: r.round, id: r.id, estado: r.estado, pos: r.pos, alvoWp: r.wp, dur: r.dt, ultimo: r.t });
    }
  }
  for (const k of [...abertos.keys()]) fechar(k);
  return saida.map(({ ultimo, ...e }) => e);
}

// Partida só de bots (laço de bs-sim-partida.mjs) pelos primeiros `rounds` rounds; registro por passo e bot vivo.
function simular(seed, rounds) {
  const mundo = criarMundo({ mapa: MAPA, primariaJogador: 'rifle', dificuldade: 'medio', rng: criarRng(seed) });
  mundo.entidades[0].bot = true;
  E.iniciarEconomia(mundo);
  const rng = criarRng(seed * 77);
  const p = criarPartida({ freeze: ECONOMIA.freezeCompra });
  const novoRound = () => {
    for (const e of mundo.entidades) E.botComprar(e, e.time === p.terroristas ? 'T' : 'CT');
    posicionarParaRound(mundo, p.round <= 12 ? 'A' : 'B');
    mundo.bomba = criarBomba(mundo, p.terroristas);
    for (const e of mundo.entidades) e.cerebro = criarCerebro(e, grafo, rng, MAPA.caixas, mundo);
  };
  novoRound();
  const log = [];
  while (p.fase !== 'fim-partida' && p.round <= rounds) {
    const cmds = new Map();
    const jogando = p.fase !== 'freeze';
    if (jogando) for (const e of mundo.entidades) if (e.vivo) cmds.set(e.id, pensar(e, mundo, grafo, 'medio', DT, rng));
    passo(mundo, DT, cmds, { congelado: !jogando, comBomba: p.fase === 'jogo' });
    if (jogando) {
      for (const e of mundo.entidades) {
        if (!e.vivo) continue;
        const c = e.cerebro;
        log.push({
          round: p.round, t: +mundo.tempo.toFixed(4), dt: DT, id: e.id, estado: c.estado,
          pos: { x: +e.pos.x.toFixed(2), z: +e.pos.z.toFixed(2) }, velHoriz: e.velHoriz,
          queriaAndar: c.queriaAndar, wp: c.rota[c.passoRota] ?? null,
        });
      }
    }
    const eventos = tickPartida(p, DT, vivosPorTime(mundo), mundo.bomba);
    for (const x of eventos) {
      if (x === 'fim-round') E.premiarRound(mundo, p, p.vencedorRound ?? null);
      if (x === 'novo-round') novoRound();
    }
  }
  return log;
}

const logs = [1, 2, 3].map((seed) => ({ seed, log: simular(seed, 4) }));

test('nenhum bot fica preso andando', () => {
  const eps = logs.flatMap(({ seed, log }) => episodiosPresos(log).map((e) => ({ seed, ...e })));
  assert.deepEqual(eps, [], `episódios:\n${eps.map((e) => JSON.stringify(e)).join('\n')}`);
});

// Antes, o bot ferido recuava toda vez que via o inimigo: ia à cobertura, esperava, voltava e recuava de novo
// (até 22 vezes no mesmo round), num vaivém que parecia bot andando contra a parede.
test('bot ferido recua uma vez só por round', () => {
  const vaivem = [];
  for (const { seed, log } of logs) {
    const anterior = new Map();
    const recuos = new Map();
    for (const r of log) {
      const k = `${r.round}:${r.id}`;
      if (r.estado === 'recuo' && anterior.get(k) !== 'recuo') recuos.set(k, (recuos.get(k) ?? 0) + 1);
      anterior.set(k, r.estado);
    }
    for (const [k, n] of recuos) if (n > 1) vaivem.push(`seed ${seed} round:bot ${k} recuou ${n}x`);
  }
  assert.deepEqual(vaivem, []);
});

// Dois T vivos e a C4 solta longe dos dois. A rota de quem vai buscar começa se afastando da C4 (o caminho
// passa pelo corredor), então pela distância em linha reta os dois trocavam a vez sem parar e ficavam num
// vaivém de poucos metros. Quem foi escolhido tem que continuar indo.
test('só um T vai buscar a C4 solta, sem trocar a vez', () => {
  const W = MAPA.waypoints;
  const mundo = criarMundo({ mapa: MAPA, primariaJogador: 'rifle', dificuldade: 'medio', rng: criarRng(3) });
  mundo.entidades[0].bot = true;
  posicionarParaRound(mundo, 'A');
  mundo.bomba = criarBomba(mundo, 'laranja');
  const ts = mundo.entidades.filter((e) => e.time === 'laranja');
  for (const e of mundo.entidades) if (e.time === 'azul' || ts.indexOf(e) >= 2) { e.vivo = false; e.hp = 0; }
  const [a, b] = ts;
  const siteA = W[MAPA.bombsites.A.waypoint];
  a.pos = { x: siteA.x, y: 0, z: siteA.z };
  b.pos = { x: W[9].x, y: 0, z: W[9].z };
  const rng = criarRng(7);
  for (const e of mundo.entidades) e.cerebro = criarCerebro(e, grafo, rng, MAPA.caixas, mundo);
  mundo.bomba.portador = null; // C4 caída perto da base B
  mundo.bomba.pos = { x: W[20].x + 0.5, y: 0, z: W[20].z + 0.5 };
  const trocas = { [a.id]: 0, [b.id]: 0 };
  const chave = { [a.id]: a.cerebro.chaveBomba, [b.id]: b.cerebro.chaveBomba };
  for (let i = 0; i < 15 / DT && mundo.bomba.portador === null; i++) {
    const cmds = new Map();
    for (const e of [a, b]) cmds.set(e.id, pensar(e, mundo, grafo, 'medio', DT, rng));
    passo(mundo, DT, cmds);
    for (const e of [a, b]) {
      if (e.cerebro.chaveBomba !== chave[e.id]) trocas[e.id] += 1;
      chave[e.id] = e.cerebro.chaveBomba;
    }
  }
  assert.ok(trocas[a.id] <= 1 && trocas[b.id] <= 1, `trocas de objetivo: ${JSON.stringify(trocas)}`);
  assert.equal([a, b].filter((e) => e.cerebro.chaveBomba === 'solta').length, 1);
});
