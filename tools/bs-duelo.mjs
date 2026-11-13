// uso: [REPO=<repo>] node tools/bs-duelo.mjs ; bot atira em alvo parado: partes atingidas por dificuldade/chance/pitch
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const repo = process.env.REPO ?? process.cwd();
const m = (p) => import(pathToFileURL(path.join(repo, 'packages/sim/src', p)).href);
const { MAPA } = await m('mapa.js');
const { criarMundo, posicionarParaRound, passo } = await m('mundo.js');
const { pensar, criarCerebro } = await m('bots.js');
const { criarGrafo } = await m('navegacao.js');
const { criarRng } = await m('rng.js');
const { DIFICULDADE } = await m('config.js');
const chao = { min: { x: -50, y: -1, z: -50 }, max: { x: 50, y: 0, z: 50 }, cor: 0x888888 };
const grafo = criarGrafo(MAPA.waypoints, MAPA.arestas);
const DT = 1 / 30;
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
  for (let i = 0; i < 20 / DT; i++) {
    alvo.hp = 100; alvo.vivo = true; if (b.armas.primaria.municao < 100) b.armas.primaria.municao = 9999;
    const cmd = pensar(b, mundo, grafo, dif, DT, rng);
    for (const ev of passo(mundo, DT, new Map([[1, cmd]]))) if (ev.tipo === 'acerto') cont[ev.parte]++;
  }
  return cont;
}
for (const nome of ['facil', 'medio', 'dificil']) {
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
