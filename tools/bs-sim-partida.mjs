// uso: REPO=<repo> node tools/bs-sim-partida.mjs [seed] [dificuldade] — partida completa só de bots (jogador também é bot),
// com economia, C4 e granadas. Imprime desfechos dos rounds, uso de granadas e dinheiro.
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
const seed = Number(process.argv[2] ?? 1);
const dificuldade = process.argv[3] ?? 'medio';
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
const cont = {};
const motivos = {};
const t0 = Date.now();
let passos = 0;
let ultimoRound = 1;
while (p.fase !== 'fim-partida' && passos < 400000) {
  const cmds = new Map();
  if (p.fase !== 'freeze') for (const e of mundo.entidades) if (e.vivo) cmds.set(e.id, pensar(e, mundo, grafo, dificuldade, 0.05, rngBots));
  const ev = passo(mundo, 0.05, cmds, { congelado: p.fase === 'freeze', comBomba: p.fase === 'jogo' });
  for (const x of ev) cont[x.tipo] = (cont[x.tipo] ?? 0) + 1;
  const eventos = tickPartida(p, 0.05, vivosPorTime(mundo), mundo.bomba);
  if (eventos.includes('troca-lados')) E.resetarEconomia(mundo, p);
  for (const x of eventos) {
    if (x === 'fim-round') { E.premiarRound(mundo, p, p.vencedorRound ?? null); const k = `${p.motivo}:${p.vencedorRound ?? 'empate'}`; motivos[k] = (motivos[k] ?? 0) + 1; }
    if (x === 'novo-round') novoRound();
  }
  passos++;
}
const din = mundo.entidades.map((e) => e.dinheiro);
console.log(`seed=${seed} ${dificuldade} rounds=${p.round} placar=${p.placar.azul}x${p.placar.laranja} resultado=${p.resultado} tempoReal=${((Date.now() - t0) / 1000).toFixed(1)}s`);
console.log('motivos', motivos);
console.log('eventos', Object.fromEntries(['arremesso', 'explosao-he', 'flash', 'cegueira', 'fumaca', 'plantada', 'desarmada', 'explosao', 'morte', 'bomba-solta'].map((k) => [k, cont[k] ?? 0])));
console.log('dinheiro final min/max', Math.min(...din), Math.max(...din));
console.log(`RESUMO seed=${seed} rounds=${p.round} plantadas=${cont.plantada ?? 0} explosoes=${cont.explosao ?? 0} desarmes=${cont.desarmada ?? 0} HE=${cont['explosao-he'] ?? 0} flash=${cont.flash ?? 0} smoke=${cont.fumaca ?? 0}`);
