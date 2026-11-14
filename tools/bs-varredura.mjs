// Varredura de métricas por dificuldade: roda partidas completas só de bots (as mesmas de baseline.mjs, modo `relogio`)
// e agrega por dificuldade as métricas de tools/metricas.mjs. Só observa; não muda o sim.
// uso: node --import tsx tools/bs-varredura.mjs [--seeds=1..30] [--dificuldades=facil,medio,dificil] [--rapido]
//        [--out=arquivo.json] [--verificar]
// --rapido = seeds 1..8. --verificar sai com código 1 se alguma meta de METAS estiver fora.
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { mod } from '../tests/_repo.mjs';
import { resumoPartida, lerSeeds } from './baseline.mjs';

const DIFICULDADES = ['facil', 'medio', 'dificil'];
const SEEDS_RAPIDO = '1..8';
const SEEDS_PADRAO = '1..30';

// Metas do spec (Global Constraints). `primeiroAcerto` é o alvo da mediana em segundos, com tolerância relativa
// `tolerancia`; as demais são faixas [min, max] ou tetos. Task 10 lê daqui.
export const METAS = {
  tolerancia: 0.25,
  vitoriaT: [0.45, 0.55],
  armaTopoMax: 0.35,
  facil: { headshot: [0.15, 0.25], primeiroAcerto: 1.2 },
  medio: { headshot: [0.30, 0.40], primeiroAcerto: 0.8 },
  dificil: { headshot: [0.40, 0.50], primeiroAcerto: 0.5 },
};

/** Mediana; `null` para lista vazia. */
export function mediana(xs) {
  if (xs.length === 0) return null;
  const o = [...xs].sort((a, b) => a - b);
  const m = o.length >> 1;
  return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2;
}

const soma = (xs) => xs.reduce((a, b) => a + b, 0);
const razao = (a, b) => (b > 0 ? a / b : 0);

/**
 * Agrega partidas (resumo + `metricas`) por dificuldade.
 * Razões são acumuladas sobre todas as partidas (não média de razões); a mediana do primeiro acerto é sobre todos os
 * encontros juntos.
 */
export function agregar(partidas) {
  const porDif = {};
  for (const p of partidas) (porDif[p.dificuldade] ??= []).push(p);
  const tabela = {};
  for (const [dif, ps] of Object.entries(porDif)) {
    const ms = ps.map((p) => p.metricas);
    const kills = {};
    for (const m of ms) for (const [arma, n] of Object.entries(m.killsPorArma)) kills[arma] = (kills[arma] ?? 0) + n;
    const totalKills = soma(Object.values(kills));
    const killsPorArma = Object.fromEntries(Object.entries(kills).map(([a, n]) => [a, razao(n, totalKills)]));
    const [arma, fracao] = Object.entries(killsPorArma).sort((a, b) => b[1] - a[1])[0] ?? [null, 0];
    tabela[dif] = {
      partidas: ps.length,
      vitoriaT: razao(soma(ps.map((p) => p.vitoriasT)), soma(ps.map((p) => p.vitoriasT + p.vitoriasCT))),
      headshot: razao(soma(ps.map((p) => p.cabecas)), soma(ps.map((p) => p.mortes))),
      primeiroAcertoMediana: mediana(ms.flatMap((m) => m.primeirosAcertos)),
      semAcerto: razao(soma(ms.map((m) => m.encontrosSemAcerto)), soma(ms.map((m) => m.encontros))),
      desencalhesPorPartida: razao(soma(ms.map((m) => m.desencalhes)), ps.length),
      botsMudos: soma(ms.map((m) => m.botsMudos)),
      killsPorArma,
      armaTopo: { arma, fracao },
    };
  }
  return tabela;
}

const pct = (x) => `${(x * 100).toFixed(1)}%`;
const faixa = ([a, b]) => `${pct(a)}..${pct(b)}`;

