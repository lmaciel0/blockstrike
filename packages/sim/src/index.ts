/**
 * Block Strike — API pública da simulação (`@blockstrike/sim`).
 * O cliente (e depois o servidor) importa só daqui, nunca de arquivo interno do pacote.
 * O que não está nesta lista é detalhe interno: pode mudar sem aviso. A lista é conferida em `test/index.test.ts`.
 */

// Todos os tipos do domínio (`Mundo`, `Entidade`, `Evento`, `Comandos`...).
export type * from './tipos.js';

// Dados do jogo: constantes de balanceamento, armas, loja e dificuldades.
export {
  ARMAS, BOMBA, COLETE, DIFICULDADE, ECONOMIA, FOV_PADRAO, GRANADA, ITENS, JOGADOR, MAX_GRANADAS, MULT_PARTE,
  NOMES_BOTS, ORDEM_GRANADAS, RECUO_MAX, ROUND, familia,
} from './config.js';

// Passo fixo: taxa da simulação, duração de um passo, teto de passos por quadro e o relógio que os conta.
export { DT_SIM, MAX_PASSOS_POR_QUADRO, TICK_HZ } from './config.js';
export { criarRelogio } from './relogio.js';
export type { Relogio } from './relogio.js';

// Acaso com seed e o mapa.
export { criarRng } from './rng.js';
export { MAPA } from './mapa.js';

// Geometria que a câmera, o HUD e as ferramentas leem.
export { olho, direcao, temVisada } from './fisica.js';

// Armas: estado, espalhamento da mira, velocidade de quem a segura e tempo de saque.
export { criarArma, calcularSpread, velocidadeDe, SAQUE } from './armas.js';

// Bots: grafo de navegação, cérebro e a decisão de cada passo.
export { criarGrafo } from './navegacao.js';
export { criarCerebro, pensar } from './bots.js';

// Partida: rounds, lados e a C4.
export { criarPartida, ladoAzul, terroristasDe, tickPartida } from './rounds.js';
export { criarBomba, acaoPossivel, siteEm } from './bomba.js';

// Economia: dinheiro, prêmios e loja.
export {
  iniciarEconomia, resetarEconomia, premiarRound, botComprar, comprar, estadoCompra, motivoNaoComprar,
} from './economia.js';

// Granadas: o que a tela consulta (linha de visão pela fumaça e estoque).
export { visadaLivre, granadasDe } from './granadas.js';

// Mundo: criação, o passo da simulação e os relatórios do round.
export { criarMundo, posicionarParaRound, passo, vivosPorTime, relatorioDano, registrarMvp } from './mundo.js';
