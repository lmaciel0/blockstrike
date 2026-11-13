/**
 * Block Strike — mira configurável (Crosshair Lab): estilo, tamanho, espessura, abertura, ponto e cor.
 * Módulo puro: valida o que vem do storage; o desenho é CSS (ver `.bs-mira` em blockstrike.css).
 */

export type EstiloMira = 'dinamica' | 'estatica' | 'classica' | 'ponto';

export interface Mira {
  estilo: EstiloMira;
  tamanho: number;
  espessura: number;
  abertura: number;
  ponto: boolean;
  cor: string;
}

export const ESTILOS_MIRA: ReadonlyArray<readonly [EstiloMira, string]> = [
  ['dinamica', 'Dinâmica'], ['estatica', 'Estática'], ['classica', 'Aberta clássica'], ['ponto', 'Só o ponto'],
];
// Limites dos sliders em px: [mínimo, máximo, passo].
export const LIMITES_MIRA = {
  tamanho: [2, 20, 1], espessura: [1, 6, 1], abertura: [0, 14, 1],
} as const satisfies Record<string, readonly [number, number, number]>;
export const MIRA_PADRAO: Mira = { estilo: 'dinamica', tamanho: 8, espessura: 2, abertura: 4, ponto: false, cor: '#4ade80' };
// Aberta clássica: a estática com um vão largo e fixo no meio.
const ABERTURA_CLASSICA = 6;
const COR = /^#[0-9a-f]{6}$/i;

const inteiro = (v: unknown, [min, max]: readonly number[], padrao: number): number => (typeof v === 'number' && Number.isFinite(v) ? Math.max(min, Math.min(max, Math.round(v))) : padrao);

// `bruto` é o objeto salvo (ou lixo); `corLegada` é a cor da versão antiga, que só tinha 5 cores fixas.
export function lerMira(bruto: unknown, corLegada?: string): Mira {
  const b = bruto && typeof bruto === 'object' ? (bruto as Record<string, unknown>) : {};
  const cor = [b.cor, corLegada].find((c): c is string => typeof c === 'string' && COR.test(c)) ?? MIRA_PADRAO.cor;
  const estilo = ESTILOS_MIRA.find(([v]) => v === b.estilo)?.[0];
  return {
    estilo: estilo ?? MIRA_PADRAO.estilo,
    tamanho: inteiro(b.tamanho, LIMITES_MIRA.tamanho, MIRA_PADRAO.tamanho),
    espessura: inteiro(b.espessura, LIMITES_MIRA.espessura, MIRA_PADRAO.espessura),
    abertura: inteiro(b.abertura, LIMITES_MIRA.abertura, MIRA_PADRAO.abertura),
    ponto: typeof b.ponto === 'boolean' ? b.ponto : MIRA_PADRAO.ponto,
    cor: cor.toLowerCase(),
  };
}

// Vão do centro até cada braço (px): a dinâmica soma o spread da arma; as outras ficam paradas.
export function aberturaMira(mira: Mira, extraSpread: number): number {
  if (mira.estilo === 'classica') return mira.abertura + ABERTURA_CLASSICA;
  return mira.abertura + (mira.estilo === 'dinamica' ? extraSpread : 0);
}