/** Lista (texto) as metas fora da tabela; vazia se tudo dentro. */
export function verificar(tabela) {
  const falhas = [];
  for (const [dif, l] of Object.entries(tabela)) {
    const meta = METAS[dif];
    if (meta && (l.headshot < meta.headshot[0] || l.headshot > meta.headshot[1])) {
      falhas.push(`${dif}: headshot ${pct(l.headshot)} fora de ${faixa(meta.headshot)}`);
    }
    if (meta) {
      const alvo = meta.primeiroAcerto;
      const [min, max] = [alvo * (1 - METAS.tolerancia), alvo * (1 + METAS.tolerancia)];
      const m = l.primeiroAcertoMediana;
      if (m === null || m < min || m > max) {
        falhas.push(`${dif}: primeiro acerto ${m === null ? 'sem dados' : `${m.toFixed(2)} s`} fora de ${min.toFixed(2)}..${max.toFixed(2)} s (alvo ${alvo} s ±25%)`);
      }
    }
    if (l.vitoriaT < METAS.vitoriaT[0] || l.vitoriaT > METAS.vitoriaT[1]) {
      falhas.push(`${dif}: vitória T ${pct(l.vitoriaT)} fora de ${faixa(METAS.vitoriaT)}`);
    }
    if (l.armaTopo.fracao > METAS.armaTopoMax) {
      falhas.push(`${dif}: arma topo ${l.armaTopo.arma} ${pct(l.armaTopo.fracao)} acima de ${pct(METAS.armaTopoMax)}`);
    }
    if (l.botsMudos > 0) falhas.push(`${dif}: bots mudos ${l.botsMudos} (esperado 0)`);
  }
  return falhas;
}

/** Uma linha de texto por dificuldade (percentuais com 1 casa). */
export function formatarTabela(tabela) {
  const cab = ['dificuldade', 'partidas', 'vitoriaT', 'headshot', '1ºacerto(s)', 'semAcerto', 'desenc/partida', 'mudos', 'armaTopo', 'killsPorArma'];
  const linhas = Object.entries(tabela).map(([dif, l]) => [
    dif, String(l.partidas), pct(l.vitoriaT), pct(l.headshot),
    l.primeiroAcertoMediana === null ? '-' : l.primeiroAcertoMediana.toFixed(2), pct(l.semAcerto),
    l.desencalhesPorPartida.toFixed(2), String(l.botsMudos),
    l.armaTopo.arma === null ? '-' : `${l.armaTopo.arma} ${pct(l.armaTopo.fracao)}`,
    Object.entries(l.killsPorArma).sort((a, b) => b[1] - a[1]).map(([a, f]) => `${a} ${pct(f)}`).join(', '),
  ]);
  const larg = cab.map((c, i) => Math.max(c.length, ...linhas.map((r) => r[i].length)));
  const fmt = (r) => r.map((c, i) => c.padEnd(larg[i])).join('  ').trimEnd();
  return [fmt(cab), ...linhas.map(fmt)].join('\n');
}

async function principal(argv) {
  const arg = (nome, padrao) => argv.find((a) => a.startsWith(`--${nome}=`))?.slice(nome.length + 3) ?? padrao;
  const rapido = argv.includes('--rapido');
  const seeds = lerSeeds(arg('seeds', rapido ? SEEDS_RAPIDO : SEEDS_PADRAO));
  const dificuldades = arg('dificuldades', DIFICULDADES.join(',')).split(',');
  for (const d of dificuldades) if (!DIFICULDADES.includes(d)) throw new Error(`dificuldade inválida: ${d}`);
  const saida = arg('out');
  const carregar = (nome) => mod(`packages/sim/src/${nome}.js`);
  const partidas = [];
  for (const dificuldade of dificuldades) {
    for (const seed of seeds) {
      const r = await resumoPartida(carregar, dificuldade, seed, { modo: 'relogio', seed }, { metricas: true });
      partidas.push({ dificuldade, seed, ...r });
      console.error(`${dificuldade} seed ${seed} ok (${partidas.length}/${dificuldades.length * seeds.length})`);
    }
  }
  const tabela = agregar(partidas);
  console.log(formatarTabela(tabela));
  if (saida) {
    writeFileSync(saida, `${JSON.stringify({ seeds, dificuldades, dt: { modo: 'relogio' }, tabela, partidas }, null, 2)}\n`);
    console.error(`gravado em ${saida}`);
  }
  if (argv.includes('--verificar')) {
    const falhas = verificar(tabela);
    if (falhas.length > 0) {
      console.error(`metas fora (${falhas.length}):\n${falhas.map((f) => `  - ${f}`).join('\n')}`);
      process.exitCode = 1;
    } else console.error('todas as metas dentro');
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await principal(process.argv.slice(2));
