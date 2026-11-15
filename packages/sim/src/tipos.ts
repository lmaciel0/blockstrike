/**
 * Block Strike — tipos do domínio da simulação.
 * Módulo puro: só tipos, sem código em tempo de execução, sem Three.js e sem DOM.
 * Cada tipo descreve a forma que o código monta de verdade (a função de origem está no comentário).
 * Campo opcional (`?`) = o código omite o campo em algum caminho; `| null` = o campo existe e vale null.
 *
 * Eventos que o sim empilha em `eventos` (29 valores de `tipo`):
 *   mundo.ts:    pulo, pouso, passo, acerto, morte, impacto, raio, golpe, saque, recarga, tiro
 *   bomba.ts:    morte (C4, sem `assistente`), bomba-solta, bomba-pega, acao-cancelada, acao-inicio,
 *                plantada, desarmada, explosao
 *   granadas.ts: arremesso, granada-quique, fogo-apagado, molotov-ar, fogo, fogo-fim, fumaca, flash,
 *                cegueira, explosao-he, fumaca-fim
 * `tickPartida` (rounds.ts) não usa `Evento`: devolve nomes soltos (ver `EventoPartida`).
 */

// ---------- Básicos ----------

/** Ponto ou vetor em metros; y para cima. */
export interface Vec3 { x: number; y: number; z: number }

/** Ponto no chão (planta do mapa). */
export interface PontoXZ { x: number; z: number }

/** RNG determinístico de `criarRng`: cada chamada devolve um número em [0, 1). */
export type Rng = () => number;

export type Time = 'azul' | 'laranja';
/** Lado da base no mapa (`spawns`, `yawSpawn`). */
export type Lado = 'A' | 'B';
/** Bombsite. */
export type Site = 'A' | 'B';
/** 'partida': 5x5 com rounds. 'treino': só o jogador, reserva e granadas infinitas, sem rounds. */
export type Modo = 'partida' | 'treino';

// ---------- Armas e equipamento ----------

/** Armas que ocupam o slot da primária (as que a loja vende no grupo 'arma'). */
export type TipoPrimaria = 'rifle' | 'fuzil' | 'rifleS' | 'smg' | 'miniSmg' | 'smgS' | 'sniper' | 'escopeta';
/** Chaves de `ARMAS` (config.ts). 'granada' é a pseudo-arma da granada na mão. */
export type TipoArma = TipoPrimaria | 'pistola' | 'faca' | 'granada';
/** Armas que dão tiro (evento `tiro`): a faca golpeia e a granada é arremessada. */
export type TipoArmaDeFogo = TipoPrimaria | 'pistola';
/** Mesma ordem de `ORDEM_GRANADAS` (config.ts). */
export type TipoGranada = 'he' | 'molotov' | 'flash' | 'smoke';
export type Slot = 'primaria' | 'pistola' | 'faca' | 'granada';
/** `slot` do comando: um slot, 'anterior' (Q, a última arma) ou a roda do mouse. */
export type SlotPedido = Slot | 'anterior' | 'roda+' | 'roda-';
export type ParteCorpo = 'cabeca' | 'tronco' | 'pernas';
/** O que tirou a vida nos eventos `acerto` e `morte`: arma em mãos, HE ou fogo da molotov. */
export type CausaDano = TipoArmaDeFogo | 'faca' | 'he' | 'molotov';

/** `criarArma` (armas.ts). Tempos em segundos do relógio do mundo; `recuoAcum` em radianos. */
export interface Arma {
  tipo: TipoArma;
  municao: number;
  reserva: number;
  prontaEm: number;
  recarregandoAte: number; // 0 = não está recarregando
  recuoAcum: number;
  gatilhoSolto: boolean;
}

/** `criarMao` (granadas.ts): a granada na mão é uma `Arma` com o tipo escolhido e o pino. */
export interface Mao extends Arma {
  tipo: 'granada';
  sel: TipoGranada | null;
  pino: { esq: boolean; dir: boolean } | null; // botões apertados enquanto segura; null = pino no lugar
}

/** `e.armas` depois de `posicionarParaRound`. Com economia e sem primária comprada, `primaria` não existe. */
export interface ArmasEntidade {
  primaria?: Arma;
  pistola: Arma;
  faca: Arma;
  granada: Mao;
}

