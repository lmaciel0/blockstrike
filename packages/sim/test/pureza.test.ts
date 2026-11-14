/// <reference types="vite/client" />
import { expect, test } from 'vitest';

// A simulação é pura: roda igual no navegador, no servidor e nos testes. Por isso nenhum módulo de
// `packages/sim/src` pode tocar o DOM, o Three.js, o relógio de parede nem o acaso fora do `rng` com seed.
// O texto dos fontes vem pelo `import.meta.glob` do Vite (sem `node:fs`, o pacote não tem `@types/node`).
const fontes = import.meta.glob<string>('../src/**/*.ts', { query: '?raw', import: 'default', eager: true });

const PROIBIDOS: [nome: string, padrao: RegExp][] = [
  ['document', /\bdocument\b/],
  ['window', /\bwindow\b/],
  ['navigator', /\bnavigator\b/],
  ['THREE', /\bTHREE\b/],
  ['Math.random', /\bMath\.random\b/],
  ['Date.now', /\bDate\.now\b/],
];

// Uma linha `arquivo:linha: nome` por ocorrência, para a falha já dizer onde mexer.
function impurezas(arquivo: string, texto: string): string[] {
  const achados: string[] = [];
  texto.split('\n').forEach((linha, i) => {
    for (const [nome, padrao] of PROIBIDOS) {
      if (padrao.test(linha)) achados.push(`${arquivo}:${i + 1}: ${nome}`);
    }
  });
  return achados;
}

test('o detector acha cada nome proibido (e não se confunde com palavra parecida)', () => {
  expect(impurezas('x.ts', 'const a = Math.random();\nconst b = Date.now();')).toEqual([
    'x.ts:1: Math.random', 'x.ts:2: Date.now',
  ]);
  expect(impurezas('x.ts', 'document.title = window.name + navigator.userAgent;')).toEqual([
    'x.ts:1: document', 'x.ts:1: window', 'x.ts:1: navigator',
  ]);
  expect(impurezas('x.ts', 'new THREE.Vector3()')).toEqual(['x.ts:1: THREE']);
  expect(impurezas('x.ts', '// documentado: sem Three.js; rng() no lugar do acaso')).toEqual([]);
});

test('o glob enxerga todos os módulos da simulação', () => {
  const nomes = Object.keys(fontes).map((c) => c.replace('../src/', '')).sort();
  expect(nomes).toEqual([
    'armas.ts', 'bomba.ts', 'bots.ts', 'config.ts', 'economia.ts', 'fisica.ts', 'granadas.ts', 'index.ts',
    'mapa.ts', 'mundo.ts', 'navegacao.ts', 'percepcao.ts', 'relogio.ts', 'rng.ts', 'rounds.ts', 'tipos.ts',
  ]);
  for (const texto of Object.values(fontes)) expect(texto.length).toBeGreaterThan(0);
});

test('nenhum módulo da simulação usa DOM, Three.js, Math.random ou Date.now', () => {
  const achados = Object.entries(fontes).flatMap(([arquivo, texto]) => impurezas(arquivo, texto));
  expect(achados).toEqual([]);
});
