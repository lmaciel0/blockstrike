// Block Strike — gera as folhas de design em SVG a partir das MESMAS tabelas de modelos-v2.ts e avatar-v2.ts.
// Uso (na raiz do repo):  node --import tsx docs/design/personagens-armas-v2/gerar-svg.mjs [--png]
//   --png  também renderiza cada SVG em previa/*.png com Playwright/Chromium (para conferir de olho).
// Sem dependências novas: um projetor de caixas de ~100 linhas (pintor por face) faz o 3D.

import { writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MODELOS_ARMA, PALETA_ARMA, MAOS_VIEW, VIEW_V2, corDaArma } from './modelos-v2.ts';
import {
  PARTES, ROSTO, VARIANTES, EXPRESSOES, CORES_TIME, coresDe, caixasDaParte, desenharRosto, poseArmado, cicloCaminhada,
} from './avatar-v2.ts';

const AQUI = dirname(fileURLToPath(import.meta.url));
const NOMES = {
  rifle: 'Rifle (AK)', fuzil: 'Fuzil (M4)', rifleS: 'Rifle-S (silenciado)', smg: 'SMG (MP5)', miniSmg: 'Mini SMG (P90)',
  smgS: 'SMG-S (silenciada)', sniper: 'Sniper (AWP)', escopeta: 'Escopeta (pump)', pistola: 'Pistola (USP)', faca: 'Faca',
};
const FONTE = 'font-family="Segoe UI, Helvetica, Arial, sans-serif"';
const n = (v) => Math.round(v * 100) / 100;

// ───────────── cor ─────────────
const hexRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const tom = (h, k) => `#${hexRgb(h).map((c) => Math.max(0, Math.min(255, Math.round(c * k))).toString(16).padStart(2, '0')).join('')}`;

// ───────────── matrizes 3x4 (rotação + translação) ─────────────
const I = () => [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0];
const T = (x, y, z) => [1, 0, 0, 0, 1, 0, 0, 0, 1, x, y, z];
const RX = (a) => [1, 0, 0, 0, Math.cos(a), -Math.sin(a), 0, Math.sin(a), Math.cos(a), 0, 0, 0];
const RY = (a) => [Math.cos(a), 0, Math.sin(a), 0, 1, 0, -Math.sin(a), 0, Math.cos(a), 0, 0, 0];
const RZ = (a) => [Math.cos(a), -Math.sin(a), 0, Math.sin(a), Math.cos(a), 0, 0, 0, 1, 0, 0, 0];
function mul(...ms) {
  return ms.reduce((A, B) => {
    const C = new Array(12);
    for (let l = 0; l < 3; l += 1) {
      for (let c = 0; c < 3; c += 1) C[l * 3 + c] = A[l * 3] * B[c] + A[l * 3 + 1] * B[3 + c] + A[l * 3 + 2] * B[6 + c];
      C[9 + l] = A[l * 3] * B[9] + A[l * 3 + 1] * B[10] + A[l * 3 + 2] * B[11] + A[9 + l];
    }
    return C;
  });
}
const ap = (M, [x, y, z]) => [M[0] * x + M[1] * y + M[2] * z + M[9], M[3] * x + M[4] * y + M[5] * z + M[10], M[6] * x + M[7] * y + M[8] * z + M[11]];
const YXZ = (rx, ry, rz) => mul(RY(ry), RX(rx), RZ(rz)); // a ordem de Euler que o render usa nos braços

// ───────────── cena: lista de faces (quads) no espaço do mundo ─────────────
// Faces de uma caixa: 4 cantos em ordem anti-horária vista de fora (sinais de x, y, z).
const FACES = [
  [[1, -1, 1], [1, -1, -1], [1, 1, -1], [1, 1, 1]], [[-1, -1, -1], [-1, -1, 1], [-1, 1, 1], [-1, 1, -1]],
  [[-1, 1, 1], [1, 1, 1], [1, 1, -1], [-1, 1, -1]], [[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1]],
  [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]], [[1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1]],
];
function caixa(cena, M, [w, h, d, x, y, z], cor, rx = 0, ry = 0) {
  const L = mul(M, T(x, y, z), YXZ(rx, ry, 0));
  for (const f of FACES) cena.push({ pts: f.map(([sx, sy, sz]) => ap(L, [(sx * w) / 2, (sy * h) / 2, (sz * d) / 2])), cor, vies: 0 });
}
function quad(cena, M, pts, cor, vies) {
  cena.push({ pts: pts.map((p) => ap(M, p)), cor, vies, chapado: true });
}

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cruz = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const esc = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const unit = (a) => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const LUZ = unit([-0.35, 0.85, 0.55]); // no espaço da câmera: de cima, um pouco da esquerda e de trás da câmera

