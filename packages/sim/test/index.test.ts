import { expect, test } from 'vitest';
import * as sim from '@blockstrike/sim';
import type { Comandos, Evento, Mundo } from '@blockstrike/sim';
import { passo as passoInterno } from '../src/mundo.js';

// API pública da simulação: o cliente (e depois o servidor) importa só de `@blockstrike/sim`, nunca de
// arquivo interno. Mudou a lista? É mudança de contrato: confira quem consome antes de ajustar aqui.
const PUBLICO = [
  // config
  'ARMAS', 'BOMBA', 'COLETE', 'DIFICULDADE', 'ECONOMIA', 'FOV_PADRAO', 'GRANADA', 'ITENS', 'JOGADOR',
  'MAX_GRANADAS', 'MULT_PARTE', 'NOMES_BOTS', 'ORDEM_GRANADAS', 'RECUO_MAX', 'ROUND', 'familia',
  // passo fixo: config e relogio
  'DT_SIM', 'MAX_PASSOS_POR_QUADRO', 'TICK_HZ', 'criarRelogio',
  // rng, mapa
  'criarRng', 'MAPA',
  // fisica
  'olho', 'direcao', 'temVisada',
  // armas
  'criarArma', 'calcularSpread', 'velocidadeDe', 'SAQUE',
  // navegacao, bots
  'criarGrafo', 'criarCerebro', 'pensar',
  // percepcao
  'JANELA_PERCEPCAO', 'percebido', 'registrarVistos', 'velocidadePercebida',
  // mao
  'criarMao', 'moverMao',
  // rounds
  'criarPartida', 'ladoAzul', 'terroristasDe', 'tickPartida',
  // bomba
  'criarBomba', 'acaoPossivel', 'siteEm',
  // economia
  'iniciarEconomia', 'resetarEconomia', 'premiarRound', 'botComprar', 'comprar', 'estadoCompra', 'motivoNaoComprar',
  // granadas
  'visadaLivre', 'granadasDe',
  // mundo
  'criarMundo', 'posicionarParaRound', 'passo', 'vivosPorTime', 'relatorioDano', 'registrarMvp',
];

test('o barrel exporta exatamente a API pública', () => {
  expect(Object.keys(sim).sort()).toStrictEqual([...PUBLICO].sort());
});

test('o barrel reexporta o mesmo objeto do módulo interno (não uma cópia)', () => {
  expect(sim.passo).toBe(passoInterno);
});

test('dá para rodar um passo só com o que o barrel exporta, tipos inclusive', () => {
  const mundo: Mundo = sim.criarMundo({
    mapa: sim.MAPA, primariaJogador: 'rifle', dificuldade: 'medio', rng: sim.criarRng(1),
  });
  sim.posicionarParaRound(mundo, 'A');
  const eventos: Evento[] = sim.passo(mundo, 0.05, new Map<number, Comandos>());
  expect(Array.isArray(eventos)).toBe(true);
  expect(sim.vivosPorTime(mundo)).toStrictEqual({ azul: { n: 5, hp: 500 }, laranja: { n: 5, hp: 500 } });
});
