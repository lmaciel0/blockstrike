// Gera o baseline (dt fixo 1/60) num arquivo temporário e compara com tools/baseline/js-dt60.json.
// Imprime IDENTICO ou o diff; sai com código 1 se divergir. uso: npm run baseline:check
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const referencia = path.join(raiz, 'tools/baseline/js-dt60.json');
const pasta = mkdtempSync(path.join(tmpdir(), 'bs-baseline-'));
const gerado = path.join(pasta, 'js-dt60.json');

try {
  const exec = spawnSync(
    process.execPath,
    ['--import', 'tsx', path.join(raiz, 'tools/baseline.mjs'), `--out=${gerado}`, '--dt=fixo'],
    { cwd: raiz, stdio: ['ignore', 'ignore', 'inherit'] },
  );
  if (exec.status !== 0) process.exit(exec.status ?? 1);
  if (readFileSync(gerado, 'utf8') === readFileSync(referencia, 'utf8')) {
    console.log('IDENTICO');
  } else {
    const d = spawnSync('diff', ['-u', referencia, gerado], { encoding: 'utf8' });
    console.log(d.stdout);
    process.exit(1);
  }
} finally {
  rmSync(pasta, { recursive: true, force: true });
}