/**
 * Projeta a cena e devolve <polygon>s. `cam`: { V (mundo→câmera), tipo: 'orto' | 'persp', escala | fov, cx, cy, alt }.
 * Câmera olha para -z. Pintor: faces de trás para a frente; faces de costas são descartadas.
 */
function projetar(cena, cam) {
  const perto = 0.03;
  const f = cam.tipo === 'persp' ? cam.alt / 2 / Math.tan((cam.fov * Math.PI) / 360) : cam.escala;
  const saida = [];
  for (const face of cena) {
    let p = face.pts.map((q) => ap(cam.V, q));
    const nn = unit(cruz(sub(p[1], p[0]), sub(p[2], p[0])));
    const visivel = cam.tipo === 'persp' ? esc(nn, p[0]) < 0 : nn[2] > 0;
    if (!visivel) continue;
    if (cam.tipo === 'persp') { // recorta no plano de perto
      const dentro = (q) => q[2] <= -perto;
      const r = [];
      p.forEach((a, i) => {
        const b = p[(i + 1) % p.length];
        if (dentro(a)) r.push(a);
        if (dentro(a) !== dentro(b)) { const t = (-perto - a[2]) / (b[2] - a[2]); r.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, -perto]); }
      });
      p = r;
      if (p.length < 3) continue;
    }
    const centro = p.reduce((s, q) => [s[0] + q[0] / p.length, s[1] + q[1] / p.length, s[2] + q[2] / p.length], [0, 0, 0]);
    const fundo = cam.tipo === 'persp' ? -Math.hypot(...centro) : centro[2];
    const luz = face.chapado ? 0.95 : 0.56 + 0.44 * Math.max(0, esc(nn, LUZ)) + (nn[1] > 0.9 ? 0.06 : 0);
    const pts = p.map((q) => {
      const k = cam.tipo === 'persp' ? f / -q[2] : f;
      return `${n(cam.cx + q[0] * k)},${n(cam.cy - q[1] * k)}`;
    }).join(' ');
    saida.push({ fundo: fundo + face.vies, svg: `<polygon points="${pts}" fill="${tom(face.cor, luz)}" stroke="${tom(face.cor, luz * (face.chapado ? 1 : 0.82))}" stroke-width="${face.chapado ? 0.3 : 0.7}" stroke-linejoin="round"/>` });
  }
  return saida.sort((a, b) => a.fundo - b.fundo).map((s) => s.svg).join('');
}

