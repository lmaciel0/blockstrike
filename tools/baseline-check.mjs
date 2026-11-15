// Gera o baseline (passo fixo pelo relógio, `--dt=relogio`) num arquivo temporário e compara com
// tools/baseline/ts-plano2.json. (tools/baseline/ts-relogio.json, a referência anterior ao Plano 2, e
// tools/baseline/js-dt60.json, do dt fixo 1/60 anterior ao relógio, ficam como registro histórico e não são
// mais conferidos: o Plano 2 muda o comportamento dos bots de propósito, então quem muda comportamento
// regenera ts-plano2.json com `node --import tsx tools/baseline.mjs --out=tools/baseline/ts-plano2.json
// --seeds=1..30 --dt=relogio`.)
// A referência tem 30 seeds por dificuldade; por padrão só as seeds 1..5 são geradas de novo e comparadas
// com as partidas das mesmas seeds na referência. `--seeds=1..30` confere tudo (leva uns 20 min).
// Imprime IDENTICO ou o diff; sai com código 1 se divergir. uso: npm run baseline:check [-- --seeds=1..30]
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const referencia = path.join(raiz, 'tools/baseline/ts-plano2.json');
const seeds = process.argv.slice(2).find((a) => a.startsWith('--seeds='))?.slice('--seeds='.length) ?? '1..5';
const pasta = mkdtempSync(path.join(tmpdir(), 'bs-baseline-'));
const gerado = path.join(pasta, 'gerado.json');
const esperado = path.join(pasta, 'referencia.json');

try {
  const exec = spawnSync(
    process.execPath,
    ['--import', 'tsx', path.join(raiz, 'tools/baseline.mjs'), `--out=${gerado}`, '--dt=relogio', `--seeds=${seeds}`],
    { cwd: raiz, stdio: ['ignore', 'ignore', 'inherit'] },
  );
  if (exec.status !== 0) process.exit(exec.status ?? 1);
  // Recorte da referência com as mesmas seeds do gerado, na ordem e no formato em que baseline.mjs grava.
  const textoGerado = readFileSync(gerado, 'utf8');
  const pedidas = new Set(JSON.parse(textoGerado).partidas.map((x) => x.seed));
  const ref = JSON.parse(readFileSync(referencia, 'utf8'));
  const recorte = { ...ref, partidas: ref.partidas.filter((x) => pedidas.has(x.seed)) };
  const textoEsperado = `${JSON.stringify(recorte, null, 2)}\n`;
  if (textoGerado === textoEsperado) {
    console.log('IDENTICO');
  } else {
    writeFileSync(esperado, textoEsperado);
    const d = spawnSync('diff', ['-u', esperado, gerado], { encoding: 'utf8' });
    console.log(d.stdout);
    process.exit(1);
  }
} finally {
  rmSync(pasta, { recursive: true, force: true });
}
