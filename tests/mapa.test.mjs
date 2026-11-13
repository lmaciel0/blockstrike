import test from 'node:test';
import assert from 'node:assert/strict';
import { mod } from './_repo.mjs';

const { MAPA } = await mod('packages/sim/src/mapa.js');
const { temVisada } = await mod('packages/sim/src/fisica.js');
const { JOGADOR } = await mod('packages/sim/src/config.js');

const { caixas, spawns, waypoints, arestas } = MAPA;
const R = JOGADOR.raio;
const H = JOGADOR.altura;

// Interseção estrita: encostar (inclusive no chão) não conta.
function dentro(p, raio, altura) {
  return caixas.some((c) =>
    p.x - raio < c.max.x && p.x + raio > c.min.x &&
    p.y < c.max.y && p.y + altura > c.min.y &&
    p.z - raio < c.max.z && p.z + raio > c.min.z);
}

test('contagens dentro dos limites do plano', () => {
  assert.ok(caixas.length >= 40 && caixas.length <= 80, `caixas=${caixas.length}`);
  assert.ok(waypoints.length >= 25 && waypoints.length <= 45, `waypoints=${waypoints.length}`);
  assert.equal(MAPA.ceu, 0x87ceeb);
  assert.deepEqual(MAPA.neblina, [30, 90]);
  waypoints.forEach((w, i) => assert.equal(w.id, i));
});

test('spawns livres', () => {
  for (const lado of ['A', 'B']) {
    spawns[lado].forEach((s, i) => {
      assert.ok(!dentro(s, R, H), `spawn ${lado}${i} dentro de caixa`);
      spawns[lado].forEach((o, j) => {
        if (j > i) assert.ok(Math.hypot(s.x - o.x, s.z - o.z) >= 1, `spawns ${lado}${i}/${j} muito perto`);
      });
    });
  }
});

test('spawns espelhados', () => {
  assert.equal(spawns.A.length, 5);
  assert.equal(spawns.B.length, 5);
  assert.equal(MAPA.yawSpawn.A, 0);
  assert.equal(MAPA.yawSpawn.B, Math.PI);
  assert.ok(spawns.A.every((s) => s.z > 0) && spawns.B.every((s) => s.z < 0));
});

test('waypoints livres', () => {
  for (const w of waypoints) {
    assert.ok(!dentro({ x: w.x, y: 0.5, z: w.z }, 0, 0), `waypoint ${w.id} dentro de caixa`);
  }
});

test('arestas com visada', () => {
  for (const [a, b] of arestas) {
    const wa = waypoints[a];
    const wb = waypoints[b];
    assert.ok(wa && wb, `aresta ${a}-${b} com id inválido`);
    const dx = wb.x - wa.x;
    const dz = wb.z - wa.z;
    const len = Math.hypot(dx, dz);
    const px = -dz / len; // perpendicular horizontal unitária
    const pz = dx / len;
    for (const off of [0, R, -R]) {
      const pa = { x: wa.x + px * off, y: 0.9, z: wa.z + pz * off };
      const pb = { x: wb.x + px * off, y: 0.9, z: wb.z + pz * off };
      assert.ok(temVisada(pa, pb, caixas), `aresta ${a}-${b} bloqueada (off ${off})`);
    }
  }
});

test('grafo conexo', () => {
  const viz = waypoints.map(() => []);
  for (const [a, b] of arestas) { viz[a].push(b); viz[b].push(a); }
  const visto = new Set([0]);
  const fila = [0];
  while (fila.length) {
    for (const n of viz[fila.shift()]) {
      if (!visto.has(n)) { visto.add(n); fila.push(n); }
    }
  }
  assert.equal(visto.size, waypoints.length);
});

test('cada spawn tem waypoint a <= 6 m com visada', () => {
  for (const lado of ['A', 'B']) {
    for (const s of spawns[lado]) {
      const olho = { x: s.x, y: 0.9, z: s.z };
      const ok = waypoints.some((w) =>
        Math.hypot(w.x - s.x, w.z - s.z) <= 6 &&
        temVisada(olho, { x: w.x, y: 0.9, z: w.z }, caixas));
      assert.ok(ok, `spawn ${lado} (${s.x},${s.z}) sem waypoint próximo`);
    }
  }
});

test('não há visada direta entre spawn A e spawn B', () => {
  for (const a of spawns.A) {
    for (const b of spawns.B) {
      const pa = { x: a.x, y: JOGADOR.olho, z: a.z };
      const pb = { x: b.x, y: JOGADOR.olho, z: b.z };
      assert.ok(!temVisada(pa, pb, caixas), `visada direta ${a.x},${a.z} -> ${b.x},${b.z}`);
    }
  }
});

test('caixas bem formadas', () => {
  for (const c of caixas) {
    assert.ok(c.min.x < c.max.x && c.min.y < c.max.y && c.min.z < c.max.z);
    assert.equal(typeof c.cor, 'number');
  }
});

test('bombsites A e B: livres, com waypoint no centro e longe dos spawns', () => {
  const { bombsites } = MAPA;
  assert.deepEqual(Object.keys(bombsites), ['A', 'B']);
  for (const [nome, s] of Object.entries(bombsites)) {
    assert.ok(s.min.x < s.max.x && s.min.z < s.max.z, nome);
    const w = waypoints[s.waypoint];
    assert.ok(w.x > s.min.x && w.x < s.max.x && w.z > s.min.z && w.z < s.max.z, `${nome}: waypoint fora do site`);
    // Nenhuma caixa alta (que bloqueia passagem) dentro do retângulo.
    for (const c of caixas) {
      if (c.max.y <= 0.01) continue;
      const sobrepoe = c.min.x < s.max.x && c.max.x > s.min.x && c.min.z < s.max.z && c.max.z > s.min.z;
      assert.ok(!sobrepoe, `${nome}: caixa dentro do site`);
    }
    for (const lado of ['A', 'B']) {
      for (const sp of spawns[lado]) assert.ok(Math.hypot(sp.x - w.x, sp.z - w.z) > 15, `${nome} perto do spawn`);
    }
  }
});
