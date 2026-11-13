// Portão estatístico: compara dois baselines (tools/baseline.mjs) pelas métricas de jogo, por dificuldade.
// Serve para mudança que altera o comportamento passo a passo (o hash muda) mas não deve mudar o jogo.
// Imprime a tabela e `DENTRO DA TOLERANCIA`, ou a lista de métricas fora; sai com código 1 se houver alguma.
// uso: node tools/baseline-compara.mjs <novo.json> <ref.json> [--min-seeds=30]
//
// Métricas (somadas nas partidas de cada dificuldade):
//   rounds    média de rounds por partida
//   vitoriasT % dos rounds com vencedor que o lado terrorista ganhou (T×CT)
//   cabecas   % das mortes que foram tiro na cabeça
//   presos    bots presos por partida (definição de tools/bs-presos.mjs)
// Tolerância: variação relativa <= 10%, ou, nas métricas que são porcentagem, diferença <= 3 pontos percentuais.
// Contagem não tem ponto percentual: `rounds` e `presos` só passam pela variação relativa.
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const TOLERANCIA_RELATIVA = 0.1;
export const TOLERANCIA_PONTOS = 3;
const SEEDS_MIN = 30;
const DIFICULDADES = ['facil', 'medio', 'dificil'];

const METRICAS = [
  { nome: 'rounds', rotulo: 'rounds por partida', porcentagem: false },
  { nome: 'vitoriasT', rotulo: 'vitórias T (%)', porcentagem: true },
  { nome: 'cabecas', rotulo: 'headshot (%)', porcentagem: true },
  { nome: 'presos', rotulo: 'presos por partida', porcentagem: false },
];

const soma = (lista, de) => lista.reduce((total, x) => total + de(x), 0);
const pct = (parte, todo) => (todo === 0 ? 0 : (100 * parte) / todo);

/** Métricas de um conjunto de partidas (as de uma dificuldade). */
export function metricas(partidas) {
  const t = soma(partidas, (x) => x.vitoriasT);
  const ct = soma(partidas, (x) => x.vitoriasCT);
  return {
    partidas: partidas.length,
    rounds: soma(partidas, (x) => x.rounds) / partidas.length,
    vitoriasT: pct(t, t + ct),
    cabecas: pct(soma(partidas, (x) => x.cabecas), soma(partidas, (x) => x.mortes)),
    presos: soma(partidas, (x) => x.presos) / partidas.length,
  };
}

/** Uma métrica está dentro se a variação relativa couber, ou (só porcentagem) se a diferença em pontos couber. */
export function dentro(novo, ref, porcentagem) {
  const diferenca = Math.abs(novo - ref);
  if (diferenca === 0) return true;
  // Referência zero não tem variação relativa: só passa se o novo também for zero (acima) ou pelos pontos.
  if (ref !== 0 && diferenca / Math.abs(ref) <= TOLERANCIA_RELATIVA) return true;
  return porcentagem && diferenca <= TOLERANCIA_PONTOS;
}

const seedsDe = (partidas) => partidas.map((x) => x.seed).sort((a, b) => a - b).join(',');

/**
 * Compara dois baselines. Devolve as linhas da tabela e a lista das que ficaram fora.
 * Lança erro se os dois não cobrem as mesmas seeds ou se há menos de `minSeeds` por dificuldade.
 */
export function comparar(novo, ref, minSeeds = SEEDS_MIN) {
  const linhas = [];
  for (const dificuldade of DIFICULDADES) {
    const doNovo = novo.partidas.filter((x) => x.dificuldade === dificuldade);
    const daRef = ref.partidas.filter((x) => x.dificuldade === dificuldade);
    if (seedsDe(doNovo) !== seedsDe(daRef)) throw new Error(`seeds diferentes em ${dificuldade}`);
    if (doNovo.length < minSeeds) throw new Error(`${dificuldade}: ${doNovo.length} seeds, mínimo ${minSeeds}`);
    for (const x of [...doNovo, ...daRef]) {
      if (typeof x.vitoriasT !== 'number' || typeof x.vitoriasCT !== 'number') {
        throw new Error(`baseline sem vitoriasT/vitoriasCT (${dificuldade}, seed ${x.seed}): gere de novo`);
      }
    }
    const [a, b] = [metricas(doNovo), metricas(daRef)];
    for (const m of METRICAS) {
      const diferenca = a[m.nome] - b[m.nome];
      linhas.push({
        dificuldade, metrica: m.nome, rotulo: m.rotulo, porcentagem: m.porcentagem, seeds: doNovo.length,
        ref: b[m.nome], novo: a[m.nome], diferenca,
        relativa: b[m.nome] === 0 ? null : Math.abs(diferenca) / Math.abs(b[m.nome]),
        dentro: dentro(a[m.nome], b[m.nome], m.porcentagem),
      });
    }
  }
  return { linhas, fora: linhas.filter((l) => !l.dentro) };
}

const n2 = (x) => x.toFixed(2);
const relativaDe = (l) => (l.relativa === null ? 'n/d' : `${n2(l.relativa * 100)}%`);

/** Tabela em texto: uma linha por dificuldade e métrica. */
export function tabela(linhas) {
  const cabecalho = ['dificuldade', 'métrica', 'ref', 'novo', 'dif', 'rel', 'resultado'];
  const corpo = linhas.map((l) => [
    l.dificuldade, l.rotulo, n2(l.ref), n2(l.novo), `${l.diferenca >= 0 ? '+' : ''}${n2(l.diferenca)}${l.porcentagem ? ' pp' : ''}`,
    relativaDe(l), l.dentro ? 'ok' : 'FORA',
  ]);
  const larguras = cabecalho.map((c, i) => Math.max(c.length, ...corpo.map((r) => r[i].length)));
  const linha = (r) => r.map((c, i) => c.padEnd(larguras[i])).join('  ').trimEnd();
  return [linha(cabecalho), linha(larguras.map((w) => '-'.repeat(w))), ...corpo.map(linha)].join('\n');
}

function principal(argv) {
  const arquivos = argv.filter((a) => !a.startsWith('--'));
  if (arquivos.length !== 2) throw new Error('uso: baseline-compara.mjs <novo.json> <ref.json> [--min-seeds=30]');
  const minSeeds = Number(argv.find((a) => a.startsWith('--min-seeds='))?.slice('--min-seeds='.length) ?? SEEDS_MIN);
  const [novo, ref] = arquivos.map((a) => JSON.parse(readFileSync(a, 'utf8')));
  const { linhas, fora } = comparar(novo, ref, minSeeds);
  console.log(`novo: ${arquivos[0]}\nref:  ${arquivos[1]}\nseeds por dificuldade: ${linhas[0].seeds}\n`);
  console.log(tabela(linhas));
  console.log(`\ntolerância: variação relativa <= ${TOLERANCIA_RELATIVA * 100}% ou (porcentagem) <= ${TOLERANCIA_PONTOS} pp\n`);
  if (fora.length === 0) {
    console.log('DENTRO DA TOLERANCIA');
    return;
  }
  console.log('FORA DA TOLERANCIA:');
  for (const l of fora) {
    console.log(`  ${l.dificuldade} / ${l.rotulo}: ref ${n2(l.ref)}, novo ${n2(l.novo)} (rel ${relativaDe(l)})`);
  }
  process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) principal(process.argv.slice(2));