/** `equipVazio` (economia.ts): o que foi comprado e ainda não se perdeu. `colete` em pontos (0 a 100). */
export interface Equip {
  primaria: TipoPrimaria | null;
  colete: number;
  capacete: boolean;
  kit: boolean;
  granadas: Record<TipoGranada, number>;
}

/** Golpe da faca (`ARMAS.faca.golpes`): `costas` é o dano pelas costas do alvo. */
export interface GolpeFaca { dano: number; costas: number; intervalo: number; alcance: number }

/**
 * Entrada de `ARMAS` (config.ts). `familia`: variante conta como a arma base; `silenciador`: tiro baixo;
 * `zoomFov`/`spreadSemZoom` só no sniper; `chumbos` só na escopeta; `alcance`/`golpes` só na faca.
 */
export interface DefArma {
  nome: string;
  slot: Slot;
  familia?: TipoArma;
  silenciador?: boolean;
  vel: number;
  dano: number;
  rpm: number;
  pente: number;
  reserva: number;
  recarga: number;
  auto: boolean;
  spreadBase: number;
  spreadMov: number;
  recuo: number;
  zoomFov?: number;
  spreadSemZoom?: number;
  chumbos?: number;
  alcance?: number;
  golpes?: { leve: GolpeFaca; forte: GolpeFaca };
}

/** Estado de movimento que `calcularSpread` e `disparar` (armas.ts) leem. */
export interface EstadoTiro { velHoriz: number; velMax: number; noChao: boolean; agachado: boolean; zoom: boolean }

/** Opções de `velocidadeDe` (armas.ts); todas opcionais, padrão false. */
export interface OpcoesVelocidade { agachado?: boolean; devagar?: boolean; zoom?: boolean }

/** Desvio angular (rad) de um projétil em relação à mira (`disparar`, armas.ts). */
export interface Desvio { dx: number; dy: number }

export type GrupoItem = 'arma' | 'equip' | 'granada';
/** Chaves de `ITENS` (config.ts). */
export type IdItem = TipoPrimaria | 'colete' | 'coleteCapacete' | 'kit' | TipoGranada;
/** Entrada de `ITENS` (config.ts). */
export interface ItemLoja { nome: string; preco: number; grupo: GrupoItem }

/** Papel do time no round para a loja: CT defende (só ele compra kit), T planta a C4. */
export type Papel = 'CT' | 'T';
/** Por que `motivoNaoComprar` (economia.ts) recusa o item. */
export type MotivoCompra = 'inexistente' | 'ja-tem' | 'papel' | 'dinheiro';
/** `comprar` (economia.ts): `motivo` só existe na recusa, `item` só na compra. */
export type ResultadoCompra =
  | { ok: false; motivo: MotivoCompra; item?: undefined }
  | { ok: true; item: IdItem; motivo?: undefined };
/** `danoComColete` (economia.ts): dano que passa e pontos de colete que sobram. */
export interface DanoComColete { dano: number; colete: number }
/** Item do menu de compra (`estadoCompra`, economia.ts); `motivo` null = dá para comprar. */
export interface ItemCompra extends ItemLoja { id: IdItem; motivo: MotivoCompra | null }

// ---------- Entidade, comandos e cérebro ----------

/**
 * Como a mão virtual (`moverMao`, mao.ts) leva a mira até o alvo: mola de segunda ordem com aceleração limitada
 * e tremor. `atraso` (s) é quanto o bot demora para começar a mirar depois de ver; `firmeza` é ω (rad/s),
 * `amortecimento` é ζ (< 1 passa do ponto e corrige), `acelMax` em rad/s² e `tremor` é o desvio (rad) do yaw.
 * `previsao` em [0, 1]: fração do movimento percebido que a mão adianta (ponto = percebido + v × atraso × previsao).
 */
export interface PerfilMao {
  atraso: number; firmeza: number; amortecimento: number; acelMax: number; tremor: number; previsao: number;
}

/**
 * Estado da mão virtual (`criarMao`, mao.ts): velocidade angular (rad/s), desvio de tremor em vigor até
 * `tremorAte` e o `tempo` da última chamada (`usadaEm`; parada há mais de 0,1 s volta com velocidade 0).
 */
export interface EstadoMao {
  vYaw: number;
  vPitch: number;
  tremor: { yaw: number; pitch: number };
  tremorAte: number;
  usadaEm: number;
}