// ───────────── (a) armas de lado ─────────────
function armasLado() {
  const S = 640; // px por metro
  const tipos = Object.keys(MODELOS_ARMA);
  const colW = 920; const linH = 250; const topo = 150;
  const W = colW * 2; const H = topo + linH * 5 + 20;
  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" ${FONTE}>`;
  s += `<rect width="${W}" height="${H}" fill="#eef1f4"/>`;
  s += `<text x="32" y="46" font-size="28" font-weight="700" fill="#1b1e24">Block Strike · armas v2 — vista lateral (cano à esquerda)</text>`;
  s += `<text x="32" y="74" font-size="15" fill="#4a515b">Desenhado das tuplas de modelos-v2.ts · 1 m = ${S} px · ⊕ = boca do cano (clarão) · contorno tracejado = caixa do pente</text>`;
  const nomesPaleta = ['0 metal escuro', '1 metal médio/claro', '2 madeira/polímero*', '3 acento/óptica*', '4 manga do time', '5 pele', '6 luva'];
  PALETA_ARMA.forEach((cor, i) => {
    const x = 32 + i * 250;
    s += `<rect x="${x}" y="94" width="34" height="34" rx="4" fill="${cor}" stroke="#1b1e24" stroke-width="1"/>`;
    s += `<text x="${x + 44}" y="109" font-size="14" font-weight="600" fill="#1b1e24">${nomesPaleta[i]}</text><text x="${x + 44}" y="126" font-size="13" fill="#4a515b">${cor}${i === 2 || i === 3 ? ' (* muda por arma)' : ''}</text>`;
  });
  tipos.forEach((tipo, i) => {
    const m = MODELOS_ARMA[tipo];
    const x0 = (i % 2) * colW; const y0 = topo + Math.floor(i / 2) * linH;
    const zs = m.caixas.flatMap(([, , d, , , z]) => [z - d / 2, z + d / 2]);
    const ys = m.caixas.flatMap(([, h, , , y]) => [y - h / 2, y + h / 2]);
    const zMin = Math.min(...zs); const zMax = Math.max(...zs);
    const cx = x0 + colW / 2 - ((zMin + zMax) / 2) * S;
    const cy = y0 + linH / 2 - 14 + ((Math.min(...ys) + Math.max(...ys)) / 2) * S;
    s += `<rect x="${x0 + 12}" y="${y0 + 8}" width="${colW - 24}" height="${linH - 16}" rx="10" fill="#dfe4e9"/>`;
    // De trás para a frente: quem vê está em -x, então a face mais perto é a de menor x.
    const ordem = m.caixas.map((c, k) => ({ c, k })).sort((a, b) => (b.c[3] - b.c[0] / 2) - (a.c[3] - a.c[0] / 2) || a.k - b.k);
    for (const { c: [, h, d, , y, z, mat], k } of ordem) {
      const cor = corDaArma(m, mat ?? 0);
      const rx = cx + (z - d / 2) * S; const ry = cy - (y + h / 2) * S;
      s += `<rect x="${n(rx)}" y="${n(ry)}" width="${n(d * S)}" height="${n(h * S)}" fill="${cor}" stroke="${tom(cor, 0.7)}" stroke-width="1"/>`;
      s += `<rect x="${n(rx)}" y="${n(ry)}" width="${n(d * S)}" height="${n(Math.min(h * S * 0.22, 6))}" fill="#ffffff" opacity="0.16"/>`;
      if (k === m.pente) s += `<rect x="${n(rx - 3)}" y="${n(ry - 3)}" width="${n(d * S + 6)}" height="${n(h * S + 6)}" fill="none" stroke="#d6336c" stroke-width="1.5" stroke-dasharray="5 4"/>`;
    }
    const bx = cx + m.boca * S; const by = cy - (m.bocaY ?? m.caixas[0][4]) * S;
    s += `<g stroke="#e03131" stroke-width="2" fill="none"><circle cx="${n(bx)}" cy="${n(by)}" r="7"/><path d="M${n(bx - 12)} ${n(by)}h24M${n(bx)} ${n(by - 12)}v24"/></g>`;
    s += `<text x="${x0 + 30}" y="${y0 + linH - 22}" font-size="19" font-weight="700" fill="#1b1e24">${NOMES[tipo]}</text>`;
    s += `<text x="${x0 + colW - 30}" y="${y0 + linH - 22}" font-size="14" fill="#4a515b" text-anchor="end">${tipo} · ${m.caixas.length} caixas · ${n(zMax - Math.min(zMin, m.boca))} m · boca z=${m.boca}${m.pente === undefined ? ' · sem pente' : ` · pente=${m.pente}`}</text>`;
  });
  return `${s}</svg>`;
}

