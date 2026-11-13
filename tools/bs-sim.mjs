// uso: [REPO=<repo>] node tools/bs-sim.mjs [--freeze-think] [--n=6] [--dif=facil,medio,dificil] [--dt=0.0333]
// Simula partidas completas (todos os 10 conduzidos por pensar) e mede timeouts e cabeçadas.
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const repo = process.env.REPO ?? process.cwd();
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));
const N = Number(args.n ?? 6);
const DT = Number(args.dt ?? 1 / 30);
const difs = (args.dif ?? 'facil,medio,dificil').split(',');
const m = (p) => import(pathToFileURL(path.join(repo, 'packages/sim/src', p)).href);
const { MAPA } = await m('mapa.js');
const { criarMundo, posicionarParaRound, passo, vivosPorTime } = await m('mundo.js');
const { criarCerebro, pensar } = await m('bots.js');
const { DIFICULDADE } = await m('config.js');
const { temVisada, olho } = await m('fisica.js');
const { criarGrafo } = await m('navegacao.js');
const { criarRng } = await m('rng.js');
const { criarPartida, ladoAzul, tickPartida } = await m('rounds.js');

export function partidaCompleta(difNome, seed, pensarNoFreeze) {
  const ch = args.chances ? Object.fromEntries(args.chances.split(',').map((v, i) => [['facil', 'medio', 'dificil'][i], Number(v)])) : null;
  const dif = ch ? { ...DIFICULDADE[difNome], chanceCabeca: ch[difNome] } : args.chance !== undefined ? { ...DIFICULDADE[difNome], chanceCabeca: Number(args.chance) } : difNome;
  const mundo = criarMundo({ mapa: MAPA, primariaJogador: 'rifle', dificuldade: dif, rng: criarRng(seed) });
  mundo.entidades[0].bot = true; // jogador também vira bot
  const grafo = criarGrafo(MAPA.waypoints, MAPA.arestas);
  const rng = criarRng(seed * 7919 + 13);
  const regras = criarPartida();
  const novo = () => {
    posicionarParaRound(mundo, ladoAzul(regras.round));
    for (const e of mundo.entidades) e.cerebro = criarCerebro(e, grafo, rng, MAPA.caixas);
  };
  novo();
  const r = { rounds: 0, tempo: 0, timeouts: 0, acertos: 0, cabecas: 0, mortes: 0, mortesCabeca: 0, rotaPosFreeze: [] };
  let t = 0;
  let ultimaFase = 'freeze';
  while (regras.fase !== 'fim-partida' && t < 7200) {
    const atira = regras.fase === 'jogo';
    const comandos = new Map();
    for (const e of mundo.entidades) {
      if (!e.vivo) continue;
      if (regras.fase === 'freeze' && !pensarNoFreeze) continue;
      const c = pensar(e, mundo, grafo, dif, DT, rng);
      comandos.set(e.id, atira ? c : { ...c, atirar: false });
    }
    const ev = passo(mundo, DT, comandos, { congelado: regras.fase === 'freeze' });
    for (const x of ev) {
      if (x.tipo === 'acerto') {
        r.acertos++; if (x.parte === 'cabeca') r.cabecas++;
        if (args.detalhe) {
          const at = mundo.entidades[x.atirador];
          const al = mundo.entidades[x.alvo];
          const kk = al.agachado ? 1.2 / 1.8 : 1;
          const trVis = temVisada(olho(at), { x: al.pos.x, y: al.pos.y + 1.1 * kk, z: al.pos.z }, MAPA.caixas);
          const k = `${at.armas[at.slot].tipo}/mira=${at.cerebro?.cabeca ? 'cab' : 'tro'}/troncoVisivel=${trVis}/vel=${at.velHoriz > 1 ? 'mov' : 'par'}/alvo=${al.velHoriz > 1 ? 'mov' : 'par'}`;
          globalThis.__det ??= {};
          const d = (globalThis.__det[k] ??= { n: 0, cab: 0 });
          d.n++; if (x.parte === 'cabeca') d.cab++;
        }
      }
      if (x.tipo === 'morte') { r.mortes++; if (x.cabeca) r.mortesCabeca++; }
    }
    t += DT;
    if (ultimaFase === 'freeze' && regras.fase === 'jogo') {
      r.rotaPosFreeze.push(mundo.entidades.filter((e) => e.cerebro).map((e) => e.cerebro.passoRota));
    }
    ultimaFase = regras.fase;
    const evs = tickPartida(regras, DT, vivosPorTime(mundo));
    for (const e of evs) {
      if (e === 'fim-round') { r.rounds++; if (regras.motivo === 'tempo') r.timeouts++; }
      if (e === 'novo-round') novo();
    }
  }
  r.tempo = t;
  return r;
}

if (process.argv[1].endsWith('bs-sim.mjs')) {
  for (const dif of difs) {
    const tot = { rounds: 0, tempo: 0, timeouts: 0, acertos: 0, cabecas: 0, mortes: 0, mortesCabeca: 0 };
    let maxRota = 0;
    for (let s = 1; s <= N; s++) {
      const r = partidaCompleta(dif, s, Boolean(args['freeze-think']));
      for (const k of Object.keys(tot)) tot[k] += r[k];
      for (const a of r.rotaPosFreeze) maxRota = Math.max(maxRota, ...a);
    }
    if (args.detalhe) for (const [k, d] of Object.entries(globalThis.__det).sort()) console.log(`  ${k.padEnd(22)} n=${d.n} cab=${(100 * d.cab / d.n).toFixed(0)}%`);
    globalThis.__det = {};
    const pct = (a, b) => (b ? (100 * a / b).toFixed(1) : '-') + '%';
    console.log(`${dif.padEnd(8)} partidas=${N} rounds=${tot.rounds} timeout=${pct(tot.timeouts, tot.rounds)} ` +
      `duracao_media=${(tot.tempo / N / 60).toFixed(1)}min headHit=${pct(tot.cabecas, tot.acertos)} ` +
      `headKill=${pct(tot.mortesCabeca, tot.mortes)} maxPassoRotaPosFreeze=${maxRota}`);
  }
}
