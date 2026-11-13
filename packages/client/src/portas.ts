/**
 * Portas do cliente: tudo o que vinha do contexto de montagem do hub
 * (áudio, persistência, confete) entra por aqui, para o jogo não tocar em globais.
 */

export interface AudioPort {
  /** Pode devolver `null` (sem áudio disponível ou contexto ainda não liberado). */
  contexto(): AudioContext | null;
}

export interface StoragePort {
  get<T>(chave: string, padrao: T): T;
  set(chave: string, valor: unknown): void;
}

export interface Portas {
  audio: AudioPort;
  storage: StoragePort;
  confetti: () => void;
}

// JSON válido de tipo errado (ex.: "abc" onde se espera número) conta como corrompido.
function tipoValido(valor: unknown, padrao: unknown): boolean {
  if (valor === null) return false;
  if (typeof valor === 'number' && !Number.isFinite(valor)) return false;
  return padrao === null || typeof valor === typeof padrao;
}

/** `localStorage` pode lançar só de ser acessado (modo privado, política de cookies). */
function backendPadrao(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/**
 * Persistência em `localStorage` com chaves `<prefixo><chave>`.
 * Nunca lança: se o backend falhar (bloqueado, cota cheia), o valor fica só em memória
 * durante a sessão. Valor corrompido ou de tipo diferente do `padrao` volta como `padrao`.
 */
export function criarStorage(prefixo: string, backend?: Storage): StoragePort {
  const ls = backend ?? backendPadrao();
  // Guarda o JSON serializado, para a leitura da memória passar pela mesma validação.
  const memoria = new Map<string, string>();
  // Chaves cujo último `setItem` falhou: o backend pode ter valor antigo, então a memória manda.
  const memoriaManda = new Set<string>();

  function lerBruto(chaveCompleta: string): string | null {
    if (ls && !memoriaManda.has(chaveCompleta)) {
      try {
        const bruto = ls.getItem(chaveCompleta);
        if (bruto !== null) return bruto;
      } catch {
        // backend bloqueado: cai para a memória
      }
    }
    return memoria.get(chaveCompleta) ?? null;
  }

  return {
    get<T>(chave: string, padrao: T): T {
      const bruto = lerBruto(prefixo + chave);
      if (bruto === null) return padrao;
      try {
        const valor: unknown = JSON.parse(bruto);
        return tipoValido(valor, padrao) ? (valor as T) : padrao;
      } catch {
        return padrao;
      }
    },
    set(chave: string, valor: unknown): void {
      let json: string | undefined;
      try {
        json = JSON.stringify(valor);
      } catch {
        return; // circular, BigInt etc.: não dá para persistir
      }
      if (json === undefined) return; // undefined/função/símbolo
      const chaveCompleta = prefixo + chave;
      memoria.set(chaveCompleta, json);
      if (!ls) return;
      try {
        ls.setItem(chaveCompleta, json);
        memoriaManda.delete(chaveCompleta);
      } catch {
        // cota cheia ou bloqueado: a memória já tem o valor e passa a valer mais que o backend
        memoriaManda.add(chaveCompleta);
      }
    },
  };
}