// ───────────── (b) primeira pessoa ─────────────
function cenaView(tipo, time, variante) {
  const cena = [];
  const v = VIEW_V2[tipo];
  const G = mul(T(...v.pos), YXZ(...v.rot));
  const m = MODELOS_ARMA[tipo];
  if (m) for (const c of m.caixas) caixa(cena, G, c, corDaArma(m, c[6] ?? 0));
  else caixa(cena, G, [0.05, 0.05, 0.05, 0, 0, 0], '#4d6b3a'); // granada: o cubo que o render já usa
  const cores = [...PALETA_ARMA];
  cores[4] = CORES_TIME[time].time;
  cores[5] = VARIANTES[variante].pele;
  for (const c of [...MAOS_VIEW[tipo].dir, ...MAOS_VIEW[tipo].esq]) caixa(cena, G, c, cores[c[6]], c[7], c[8]);
  return cena;
}
function primeiraPessoa() {
  const paineis = [
    ['rifle', 'azul', 0], ['fuzil', 'laranja', 1], ['rifleS', 'azul', 2], ['smg', 'laranja', 0], ['miniSmg', 'azul', 4],
    ['sniper', 'laranja', 2], ['escopeta', 'azul', 1], ['pistola', 'laranja', 3], ['faca', 'azul', 0],
  ];
  const pw = 640; const ph = 360; const gap = 16; const topo = 92;
  const W = gap + (pw + gap) * 3; const H = topo + (ph + 40 + gap) * 3;
  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" ${FONTE}>`;
  s += `<defs><linearGradient id="ceu" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8fb8e0"/><stop offset="0.5" stop-color="#cfe0ee"/><stop offset="0.5" stop-color="#b9a98c"/><stop offset="1" stop-color="#8e7f66"/></linearGradient></defs>`;
  s += `<rect width="${W}" height="${H}" fill="#eef1f4"/>`;
  s += `<text x="${gap}" y="42" font-size="26" font-weight="700" fill="#1b1e24">Block Strike · primeira pessoa v2 — arma + mãos (câmera 16:9, FOV vertical 75°)</text>`;
  s += `<text x="${gap}" y="68" font-size="14" fill="#4a515b">Posição: VIEW_V2 · mãos: MAOS_VIEW (3 caixas por braço) · manga na cor do time, luva escura, dedos na cor da pele da variante</text>`;
  paineis.forEach(([tipo, time, variante], i) => {
    const x0 = gap + (i % 3) * (pw + gap); const y0 = topo + Math.floor(i / 3) * (ph + 40 + gap);
    s += `<svg x="${x0}" y="${y0}" width="${pw}" height="${ph}" viewBox="0 0 ${pw} ${ph}"><rect width="${pw}" height="${ph}" fill="url(#ceu)"/>`;
    s += `<rect x="60" y="150" width="150" height="110" fill="#a8946f"/><rect x="430" y="120" width="210" height="150" fill="#9c8a68"/>`;
    s += projetar(cenaView(tipo, time, variante), { V: I(), tipo: 'persp', fov: 75, cx: pw / 2, cy: ph / 2, alt: ph });
    s += `<g stroke="#ffffff" stroke-width="2" opacity="0.9"><path d="M${pw / 2 - 12} ${ph / 2}h8M${pw / 2 + 4} ${ph / 2}h8M${pw / 2} ${ph / 2 - 12}v8M${pw / 2} ${ph / 2 + 4}v8"/></g></svg>`;
    s += `<rect x="${x0}" y="${y0}" width="${pw}" height="${ph}" fill="none" stroke="#1b1e24" stroke-width="1.5"/>`;
    s += `<text x="${x0 + 4}" y="${y0 + ph + 24}" font-size="17" font-weight="700" fill="#1b1e24">${NOMES[tipo]}</text>`;
    s += `<text x="${x0 + pw - 4}" y="${y0 + ph + 24}" font-size="13" fill="#4a515b" text-anchor="end">time ${time} · pos [${VIEW_V2[tipo].pos}] · rot [${VIEW_V2[tipo].rot}]</text>`;
  });
  return `${s}</svg>`;
}

// ───────────── (c) boneco ─────────────
// Implementação de referência da hierarquia descrita em avatar-v2.ts (é o que o render deve fazer).
function cenaBoneco(time, variante, tipo, { dist = 0, amp = 0, pitch = 0, expressao = 'neutra' } = {}) {
  const cena = [];
  const cores = coresDe(time, variante);
  const pose = poseArmado(tipo);
  const passo = cicloCaminhada(dist, amp);
  const raiz = T(0, passo.quico, 0);
  const parte = (nome, M) => { for (const c of caixasDaParte(nome, time, variante)) caixa(cena, M, c, cores[c[6]]); };
  parte('pernaE', mul(raiz, T(...PARTES.pernaE.pivo), RX(passo.pernaE)));
  parte('pernaD', mul(raiz, T(...PARTES.pernaD.pivo), RX(passo.pernaD)));
  parte('tronco', mul(raiz, T(...PARTES.tronco.pivo), RY(pose.giroTronco + passo.contraTronco)));
  const cab = mul(raiz, T(...PARTES.cabeca.pivo));
  parte('cabeca', cab);
  // Rosto: os retângulos de desenharRosto viram quads no plano da frente da cabeça (x cresce para a direita de quem olha).
  const px = ROSTO.lado / 16;
  let k = 0;
  desenharRosto({
    fillStyle: '#000',
    fillRect(x, y, w, h) {
      const x0 = ROSTO.lado / 2 - x * px; const x1 = x0 - w * px; // quem olha de frente vê +x do boneco à esquerda
      const y1 = ROSTO.y + ROSTO.lado / 2 - y * px; const y0 = y1 - h * px;
      quad(cena, cab, [[x0, y0, ROSTO.z], [x1, y0, ROSTO.z], [x1, y1, ROSTO.z], [x0, y1, ROSTO.z]], this.fillStyle, 0.002 + (k += 1) * 1e-5);
    },
  }, expressao, VARIANTES[variante]);
  const mira = mul(raiz, T(0, 1.38, 0), RX(pitch), T(0, -1.38, 0));
  parte('bracoD', mul(mira, T(...pose.ombroD), YXZ(pose.bracoD[0], pose.bracoD[1], 0)));
  parte('bracoE', mul(mira, T(...pose.ombroE), YXZ(pose.bracoE[0], pose.bracoE[1], 0)));
  const m = MODELOS_ARMA[tipo];
  if (m) for (const c of m.caixas) caixa(cena, mul(mira, T(...pose.arma)), c, corDaArma(m, c[6] ?? 0));
  if (tipo === 'granada') caixa(cena, mul(mira, T(...pose.arma)), [0.07, 0.07, 0.07, 0, 0, 0], '#4d6b3a');
  return cena;
}
const camOrto = (az, elev, escala, cx, cy) => ({ V: mul(RX(elev), RY(az)), tipo: 'orto', escala, cx, cy });

