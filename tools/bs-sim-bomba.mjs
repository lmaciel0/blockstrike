// uso: REPO=<repo> node tools/bs-sim-bomba.mjs [n] — simula rounds com C4 só com bots (jogador parado) e resume os desfechos.
import { mod } from '../tests/_repo.mjs';
const { criarMundo, posicionarParaRound, passo, vivosPorTime } = await mod('js/games/blockstrike/mundo.js');
const { criarBomba } = await mod('js/games/blockstrike/bomba.js');
const { pensar, criarCerebro } = await mod('js/games/blockstrike/bots.js');
const { criarGrafo } = await mod('js/games/blockstrike/navegacao.js');
const { criarPartida, tickPartida } = await mod('js/games/blockstrike/rounds.js');
const { MAPA } = await mod('js/games/blockstrike/mapa.js');
const { criarRng } = await mod('js/games/blockstrike/rng.js');
const N = Number(process.argv[2] ?? 12);
const dificuldade = process.argv[3] ?? 'medio';
const res = { 'bomba-explodiu': 0, 'bomba-desarmada': 0, 'eliminacao-T': 0, 'eliminacao-CT': 0, tempo: 0, outro: 0 };
let plantou = 0;
let somaDur = 0;
for (let seed = 1; seed <= N; seed++) {
  const mundo = criarMundo({ mapa: MAPA, primariaJogador: 'rifle', dificuldade, rng: criarRng(seed) });
  mundo.entidades[0].bot = true; // simulação: o jogador também é um bot
  posicionarParaRound(mundo, 'A');
  const rngBots = criarRng(seed * 77);
  const grafo = criarGrafo(MAPA.waypoints, MAPA.arestas);
  const p = criarPartida();
  mundo.bomba = criarBomba(mundo, p.terroristas);
  for (const e of mundo.entidades) if (e.bot) e.cerebro = criarCerebro(e, grafo, rngBots, MAPA.caixas, mundo);
  p.fase = 'jogo'; p.tempo = 115;
  let ev = [];
  let t = 0;
  let minD = Infinity; let ctVivosNaPlanta = null; let tPlanta = null;
  while (p.fase === 'jogo' && t < 200) {
    const cmds = new Map();
    for (const e of mundo.entidades) if (e.bot && e.vivo) cmds.set(e.id, pensar(e, mundo, grafo, mundo.dificuldade, 0.05, rngBots));
    passo(mundo, 0.05, cmds);
    ev = tickPartida(p, 0.05, vivosPorTime(mundo), mundo.bomba);
    t += 0.05;
    const b = mundo.bomba;
    if (b.plantada) {
      if (tPlanta === null) { tPlanta = t; ctVivosNaPlanta = mundo.entidades.filter((e) => e.vivo && e.time !== p.terroristas).length; }
      for (const e of mundo.entidades) if (e.vivo && e.time !== p.terroristas) minD = Math.min(minD, Math.hypot(e.pos.x - b.pos.x, e.pos.z - b.pos.z));
    }
  }
  if (process.argv[4]) console.log(`seed ${seed}: motivo=${p.motivo} plantaEm=${tPlanta?.toFixed(0)} site=${mundo.bomba.site} ctVivosNaPlanta=${ctVivosNaPlanta} menorDistCT=${minD.toFixed(1)} fim=${t.toFixed(0)}s`);
  if (mundo.bomba.plantada) plantou++;
  somaDur += t;
  const k = p.motivo === 'eliminacao' ? (p.vencedorRound === p.terroristas ? 'eliminacao-T' : 'eliminacao-CT') : p.motivo;
  res[k in res ? k : 'outro']++;
}
console.log(`rounds=${N} dif=${dificuldade} plantou=${plantou} duracaoMedia=${(somaDur / N).toFixed(1)}s`, res);
