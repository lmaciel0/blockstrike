// Confere a decoração contra as regras físicas: node --import tsx docs/design/mapa-v2/previa/conferir.mjs
import { MAPA } from '../mapa.ts';
const { caixas, decoracao, waypoints, arestas } = MAPA;
const dentro = (d, c, e) => d.min.x >= c.min.x - e && d.max.x <= c.max.x + e && d.min.z >= c.min.z - e && d.max.z <= c.max.z + e
  && d.min.y < c.max.y + 0.5 && d.max.y > c.min.y - 0.5;
const distSeg = (px, pz, a, b) => {
  const dx = b.x - a.x, dz = b.z - a.z, t = Math.max(0, Math.min(1, ((px - a.x) * dx + (pz - a.z) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(px - a.x - t * dx, pz - a.z - t * dz);
};
const distCaixaPonto = (d, f) => { // menor distância em xz da caixa a uma função de distância (amostra os cantos e o centro)
  let m = Infinity;
  for (const x of [d.min.x, (d.min.x + d.max.x) / 2, d.max.x]) for (const z of [d.min.z, (d.min.z + d.max.z) / 2, d.max.z]) m = Math.min(m, f(x, z));
  return m;
};
let chao = 0, parede = 0, alto = 0, piso = 0, fora = 0; const avisos = [];
for (const d of decoracao) {
  const h = d.max.y - d.min.y;
  if (Math.abs(d.min.x) > 40.5 || Math.abs(d.max.x) > 40.5 || Math.abs(d.min.z) > 30.5 || Math.abs(d.max.z) > 30.5) { fora++; if (d.min.y < 4 && !(d.max.y > 4)) avisos.push(['fora e baixo', d]); continue; }
  if (d.max.y <= 0.05) { piso++; continue; }
  if (d.min.y >= 2.6) { alto++; continue; }
  if (caixas.some((c) => dentro(d, c, 0.125))) { parede++; continue; }
  chao++;
  const dw = distCaixaPonto(d, (x, z) => Math.min(...waypoints.map((w) => Math.hypot(x - w.x, z - w.z))));
  const da = distCaixaPonto(d, (x, z) => Math.min(...arestas.map(([a, b]) => distSeg(x, z, waypoints[a], waypoints[b]))));
  const colado = caixas.some((c) => dentro(d, c, 1.75) || (d.min.y >= c.max.y - 0.2 && dentro(d, c, 0.2)));
  const prob = [];
  if (dw < 1) prob.push(`waypoint a ${dw.toFixed(2)} m`);
  if (da < 0.7) prob.push(`aresta a ${da.toFixed(2)} m`);
  if (d.min.z < 0.5 && d.max.z > -0.5) prob.push('na faixa central');
  if (!colado) prob.push('solto');
  if (prob.length) avisos.push([prob.join(', '), d]);
}
console.log({ total: decoracao.length, piso, parede, alto, chao, fora, vertices: (caixas.length + decoracao.length) * 24 });
for (const [p, d] of avisos) console.log(p, JSON.stringify(d.min), JSON.stringify(d.max), '#' + Number(d.cor).toString(16));
