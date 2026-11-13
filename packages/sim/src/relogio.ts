/**
 * Block Strike — relógio de passo fixo (acumulador).
 * Módulo puro: não lê o relógio de parede. Quem chama mede o tempo real do quadro e entrega aqui.
 *
 * A simulação anda sempre em passos iguais (`1 / hz` segundos), seja qual for a taxa de quadros da tela:
 * o mesmo comando dá o mesmo resultado a 30, 60 ou 144 quadros por segundo.
 */

export interface Relogio {
  /**
   * Soma `dtReal` (segundos) ao acumulador e devolve quantos passos fixos rodar agora (`0..maxPassos`).
   * O que sobra abaixo de um passo fica guardado para a próxima chamada.
   * Acima de `maxPassos` o excedente é DESCARTADO, não vira dívida: depois de um dt enorme (aba que voltou
   * do segundo plano) a chamada seguinte volta ao ritmo normal em vez de rodar o teto de novo.
   * `dtReal` negativo, zero ou inválido (NaN) não avança nada.
   */
  avancar(dtReal: number): number;
  /** Fração `[0, 1)` do passo corrente já acumulada: quanto o quadro está entre o último passo e o próximo. */
  alfa(): number;
}

/**
 * @param hz passos de simulação por segundo (`TICK_HZ`)
 * @param maxPassos teto de passos por chamada de `avancar` (`MAX_PASSOS_POR_QUADRO`)
 */
export function criarRelogio(hz: number, maxPassos: number): Relogio {
  const passo = 1 / hz;
  let acumulado = 0; // segundos reais ainda não simulados; fica em [0, passo) entre as chamadas

  return {
    avancar(dtReal) {
      if (!(dtReal > 0)) return 0; // cobre zero, negativo e NaN
      acumulado += dtReal;
      const n = Math.floor(acumulado / passo);
      if (n > maxPassos) {
        // Atrasou mais do que o teto cobre: roda o teto e joga fora o resto inteiro (inclusive a fração),
        // porque o relógio já perdeu o compasso com o tempo real e recomeça do zero.
        acumulado = 0;
        return maxPassos;
      }
      acumulado -= n * passo;
      // O arredondamento de ponto flutuante pode deixar um resto minimamente negativo.
      if (acumulado < 0) acumulado = 0;
      return n;
    },
    alfa() {
      const fracao = acumulado / passo;
      return fracao < 1 ? fracao : 0;
    },
  };
}
