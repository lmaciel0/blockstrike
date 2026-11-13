/**
 * Block Strike — estado e regras das armas (cadência, recarga, spread e recuo).
 * Módulo puro: sem Three.js e sem DOM. Tempo em segundos; ângulos em radianos.
 */

import { ARMAS, JOGADOR, MULT_PARTE, RECUO_MAX } from './config.js';
import type {
  Arma, DefArma, Desvio, EstadoTiro, OpcoesVelocidade, ParteCorpo, Rng, Slot, TipoArma,
} from './tipos.js';

const RECUO_VOLTA = 0.1; // rad/s, enquanto o gatilho está solto
const FATOR_AGACHADO = 0.6;

export function criarArma(tipo: TipoArma): Arma {
  const def = ARMAS[tipo];
  return {
    tipo, municao: def.pente, reserva: def.reserva,
    prontaEm: 0, recarregandoAte: 0, recuoAcum: 0, gatilhoSolto: true,
  };
}

// Velocidade (m/s) com a arma na mão: a faca é a mais rápida; luneta aberta, Shift e agachar freiam.
export function velocidadeDe(
  tipo: TipoArma | undefined,
  { agachado = false, devagar = false, zoom = false }: OpcoesVelocidade = {},
): number {
  // `tipo` fica undefined quando a entidade ainda não tem arma (ARMAS[undefined] já dava undefined).
  const def: DefArma | undefined = tipo === undefined ? undefined : ARMAS[tipo];
  let v = def?.vel ?? JOGADOR.velCorrer;
  if (zoom && def?.zoomFov) v *= JOGADOR.fatorZoom;
  if (agachado) return v * JOGADOR.fatorAgachado;
  if (devagar) return v * JOGADOR.fatorDevagar;
  return v;
}

// Tempo (s) para sacar a arma depois da troca: só então ela atira.
export const SAQUE: Record<Slot, number> = { primaria: 0.5, pistola: 0.3, faca: 0.15, granada: 0.3 };

export function danoDe(tipo: TipoArma, parte: ParteCorpo): number {
  return Math.round(ARMAS[tipo].dano * MULT_PARTE[parte]);
}

export function podeAtirar(arma: Arma, agora: number, gatilho: boolean): boolean {
  if (!gatilho) return false;
  if (arma.recarregandoAte > 0) return false;
  if (arma.municao <= 0) return false;
  if (agora < arma.prontaEm) return false;
  if (!ARMAS[arma.tipo].auto && !arma.gatilhoSolto) return false;
  return true;
}

// Cone de erro (rad) para o estado de movimento atual.
export function calcularSpread(def: DefArma, { velHoriz, velMax, noChao, agachado, zoom }: EstadoTiro): number {
  const base = def.spreadSemZoom !== undefined && !zoom ? def.spreadSemZoom : def.spreadBase;
  let s = base + (velHoriz / velMax) * def.spreadMov;
  if (agachado) s *= FATOR_AGACHADO;
  if (!noChao) s += 2 * def.spreadMov;
  return s;
}

export function disparar(arma: Arma, agora: number, estado: EstadoTiro, rng: Rng): Desvio[] {
  const def = ARMAS[arma.tipo];
  arma.municao -= 1;
  arma.prontaEm = agora + 60 / def.rpm;
  arma.recuoAcum = Math.min(RECUO_MAX, arma.recuoAcum + def.recuo);
  arma.gatilhoSolto = false;
  const spread = calcularSpread(def, estado);
  const desvios: Desvio[] = [];
  for (let i = 0; i < (def.chumbos ?? 1); i++) {
    desvios.push({
      dx: (rng() * 2 - 1) * spread,
      dy: (rng() * 2 - 1) * spread + arma.recuoAcum, // recuo sobe a mira (pitch + é para cima)
    });
  }
  return desvios;
}

export function iniciarRecarga(arma: Arma, agora: number): boolean {
  const def = ARMAS[arma.tipo];
  if (arma.recarregandoAte > 0 || arma.municao >= def.pente || arma.reserva <= 0) return false;
  arma.recarregandoAte = agora + def.recarga;
  return true;
}

export function atualizarArma(arma: Arma, agora: number, dt: number, gatilho: boolean): void {
  arma.gatilhoSolto = !gatilho;
  if (!gatilho) arma.recuoAcum = Math.max(0, arma.recuoAcum - RECUO_VOLTA * dt);
  if (arma.recarregandoAte > 0 && agora >= arma.recarregandoAte) {
    const levar = Math.min(ARMAS[arma.tipo].pente - arma.municao, arma.reserva);
    arma.municao += levar;
    arma.reserva -= levar;
    arma.recarregandoAte = 0;
  }
  if (gatilho && arma.municao <= 0) iniciarRecarga(arma, agora);
}