/** Onde um inimigo visto estava num instante (`registrarVistos`, percepcao.ts); a mira usa a amostra atrasada. */
export interface Amostra { id: number; t: number; pos: Vec3; agachado: boolean }

/**
 * `criarEntidade` (mundo.ts): jogador ou bot. `id` é também o índice em `mundo.entidades`.
 * Os opcionais nascem depois: `slotAnterior`/`cegoAte`/`cegoDur` em `posicionarParaRound`, `dinheiro`/`equip`
 * em `iniciarEconomia`, `kit` só com economia, `proxGranada` no primeiro arremesso e `cerebro` em quem pensa.
 */
export interface Entidade {
  id: number;
  nome: string;
  time: Time;
  bot: boolean;
  pos: Vec3; // nos pés
  velY: number;
  yaw: number;
  pitch: number;
  agachado: boolean;
  noChao: boolean;
  hp: number;
  vivo: boolean; // cai só no fim do passo; `hp <= 0` com `vivo` ainda true = morreu neste passo
  slot: Slot;
  armas: ArmasEntidade | null; // null até o primeiro `posicionarParaRound`
  primariaEscolhida: TipoPrimaria;
  kills: number;
  mortes: number;
  killsCabeca: number;
  assists: number;
  mvps: number;
  killsRound: number;
  distAndada: number;
  passoAcc: number;
  velHoriz: number;
  slotAnterior?: Slot;
  kit?: boolean;
  dinheiro?: number;
  equip?: Equip;
  proxGranada?: number;
  cegoAte?: number;
  cegoDur?: number;
  cerebro?: Cerebro;
}

/**
 * Comando de UMA entidade num passo (`comando` da entrada, `pensar` dos bots, `idle` do mundo).
 * `passo` recebe `Map<id, Comandos>`. `yaw` e `pitch` são absolutos, em radianos.
 */
export interface Comandos {
  frente: number; // -1 a 1
  lado: number; // -1 a 1
  pular: boolean;
  agachar: boolean;
  devagar: boolean;
  atirar: boolean;
  zoom: boolean;
  recarregar: boolean;
  usar: boolean; // segurar: plantar ou desarmar a C4
  granada: TipoGranada | null; // arremesso direto (bots); o jogador arremessa pela mão
  slot: SlotPedido | null;
  yaw: number;
  pitch: number;
  granadaAlvo?: Vec3; // só os bots: ponto onde o arco da granada deve cair
}

export type EstadoCerebro = 'rota' | 'combate' | 'cobertura' | 'recuo' | 'procura' | 'posto';
/** Objetivo do bot por causa da C4 (`destinoBomba`). `site:null` só se a C4 plantada estiver fora de um site. */
export type ChaveBomba = 'solta' | `site:${Site | null}` | `espera:${Site}`;

/**
 * `criarCerebro` (bots.ts): memória do bot entre um `pensar` e outro.
 * `saidaFogo`, `disparando` e `refazerEm` só aparecem depois do primeiro uso.
 */
export interface Cerebro {
  estado: EstadoCerebro;
  rota: number[]; // ids de waypoint
  alvoId: number | null;
  vistoHa: number;
  rajada: number;
  pausaAte: number;
  /** Última direção de onde veio dano (tiro, HE): `angulo` é o yaw da vítima para o atirador; nunca a posição dele. */
  ultimoDano: { angulo: number; em: number } | null;
  passoRota: number;
  ultimaPos: Vec3 | null;
  perdidoHa: number;
  esperaAte: number;
  chegou: boolean;
  cabeca: boolean;
  municaoVista: { slot: Slot; n: number } | null;
  gatilho: boolean;
  emRajada: boolean;
  preso: number;
  queriaAndar: boolean;
  recuou: boolean;
  ouvidoEm: number; // começa em -Infinity
  ouvidoAte: number;
  ouvidoPos: PontoXZ | null;
  chaveBomba: ChaveBomba | null;
  proxGranada: number;
  cegoVisto: number;
  casaZ: 0 | 1; // metade do mapa onde nasceu no round: 0 = z >= 0
  desvioMira: number;
  desencalhes: number; // quantas vezes `PRESO_TEMPO` disparou em `seguirRota` (só para métricas)
  /** Desencalhou andando no `direto` da C4: segue a rota até o fim antes de andar reto de novo. */
  semDireto?: boolean;
  /** Onde cada inimigo visto estava (`registrarVistos`); a mira usa a amostra de `mao.atraso` s atrás. */
  percepcao: Amostra[];
  /** Mão virtual do bot: mira, olhar para o ruído e olhar para o dano dividem a mesma (a velocidade continua). */
  mao: EstadoMao;
  saidaFogo?: { alvo: Vec3; ate: number } | null;
  disparando?: boolean;
  refazerEm?: number;
}

