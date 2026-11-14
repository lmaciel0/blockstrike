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
