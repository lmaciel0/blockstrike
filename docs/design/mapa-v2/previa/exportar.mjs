// Exporta os dados do mapa v2 para o preview: node --import tsx docs/design/mapa-v2/previa/exportar.mjs <saida.json>
import { writeFileSync } from 'node:fs';
import { MAPA } from '../mapa.ts';
import { ATMOSFERA } from '../atmosfera.ts';
const saida = process.argv[2] ?? new URL('./dados.json', import.meta.url).pathname;
writeFileSync(saida, JSON.stringify({ mapa: MAPA, atmosfera: ATMOSFERA }));
const n = MAPA.caixas.length, d = MAPA.decoracao.length;
console.log(`caixas ${n}, decoracao ${d}, vertices ${(n + d) * 24}`);