/**
 * Entrada de `DIFICULDADE` (config.ts). Só a fácil tem `alturaTronco`. `reacao` (s, sempre >= `mao.atraso`) segura
 * o gatilho desde que viu; `toleranciaTiro` (rad) é o quanto a mira real pode estar longe do ponto percebido no tiro.
 */
export interface Dificuldade {
  reacao: number;
  chanceCabeca: number;
  alturaTronco?: number;
  toleranciaTiro: number;
  mao: PerfilMao;
}
export type NomeDificuldade = 'facil' | 'medio' | 'dificil';

// ---------- C4 e partida ----------

export type TipoAcaoBomba = 'plantar' | 'desarmar';
/** Plantio ou desarme em andamento: `t` segundos de `dur`. */
export interface AcaoBomba { tipo: TipoAcaoBomba; id: number; t: number; dur: number }

/** `agindo` de `tickBomba`: id da entidade que segura a tecla de uso → ação que ela faz. */
export type Agindo = Map<number, TipoAcaoBomba>;

/** `criarBomba` (bomba.ts). `pos` existe com a C4 solta no chão ou plantada; no portador é null. */
export interface Bomba {
  terroristas: Time;
  portador: number | null;
  pos: Vec3 | null;
  siteAlvo: Site;
  site: Site | null;
  plantada: boolean;
  explodiu: boolean;
  desarmada: boolean;
  restante: number;
  plantador: number | null;
  desarmador: number | null;
  acao: AcaoBomba | null;
}

export type FasePartida = 'freeze' | 'jogo' | 'fim-round' | 'fim-partida';
export type MotivoFimRound = 'eliminacao' | 'tempo' | 'bomba-explodiu' | 'bomba-desarmada';
/** Nomes que `tickPartida` devolve (strings soltas, não objetos `Evento`). */
export type EventoPartida = 'inicio-round' | 'fim-round' | 'novo-round' | 'troca-lados' | 'fim-partida';

/** Opções de `criarPartida` (rounds.ts): `freeze` em segundos. */
export interface OpcoesPartida { freeze: number }

/** Vivos de um time para `tickPartida`: quantos e o HP somado. */
export interface VivosTime { n: number; hp: number }
/** O que `tickPartida` e `vencedorPorTempo` (rounds.ts) leem de cada time. */
export type Vivos = Record<Time, VivosTime>;

/** O que `tickPartida` lê da C4: `Bomba` já satisfaz. */
export type EstadoBomba = Pick<Bomba, 'plantada' | 'explodiu' | 'desarmada'>;

/** `criarPartida` (rounds.ts). `vencedorRound`: undefined = round em aberto; null = round sem vencedor. */
export interface Partida {
  freeze: number;
  derrotasSeguidas: { azul: number; laranja: number };
  placar: { azul: number; laranja: number };
  terroristas: Time;
  round: number;
  fase: FasePartida;
  tempo: number;
  vencedorRound: Time | null | undefined;
  motivo: MotivoFimRound | null;
  resultado: Time | 'empate' | null;
}

// ---------- Mapa ----------

/** Bloco do mapa (`caixa` em mapa.ts). `cor` é só para o desenho. */
export interface Caixa { min: Vec3; max: Vec3; cor: number | string }

// ---------- Física ----------

/** O que a física lê de uma entidade (hitboxes, raycast e olho); `Entidade` já satisfaz. */
export type AlvoFisico = Pick<Entidade, 'id' | 'pos' | 'agachado' | 'vivo'>;

/** Hitbox de uma parte do corpo (`hitboxes`, fisica.ts). */
export interface HitboxParte { parte: ParteCorpo; min: Vec3; max: Vec3 }