function hitboxSvg(cx, chao, S, deLado) {
  const cab = `<rect x="${cx - 0.2 * S}" y="${chao - 1.8 * S}" width="${0.4 * S}" height="${0.4 * S}"/>`;
  const corpo = `<rect x="${cx - 0.25 * S}" y="${chao - 1.4 * S}" width="${0.5 * S}" height="${0.6 * S}"/><rect x="${cx - 0.25 * S}" y="${chao - 0.8 * S}" width="${0.5 * S}" height="${0.8 * S}"/>`;
  return `<g fill="none" stroke="#e03131" stroke-width="1.2" stroke-dasharray="6 4" opacity="${deLado ? 0.9 : 0.9}">${cab}${corpo}</g>`;
}

function bonecoFolha() {
  const W = 1720; const H = 1460;
  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" ${FONTE}>`;
  s += `<rect width="${W}" height="${H}" fill="#eef1f4"/>`;
  s += `<text x="28" y="44" font-size="28" font-weight="700" fill="#1b1e24">Block Strike · boneco v2 — frente, lado e costas</text>`;
  s += `<text x="28" y="70" font-size="14" fill="#4a515b">Vista ortográfica das caixas de avatar-v2.ts · tracejado vermelho = hitboxes congeladas (cabeça ±0,20; tronco e pernas ±0,25) · braços ficam fora, como hoje</text>`;
  // Linha 1: vistas grandes (variante 0 de cada time, com rifle).
  const S = 270; const chao = 640;
  const vistas = [['frente', Math.PI], ['lado', Math.PI / 2], ['costas', 0]];
  [['azul', 0], ['laranja', 0]].forEach(([time, v], t) => {
    const x0 = 20 + t * 850;
    s += `<rect x="${x0}" y="88" width="830" height="590" rx="10" fill="#dfe4e9"/>`;
    s += `<text x="${x0 + 16}" y="114" font-size="17" font-weight="700" fill="#1b1e24">Time ${time} (${time === 'azul' ? 'CT' : 'T'}) · variante 0 "${VARIANTES[v].nome}" · rifle</text>`;
    vistas.forEach(([nome, az], i) => {
      const cx = x0 + 135 + i * 275 + (nome === 'lado' ? 40 : 0);
      s += `<line x1="${cx - 120}" y1="${chao}" x2="${cx + 120}" y2="${chao}" stroke="#aab2bb" stroke-width="2"/>`;
      s += projetar(cenaBoneco(time, v, 'rifle'), camOrto(az, 0, S, cx, chao));
      s += hitboxSvg(cx, chao, S, nome === 'lado');
      s += `<text x="${cx}" y="${chao + 26}" font-size="15" fill="#4a515b" text-anchor="middle">${nome}</text>`;
    });
  });
  s += '<g transform="translate(0,30)">';
  // Linha 2: as 10 variantes em 3/4, cada uma com uma arma e um instante da caminhada.
  const armas = ['rifle', 'pistola', 'sniper', 'faca', 'miniSmg'];
  s += `<text x="28" y="690" font-size="20" font-weight="700" fill="#1b1e24">Variantes (id % 5) — azul 0..4 e laranja 0..4, vista 3/4, com armas e passos diferentes</text>`;
  ['azul', 'laranja'].forEach((time, t) => {
    for (let v = 0; v < 5; v += 1) {
      const cx = 100 + (t * 5 + v) * 168; const cy = 1010;
      s += `<rect x="${cx - 80}" y="706" width="160" height="350" rx="8" fill="#dfe4e9"/>`;
      s += projetar(cenaBoneco(time, v, armas[v], { dist: 0.25 + v * 0.3, amp: v % 2 ? 0.6 : 0 }), camOrto(Math.PI - 0.65, 0.22, 150, cx + 8, cy));
      s += `<text x="${cx}" y="1046" font-size="13" font-weight="600" fill="#1b1e24" text-anchor="middle">${time} ${v} · ${VARIANTES[v].nome}</text>`;
    }
  });
  // Linha 3: rostos ampliados. Variante 0 grande nas 4 expressões + grade das outras variantes.
  s += `<text x="28" y="1100" font-size="20" font-weight="700" fill="#1b1e24">Rosto 16×16 (desenharRosto) — neutra · foco · dano · morte</text>`;
  const rosto = (x0, y0, p, e, v) => {
    let r = '';
    desenharRosto({ fillStyle: '#000', fillRect(x, y, w, h) { r += `<rect x="${x0 + x * p}" y="${y0 + y * p}" width="${w * p}" height="${h * p}" fill="${this.fillStyle}"/>`; } }, e, VARIANTES[v]);
    return `${r}<rect x="${x0}" y="${y0}" width="${16 * p}" height="${16 * p}" fill="none" stroke="#1b1e24" stroke-width="1"/>`;
  };
  EXPRESSOES.forEach((e, i) => {
    s += rosto(28 + i * 200, 1120, 11, e, 0);
    s += `<text x="${28 + i * 200 + 88}" y="1320" font-size="16" font-weight="600" fill="#1b1e24" text-anchor="middle">${e}</text>`;
    s += `<rect x="${28 + i * 200}" y="1120" width="176" height="${11 * 4.6}" fill="#1b1e24" opacity="0.28"/>`; // faixa que o chapéu cobre
  });
  s += `<text x="28" y="1350" font-size="13" fill="#4a515b">Faixa escurecida = linhas 0..4, escondidas pelo chapéu no jogo. Variante 0 "${VARIANTES[0].nome}".</text>`;
  for (let v = 1; v < 5; v += 1) {
    const x0 = 860 + ((v - 1) % 2) * 430; const y0 = 1120 + Math.floor((v - 1) / 2) * 150;
    EXPRESSOES.forEach((e, i) => { s += rosto(x0 + i * 102, y0, 6, e, v); });
    s += `<text x="${x0}" y="${y0 + 116}" font-size="13" font-weight="600" fill="#1b1e24">variante ${v} "${VARIANTES[v].nome}" (${VARIANTES[v].acessorio})</text>`;
  }
  s += '</g>';
  return `${s}</svg>`;
}

// ───────────── saída ─────────────
const folhas = { 'armas-lado.svg': armasLado(), 'armas-primeira-pessoa.svg': primeiraPessoa(), 'boneco-folha.svg': bonecoFolha() };
for (const [nome, svg] of Object.entries(folhas)) {
  writeFileSync(join(AQUI, nome), svg);
  console.log(`${nome}: ${(svg.length / 1024).toFixed(0)} kB`);
}

if (process.argv.includes('--png')) {
  const { chromium } = createRequire(import.meta.url)('playwright');
  mkdirSync(join(AQUI, 'previa'), { recursive: true });
  const navegador = await chromium.launch();
  const pagina = await navegador.newPage();
  for (const [nome, svg] of Object.entries(folhas)) {
    const [, w, h] = svg.match(/viewBox="0 0 (\d+) (\d+)"/);
    await pagina.setViewportSize({ width: Number(w), height: Number(h) });
    await pagina.setContent(`<body style="margin:0">${svg}</body>`);
    await pagina.screenshot({ path: join(AQUI, 'previa', nome.replace('.svg', '.png')) });
  }
  await navegador.close();
  console.log('previa/*.png prontos');
}
