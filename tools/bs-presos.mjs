// uso: REPO=<repo> node tools/bs-presos.mjs [seed] [maxRounds] — partida só de bots (laço de bs-sim-partida.mjs) que
// registra, a cada passo fora do freeze, estado/posição/velocidade de cada bot vivo e imprime os episódios
// de bot preso: > 3 s em rota/cobertura/recuo/procura querendo andar com velHoriz < 0.5.
// Também lista os vaivéns que o critério acima não pega (o bot anda, mas não sai do lugar):
// recuo repetido no mesmo round e troca de objetivo da C4 (chaveBomba) em loop.
import { mod } from '../tests/_repo.mjs';
const { criarMundo, posicionarParaRound, passo, vivosPorTime } = await mod('packages/sim/src/mundo.js');
const { criarBomba } = await mod('packages/sim/src/bomba.js');
const { pensar, criarCerebro } = await mod('packages/sim/src/bots.js');
const { criarGrafo } = await mod('packages/sim/src/navegacao.js');
const { criarPartida, tickPartida } = await mod('packages/sim/src/rounds.js');
const E = await mod('packages/sim/src/economia.js');
const { MAPA } = await mod('packages/sim/src/mapa.js');
const { criarRng } = await mod('packages/sim/src/rng.js');
const { ECONOMIA } = await mod('packages/sim/src/config.js');

const ESTADOS_ANDANDO = ['rota', 'cobertura', 'recuo', 'procura'];
const PRESO_MIN = 3;

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

const seed = Number(process.argv[2] ?? 1);
const maxRounds = Number(process.argv[3] ?? Infinity);
const dificuldade = 'medio';
const DT = 0.05;
const mundo = criarMundo({ mapa: MAPA, primariaJogador: 'rifle', dificuldade, rng: criarRng(seed) });
mundo.entidades[0].bot = true;
E.iniciarEconomia(mundo);
const rngBots = criarRng(seed * 77);
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
const log = [];
let passos = 0;
while (p.fase !== 'fim-partida' && p.round <= maxRounds && passos < 400000) {
  const cmds = new Map();
  const jogando = p.fase !== 'freeze';
  if (jogando) for (const e of mundo.entidades) if (e.vivo) cmds.set(e.id, pensar(e, mundo, grafo, dificuldade, DT, rngBots));
  passo(mundo, DT, cmds, { congelado: p.fase === 'freeze', comBomba: p.fase === 'jogo' });
  if (jogando) {
    for (const e of mundo.entidades) {
      if (!e.vivo || !e.cerebro) continue;
      const c = e.cerebro;
      log.push({
        round: p.round, t: +mundo.tempo.toFixed(4), dt: DT, id: e.id, estado: c.estado,
        pos: { x: +e.pos.x.toFixed(2), z: +e.pos.z.toFixed(2) }, velHoriz: e.velHoriz,
        queriaAndar: c.queriaAndar, chave: c.chaveBomba, wp: c.rota[c.passoRota] ?? null,
      });
    }
  }
  const eventos = tickPartida(p, DT, vivosPorTime(mundo), mundo.bomba);
  if (eventos.includes('troca-lados')) E.resetarEconomia(mundo, p);
  for (const x of eventos) {
    if (x === 'fim-round') E.premiarRound(mundo, p, p.vencedorRound ?? null);
    if (x === 'novo-round') novoRound();
  }
  passos++;
}

const eps = episodiosPresos(log);
const zona = (pos) => (pos.x > 20 ? 'x>20' : pos.x < -20 ? 'x<-20' : 'meio');
for (const e of eps) {
  const w = e.alvoWp === null ? '-' : `${e.alvoWp}(${MAPA.waypoints[e.alvoWp].x},${MAPA.waypoints[e.alvoWp].z})`;
  console.log(`round ${e.round} bot ${e.id} ${e.estado} pos=(${e.pos.x},${e.pos.z}) wp=${w} dur=${e.dur}s`);
}
const porZona = {};
for (const e of eps) porZona[zona(e.pos)] = (porZona[zona(e.pos)] ?? 0) + 1;
console.log(`RESUMO seed=${seed} rounds=${p.round} episodios=${eps.length}`, porZona);

const vaivem = [];
const porBot = new Map();
for (const r of log) {
  const k = `${r.round}:${r.id}`;
  const v = porBot.get(k) ?? { estado: null, chave: r.chave, recuos: 0, trocas: 0 };
  if (r.estado === 'recuo' && v.estado !== 'recuo') v.recuos++;
  if (r.chave !== v.chave) v.trocas++;
  Object.assign(v, { estado: r.estado, chave: r.chave });
  porBot.set(k, v);
}
for (const [k, v] of porBot) if (v.recuos > 1 || v.trocas >= 6) vaivem.push(`${k} recuos=${v.recuos} trocasC4=${v.trocas}`);
console.log(`VAIVEM seed=${seed} (round:bot) ${vaivem.length ? vaivem.join(' ') : 'nenhum'}`);