/** Acerto de `raycastCaixas`: `normal` aponta contra o raio (um eixo vale -1 ou 1). */
export interface ImpactoCaixa { dist: number; ponto: Vec3; normal: Vec3 }

/** Acerto de `raycastEntidades`. */
export interface AcertoEntidade<E extends AlvoFisico = Entidade> { ent: E; parte: ParteCorpo; dist: number; ponto: Vec3 }

/** Resultado de `moverComColisao`. */
export interface ResultadoMovimento { pos: Vec3; noChao: boolean; bateuTeto: boolean }

/** Nó do grafo de navegação; `id` é o índice em `mapa.waypoints`. `cobertura` só existe nos que são. */
export interface Waypoint { id: number; x: number; z: number; cobertura?: boolean }

/** Aresta de saída de um nó do `Grafo`: `custo` é a distância em xz. */
export interface Vizinho { id: number; custo: number }

/** `criarGrafo` (navegacao.ts): `nos` são os waypoints (índice === id); `vizinhos[id]` as arestas, nos dois sentidos. */
export interface Grafo { nos: Waypoint[]; vizinhos: Vizinho[][] }

/** Bombsite: retângulo no chão e os waypoints ligados a ele ([metade z>0, metade z<0] em `espera` e `mira`). */
export interface Bombsite {
  min: PontoXZ;
  max: PontoXZ;
  centro: PontoXZ;
  waypoint: number;
  espera: [number, number];
  mira: [PontoXZ, PontoXZ];
  rotas: [number, number];
}

/** `MAPA` (mapa.ts). */
export interface Mapa {
  caixas: Caixa[];
  spawns: Record<Lado, Vec3[]>;
  yawSpawn: Record<Lado, number>;
  waypoints: Waypoint[];
  arestas: [number, number][];
  bombsites: Record<Site, Bombsite>;
  ceu: number;
  neblina: [number, number];
}

// ---------- Granadas no mundo ----------

/** Força do arremesso (`GRANADA.forcas` em config.ts): o curto sai 0,3 m mais baixo. */
export type ForcaGranada = 'longe' | 'medio' | 'curto';

/** Aplica o dano da HE e do fogo (`atualizarGranadas` em granadas.ts; o `mundo` usa o mesmo cálculo dos tiros). */
export type DanoDireto = (dono: Entidade, alvo: Entidade, dano: number, tipoArma: CausaDano, eventos: Evento[]) => void;

/** Granada em voo (`lancar` em granadas.ts). */
export interface GranadaNoAr {
  tipo: TipoGranada;
  dono: number;
  time: Time;
  nasceEm: number;
  fusivel: number;
  pos: Vec3;
  vel: Vec3;
  quiques: number;
}

/** Bloco da nuvem de smoke: some com tiro (`vivo` false) e volta em `voltaEm`. */
export interface CuboFumaca extends Vec3 { vivo: boolean; voltaEm: number; atraso: number }

/** `criarFumaca` (granadas.ts). `versao` sobe a cada bloco que some ou volta. */
export interface Fumaca {
  pos: Vec3;
  raio: number;
  cubo: number;
  cubos: CuboFumaca[];
  nasceEm: number;
  fim: number;
  versao: number;
}

export interface CelulaFogo { x: number; z: number; atraso: number }

/** `criarFogo` (granadas.ts): poça de fogo da molotov. */
export interface Fogo {
  pos: Vec3;
  y: number;
  raio: number;
  celula: number;
  celulas: CelulaFogo[];
  dono: number;
  time: Time;
  nasceEm: number;
  fim: number;
  proxDano: number;
}

// ---------- Mundo ----------

/** Barulho que os bots ouvem (`registrarRuidos`). `alcance` só nos tiros; passo e pouso usam o padrão do ouvido. */
export interface Ruido { id: number; time: Time; x: number; z: number; em: number; alcance?: number }

/** Dano do round de um atacante numa vítima (`registrarDano`). */
export interface RegistroDano { dano: number; acertos: number }

/** `criarMundo` (mundo.ts). `economia` só existe (true) depois de `iniciarEconomia`. */
export interface Mundo {
  mapa: Mapa;
  entidades: Entidade[];
  jogadorId: number;
  tempo: number;
  dificuldade: Dificuldade | NomeDificuldade;
  rng: Rng;
  modo: Modo;
  ruidos: Ruido[];
  bomba: Bomba | null;
  granadas: GranadaNoAr[];
  fumacas: Fumaca[];
  fogos: Fogo[];
  danos: Map<string, RegistroDano>; // chave `de>para`
  economia?: boolean;
}

