/**
 * Mão virtual — leva o yaw/pitch do bot até o alvo como uma mão humana: controlador de segunda ordem
 * (mola e amortecedor) com aceleração limitada e tremor. A mira acelera, freia, passa do ponto e corrige.
 * Módulo puro: o único acaso é o `rng` recebido.
 */

import { angulo } from './fisica.js';
import { gauss } from './rng.js';
import type { EstadoMao, PerfilMao, Rng } from './tipos.js';

/** Parada há mais que isso (s), a mão volta com velocidade 0. */
const PARADA = 0.1;
/** De quanto em quanto tempo (s) o tremor sorteia um desvio novo. */
const TROCA_TREMOR = 0.1;
/** O tremor do pitch é esta fração do yaw. */
const TREMOR_PITCH = 0.5;
/** Subpasso máximo (s) da integração: estável mesmo com dt de 0,05. */
const SUBPASSO = 1 / 120;

interface Angulos { yaw: number; pitch: number }

/** Mão parada, sem tremor sorteado e nunca usada. */
export function criarMao(): EstadoMao {
  return { vYaw: 0, vPitch: 0, tremor: { yaw: 0, pitch: 0 }, tremorAte: 0, usadaEm: -Infinity };
}

/**
 * Um passo de `dt` segundos da mão de `atual` em direção a `alvo` (+ tremor), no instante `tempo`.
 * Mexe em `m` (velocidade, tremor, `usadaEm`) e devolve o novo yaw/pitch. O yaw vai pelo menor caminho e não é
 * normalizado (como o giro antigo dos bots); o pitch não é limitado aqui.
 */
export function moverMao(
  atual: Angulos, alvo: Angulos, m: EstadoMao, perfil: PerfilMao, tempo: number, dt: number, rng: Rng,
): Angulos {
  if (tempo - m.usadaEm > PARADA) {
    m.vYaw = 0;
    m.vPitch = 0;
  }
  if (tempo >= m.tremorAte) {
    // Ordem fixa dos sorteios (yaw, depois pitch): o determinismo da partida depende dela.
    const yaw = gauss(rng) * perfil.tremor;
    const pitch = gauss(rng) * perfil.tremor * TREMOR_PITCH;
    m.tremor = { yaw, pitch };
    m.tremorAte = tempo + TROCA_TREMOR;
  }
  const alvoYaw = alvo.yaw + m.tremor.yaw;
  const alvoPitch = alvo.pitch + m.tremor.pitch;
  const w = perfil.firmeza;
  const k = w * w;
  const c = 2 * perfil.amortecimento * w;
  const max = perfil.acelMax;
  const acel = (e: number, v: number): number => Math.max(-max, Math.min(max, k * e - c * v));

  // O −1e-9 evita um subpasso a mais quando dt·120 sai 2,0000000000000004 em ponto flutuante.
  const n = Math.max(1, Math.ceil(dt / SUBPASSO - 1e-9));
  const h = dt / n;
  let { yaw, pitch } = atual;
  for (let i = 0; i < n; i++) {
    // Euler semi-implícito: velocidade primeiro, depois o ângulo com a velocidade nova.
    m.vYaw += acel(angulo(alvoYaw - yaw), m.vYaw) * h;
    yaw += m.vYaw * h;
    m.vPitch += acel(alvoPitch - pitch, m.vPitch) * h;
    pitch += m.vPitch * h;
  }
  m.usadaEm = tempo;
  return { yaw, pitch };
}
