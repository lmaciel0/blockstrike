import type { Amostra, Entidade } from './tipos.js';

/** Quanto tempo (s) as amostras ficam guardadas; precisa cobrir o maior atraso de percepção. */
export const JANELA_PERCEPCAO = 2;

/**
 * Guarda onde cada inimigo visto está agora (uma amostra por visto, com cópia de `pos`) e descarta, in place,
 * as de `t < tempo - janela`. Array simples, não `Map`: o cérebro continua serializável.
 */
export function registrarVistos(
  amostras: Amostra[],
  vistos: readonly Pick<Entidade, 'id' | 'pos' | 'agachado'>[],
  tempo: number,
  janela: number,
): void {
  for (const v of vistos) {
    amostras.push({ id: v.id, t: tempo, pos: { x: v.pos.x, y: v.pos.y, z: v.pos.z }, agachado: v.agachado });
  }
  const corte = tempo - janela;
  let k = 0;
  for (const a of amostras) if (a.t >= corte) amostras[k++] = a;
  amostras.length = k;
}

/**
 * Onde o inimigo `id` estava `atraso` segundos atrás: a amostra mais recente com `t <= tempo - atraso`.
 * `null` se ainda não passou o atraso desde que o viram, ou se nunca o viram. Quem sumiu da vista
 * mantém a última amostra (até a janela podar).
 */
export function percebido(amostras: readonly Amostra[], id: number, tempo: number, atraso: number): Amostra | null {
  const limite = tempo - atraso;
  let melhor: Amostra | null = null;
  for (const a of amostras) {
    if (a.id === id && a.t <= limite && (melhor === null || a.t > melhor.t)) melhor = a;
  }
  return melhor;
}

/** Base padrão (s) entre as duas amostras da velocidade percebida, e a folga além dela que conta como lacuna. */
const BASE_VELOCIDADE = 0.1;
const FOLGA_LACUNA = 0.05;

/**
 * Velocidade (m/s, plano XZ) com que o inimigo `id` andava quando foi percebido: Δpos/Δt entre a amostra
 * percebida p (`percebido(...)`) e a mais recente com `t <= p.t - base`. {0,0} sem p, sem amostra anterior ou se
 * o par atravessa uma lacuna de visada (Δt > base + 0,05). Escondido: p e a anterior não mudam, então a
 * velocidade fica constante (nunca extrapola pelo tempo desde que sumiu).
 */
export function velocidadePercebida(
  amostras: readonly Amostra[], id: number, tempo: number, atraso: number, base = BASE_VELOCIDADE,
): { x: number; z: number } {
  const p = percebido(amostras, id, tempo, atraso);
  const q = p ? percebido(amostras, id, p.t, base) : null;
  if (!p || !q) return { x: 0, z: 0 };
  const dt = p.t - q.t;
  if (dt <= 0 || dt > base + FOLGA_LACUNA) return { x: 0, z: 0 };
  return { x: (p.pos.x - q.pos.x) / dt, z: (p.pos.z - q.pos.z) / dt };
}