/** Entrada de `criarMundo` (mundo.ts). `modo` omitido = 'partida'. */
export interface OpcoesMundo {
  mapa: Mapa;
  primariaJogador: TipoPrimaria;
  dificuldade: Dificuldade | NomeDificuldade;
  rng: Rng;
  modo?: Modo;
}

/** Opções de `passo` (mundo.ts): `congelado` padrão false, `comBomba` padrão true. */
export interface OpcoesPasso { congelado?: boolean; comBomba?: boolean }

/** O que `aplicarDano` (mundo.ts) lê de um golpe: o raycast traz `dist` também, o dano direto da granada não. */
export type Golpe = Pick<AcertoEntidade, 'ent' | 'parte' | 'ponto'>;

/** Linha de `relatorioDano` (mundo.ts): um inimigo com quem `id` trocou dano no round. */
export interface LinhaDano {
  id: number;
  nome: string;
  time: Time;
  vivo: boolean;
  deu: RegistroDano;
  levou: RegistroDano;
}

/** `registrarMvp` (mundo.ts): `kills` e `dano` só existem quando o MVP veio dos abates. */
export type Mvp =
  | { id: number; motivo: 'desarmou' | 'plantou'; kills?: undefined; dano?: undefined }
  | { id: number; motivo: 'abates'; kills: number; dano: number };

// ---------- Eventos ----------

/**
 * Tudo que `passo` devolve, discriminado por `tipo`. Ids são de entidade.
 * `morte`: a do tiro, faca, HE e fogo tem `assassino` e `assistente` (id ou null);
 * a da explosão da C4 tem `assassino: null`, `arma: 'c4'` e não tem o campo `assistente`.
 */
export type Evento =
  | { tipo: 'pulo'; id: number }
  | { tipo: 'pouso'; id: number }
  | { tipo: 'passo'; id: number }
  | {
    tipo: 'acerto'; atirador: number; alvo: number; arma: CausaDano; parte: ParteCorpo;
    dano: number; ponto: Vec3; capacete: boolean;
  }
  | {
    tipo: 'morte'; vitima: number; assassino: number | null; assistente?: number | null;
    arma: CausaDano | 'c4'; cabeca: boolean;
  }
  | { tipo: 'impacto'; ponto: Vec3; normal: Vec3 }
  | { tipo: 'raio'; atirador: number; de: Vec3; ate: Vec3 }
  | { tipo: 'golpe'; atirador: number; forte: boolean; acerto: 'corpo' | 'parede' | null; costas: boolean }
  | { tipo: 'saque'; id: number; arma: TipoArma }
  | { tipo: 'recarga'; atirador: number }
  | { tipo: 'tiro'; atirador: number; arma: TipoArmaDeFogo }
  | { tipo: 'bomba-solta'; ponto: Vec3 }
  | { tipo: 'bomba-pega'; id: number }
  | { tipo: 'acao-cancelada'; id: number }
  | { tipo: 'acao-inicio'; id: number; acao: TipoAcaoBomba }
  | { tipo: 'plantada'; id: number; site: Site | null; ponto: Vec3 }
  | { tipo: 'desarmada'; id: number }
  | { tipo: 'explosao'; ponto: Vec3 }
  | { tipo: 'arremesso'; atirador: number; granada: TipoGranada; ponto: Vec3 }
  | { tipo: 'granada-quique'; granada: TipoGranada; ponto: Vec3 }
  | { tipo: 'fogo-apagado'; ponto: Vec3 }
  | { tipo: 'molotov-ar'; ponto: Vec3 }
  | { tipo: 'fogo'; ponto: Vec3; fogo: Fogo }
  | { tipo: 'fogo-fim'; ponto: Vec3 }
  | { tipo: 'fumaca'; ponto: Vec3; fumaca: Fumaca }
  | { tipo: 'flash'; ponto: Vec3 }
  | { tipo: 'cegueira'; id: number; dur: number; atirador: number }
  | { tipo: 'explosao-he'; ponto: Vec3 }
  | { tipo: 'fumaca-fim'; fumaca: Fumaca };
