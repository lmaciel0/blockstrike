import { expect, test } from 'vitest';
import { MAPA } from '../src/mapa.js';
import { temVisada } from '../src/fisica.js';
import { JOGADOR } from '../src/config.js';
import type { Vec3 } from '../src/tipos.js';

const { caixas, spawns, waypoints, arestas } = MAPA;
const R = JOGADOR.raio;
const H = JOGADOR.altura;

// Interseção estrita: encostar (inclusive no chão) não conta.
function dentro(p: Vec3, raio: number, altura: number): boolean {
  return caixas.some((c) =>
    p.x - raio < c.max.x && p.x + raio > c.min.x &&
    p.y < c.max.y && p.y + altura > c.min.y &&
    p.z - raio < c.max.z && p.z + raio > c.min.z);
}

test('contagens dentro dos limites do plano', () => {
  expect(caixas.length >= 40 && caixas.length <= 80, `caixas=${caixas.length}`).toBeTruthy();
  expect(waypoints.length >= 25 && waypoints.length <= 45, `waypoints=${waypoints.length}`).toBeTruthy();
  expect(MAPA.ceu).toBe(0x87ceeb);
  expect(MAPA.neblina).toStrictEqual([30, 90]);
  waypoints.forEach((w, i) => expect(w.id).toBe(i));
});

test('spawns livres', () => {
  for (const lado of ['A', 'B'] as const) {
    spawns[lado].forEach((s, i) => {
      expect(!dentro(s, R, H), `spawn ${lado}${i} dentro de caixa`).toBeTruthy();
      spawns[lado].forEach((o, j) => {
        if (j > i) expect(Math.hypot(s.x - o.x, s.z - o.z) >= 1, `spawns ${lado}${i}/${j} muito perto`).toBeTruthy();
      });
    });
  }
});

test('spawns espelhados', () => {
  expect(spawns.A.length).toBe(5);
  expect(spawns.B.length).toBe(5);
  expect(MAPA.yawSpawn.A).toBe(0);
  expect(MAPA.yawSpawn.B).toBe(Math.PI);
  expect(spawns.A.every((s) => s.z > 0) && spawns.B.every((s) => s.z < 0)).toBeTruthy();
});

test('waypoints livres', () => {
  for (const w of waypoints) {
    expect(!dentro({ x: w.x, y: 0.5, z: w.z }, 0, 0), `waypoint ${w.id} dentro de caixa`).toBeTruthy();
  }
});

test('arestas com visada', () => {
  for (const [a, b] of arestas) {
    const wa = waypoints[a];
    const wb = waypoints[b];
    expect(wa && wb, `aresta ${a}-${b} com id inválido`).toBeTruthy();
    const dx = wb.x - wa.x;
    const dz = wb.z - wa.z;
    const len = Math.hypot(dx, dz);
    const px = -dz / len; // perpendicular horizontal unitária
    const pz = dx / len;
    for (const off of [0, R, -R]) {
      const pa = { x: wa.x + px * off, y: 0.9, z: wa.z + pz * off };
      const pb = { x: wb.x + px * off, y: 0.9, z: wb.z + pz * off };
      expect(temVisada(pa, pb, caixas), `aresta ${a}-${b} bloqueada (off ${off})`).toBeTruthy();
    }
  }
});

test('grafo conexo', () => {
  const viz: number[][] = waypoints.map(() => []);
  for (const [a, b] of arestas) { viz[a].push(b); viz[b].push(a); }
  const visto = new Set([0]);
  const fila = [0];
  while (fila.length) {
    for (const n of viz[fila.shift()!]) {
      if (!visto.has(n)) { visto.add(n); fila.push(n); }
    }
  }
  expect(visto.size).toBe(waypoints.length);
});

test('cada spawn tem waypoint a <= 6 m com visada', () => {
  for (const lado of ['A', 'B'] as const) {
    for (const s of spawns[lado]) {
      const olho = { x: s.x, y: 0.9, z: s.z };
      const ok = waypoints.some((w) =>
        Math.hypot(w.x - s.x, w.z - s.z) <= 6 &&
        temVisada(olho, { x: w.x, y: 0.9, z: w.z }, caixas));
      expect(ok, `spawn ${lado} (${s.x},${s.z}) sem waypoint próximo`).toBeTruthy();
    }
  }
});

test('não há visada direta entre spawn A e spawn B', () => {
  for (const a of spawns.A) {
    for (const b of spawns.B) {
      const pa = { x: a.x, y: JOGADOR.olho, z: a.z };
      const pb = { x: b.x, y: JOGADOR.olho, z: b.z };
      expect(!temVisada(pa, pb, caixas), `visada direta ${a.x},${a.z} -> ${b.x},${b.z}`).toBeTruthy();
    }
  }
});

test('caixas bem formadas', () => {
  for (const c of caixas) {
    expect(c.min.x < c.max.x && c.min.y < c.max.y && c.min.z < c.max.z).toBeTruthy();
    expect(typeof c.cor).toBe('number');
  }
});

test('bombsites A e B: livres, com waypoint no centro e longe dos spawns', () => {
  const { bombsites } = MAPA;
  expect(Object.keys(bombsites)).toStrictEqual(['A', 'B']);
  for (const [nome, s] of Object.entries(bombsites)) {
    expect(s.min.x < s.max.x && s.min.z < s.max.z, nome).toBeTruthy();
    const w = waypoints[s.waypoint];
    expect(w.x > s.min.x && w.x < s.max.x && w.z > s.min.z && w.z < s.max.z, `${nome}: waypoint fora do site`).toBeTruthy();
    // Nenhuma caixa alta (que bloqueia passagem) dentro do retângulo.
    for (const c of caixas) {
      if (c.max.y <= 0.01) continue;
      const sobrepoe = c.min.x < s.max.x && c.max.x > s.min.x && c.min.z < s.max.z && c.max.z > s.min.z;
      expect(!sobrepoe, `${nome}: caixa dentro do site`).toBeTruthy();
    }
    for (const lado of ['A', 'B'] as const) {
      for (const sp of spawns[lado]) expect(Math.hypot(sp.x - w.x, sp.z - w.z) > 15, `${nome} perto do spawn`).toBeTruthy();
    }
  }
});
