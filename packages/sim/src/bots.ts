/**
 * Block Strike — cérebro dos bots: rota, combate, cobertura, recuo e dificuldade.
 * Módulo puro: sem Three.js e sem DOM. Unidades em metros e segundos; ângulos em radianos.
 * `pensar` devolve o mesmo Comando que a entrada do jogador (yaw/pitch absolutos).
 */

import { ARMAS, BOMBA, DIFICULDADE, RECUO_MAX, familia } from './config.js';
import { PITCH_MAX, angulo, olho, direcao, temVisada } from './fisica.js';
import { criarMao, moverMao } from './mao.js';
import { JANELA_PERCEPCAO, percebido, registrarVistos, velocidadePercebida } from './percepcao.js';
import { caminho, maisProximo, coberturaPerto } from './navegacao.js';
import { siteEm } from './bomba.js';
import { noFogo, visadaLivre } from './granadas.js';
import type {
  Amostra, Arma, Bombsite, Caixa, Cerebro, ChaveBomba, Comandos, Dificuldade, Entidade, EstadoCerebro, Fogo, Grafo, Mapa, Mundo,
  NomeDificuldade, PerfilMao, PontoXZ, Rng, Ruido, Site, TipoArma, TipoGranada, TipoPrimaria, Vec3, Waypoint,
} from './tipos.js';

const ALCANCE_VISAO = 60;
const MEIO_CONE = (110 / 2) * (Math.PI / 180);
const VISAO_360 = 3;
const GIRO_MAX = 8; // rad/s
const PERDER_ALVO = 1; // s sem visada até voltar para a rota
const CHEGOU = 0.8; // m até o waypoint contar como alcançado
const STRAFE_TROCA = 0.6;
const HP_RECUO = 30;
const PRESO_TEMPO = 1;
const ESPERA_COBERTURA: [number, number] = [1.5, 3];
// Onde cada T fica no bombsite (m em volta do centro, pelo índice no time): espalhados, não empilhados.
const ESPALHAR: [number, number][] = [[0, 0], [-3.5, -2.5], [3.5, -2.5], [-3.5, 2.5], [3.5, 2.5]];
const PERTO_DO_SITE = 8; // m do centro: a partir daqui o T vai para o seu ponto no site
const ESPERA_RECUO = 5;
const LIMITE_ROTA = 20; // |x| que separa corredor, meio e túnel
const REFAZER_ROTA = 2; // s entre recálculos da rota até o alvo
// Distância (m) até onde o bot avança no alvo, nas pausas entre os tiros.
// Só estas armas têm distância ideal: as variantes (fuzil, rifleS, miniSmg, smgS...) não entram e sempre avançam.
const ALCANCE_IDEAL: Partial<Record<TipoArma, number>> = { sniper: 60, rifle: 20, smg: 12, escopeta: 7, pistola: 15 };

const ALCANCE_OUVIDO = 15; // m: passo de inimigo até aqui chama a atenção do bot
const OLHAR_RUIDO = 1; // s olhando para onde veio o barulho
const ERRO_DIRECAO_DANO = 15 * Math.PI / 180; // rad: erro (uniforme, ±) da direção de quem atirou sem ser visto
const ERRO_DIRECAO_RUIDO = ERRO_DIRECAO_DANO; // rad: mesmo erro (±15°) na direção de um ruído ouvido
const ERRO_DIST_RUIDO = 0.3; // fração: distância percebida do ruído = real × uniforme [1-0,3; 1+0,3]
const DIST_AMEACA_DANO = 15; // m: o ponto da ameaça fica sempre a esta distância, qualquer que seja a do atirador
const GRANADA_INTERVALO: [number, number] = [6, 12]; // s entre arremessos do mesmo bot
const ALCANCE_HE = [9, 28];
const ALCANCE_FLASH = [6, 25];
const ALCANCE_MOLOTOV = [6, 22];
const FOGO_OLHAR = 1.2; // m à frente: fogo aqui no caminho → espera em vez de atravessar
const FOGO_SAIDA = 1.5; // m além da borda do fogo para onde foge quem está queimando
const SAIDA_FIXA = 0.6; // s mantendo a mesma saída do fogo
// s: amostra percebida até esta idade além do `atraso` ainda conta como "o ponto anda" (base + folga da velocidade).
const AMOSTRA_RECENTE = 0.15;
const FUMACA_RECUO = 6; // m à frente para a smoke que cobre a fuga
// rad: variação da mira parada no posto entre os CTs. No fácil o CT segura o ângulo mal (até ~34° fora da
// entrada); era 0,15 em todas. Balanceamento (Task 10): com a mira pronta, o CT do fácil ganhava quase todo
// duelo de quem entrava. Não muda a mira com alvo (mão virtual), só para onde ele olha esperando.
const DESVIO_MIRA: Record<NomeDificuldade, number> = { facil: 0.6, medio: 0.15, dificil: 0.15 };

const PESOS: [TipoPrimaria, number][] = [
  ['rifle', 0.35], ['fuzil', 0.1], ['rifleS', 0.1], ['smg', 0.13], ['miniSmg', 0.06], ['smgS', 0.06], ['escopeta', 0.2],
];

// Alvo visível e a distância até ele (`enxergar`).
interface Visto { ent: Entidade; d: number }

// Objetivo do bot por causa da C4 (`destinoBomba`): vai ao `waypoint` do bombsite ou até o `ponto` da C4 solta.
interface DestinoBomba { chave: ChaveBomba; waypoint?: number; ponto?: Vec3 }

// O que o bot faz com a C4 sem inimigo à vista (`tarefaBomba`): ver o comentário dela.
interface TarefaBomba { direto?: PontoXZ; parado?: boolean; segurar?: boolean }

// Arma em mãos do bot: quem pensa sempre tem `armas` e o slot ativo aponta uma arma que existe.
const armaEmMao = (ent: Entidade): Arma => ent.armas![ent.slot]!;

// Bombsite de `site`; undefined com a C4 plantada fora de qualquer site (`site` null).
const bombsiteDe = (mapa: Mapa, site: Site | null): Bombsite | undefined => (site === null ? undefined : mapa.bombsites[site]);

export function escolherPrimaria(indiceNoTime: number, rng: Rng): TipoPrimaria {
  if (indiceNoTime === 0) return 'sniper';
  let r = rng();
  for (const [tipo, peso] of PESOS) {
    if (r < peso) return tipo;
    r -= peso;
  }
  return 'rifle';
}

const sortear = (rng: Rng, [a, b]: readonly [number, number]): number => a + rng() * (b - a);
const distXZ = (a: PontoXZ, b: PontoXZ): number => Math.hypot(a.x - b.x, a.z - b.z);

// Yaw que olha de `de` para `para` (yaw 0 olha para -z).
const yawPara = (de: PontoXZ, para: PontoXZ): number => Math.atan2(-(para.x - de.x), -(para.z - de.z));

// Ponto da ameaça por direção: o ângulo (yaw da vítima para o atirador) com erro uniforme de ±ERRO_DIRECAO_DANO,
// a DIST_AMEACA_DANO metros. Não depende de onde o atirador está, só de para que lado ele está.
export function ameacaPorDirecao(ent: Entidade, anguloReal: number, rng: Rng): PontoXZ {
  const a = anguloReal + (rng() * 2 - 1) * ERRO_DIRECAO_DANO;
  return { x: ent.pos.x - Math.sin(a) * DIST_AMEACA_DANO, z: ent.pos.z - Math.cos(a) * DIST_AMEACA_DANO };
}

// Ponto onde o bot acha que o ruído veio: ângulo real de `de` até o ruído com erro uniforme de ±ERRO_DIRECAO_RUIDO
// e distância real × uniforme [1-ERRO_DIST_RUIDO, 1+ERRO_DIST_RUIDO]. Nunca a posição exata do ruído.
export function perceberRuido(de: PontoXZ, r: Ruido, rng: Rng): PontoXZ {
  const a = yawPara(de, r) + (rng() * 2 - 1) * ERRO_DIRECAO_RUIDO;
  const d = Math.hypot(r.x - de.x, r.z - de.z) * (1 + (rng() * 2 - 1) * ERRO_DIST_RUIDO);
  return { x: de.x - Math.sin(a) * d, z: de.z - Math.cos(a) * d };
}

function waypointPerto(grafo: Grafo, pos: Vec3, caixas: Caixa[]): number | null {
  return maisProximo(grafo, pos, caixas) ?? maisProximo(grafo, pos, caixas, { exigirVisada: false });
}

function rotaAte(ent: Entidade, grafo: Grafo, caixas: Caixa[], destinoId: number | null): number[] {
  const de = waypointPerto(grafo, ent.pos, caixas);
  if (de === null || destinoId === null) return [];
  return caminho(grafo, de, destinoId);
}

// Faixa da rota pelo índice no time: corredor (x<-20), meio ou túnel (x>20).
function faixa(w: Waypoint): 0 | 1 | 2 {
  if (w.x < -LIMITE_ROTA) return 0;
  if (w.x > LIMITE_ROTA) return 2;
  return 1;
}

// Waypoint sorteado na metade inimiga, preferindo a faixa pedida.
function objetivo(ent: Entidade, grafo: Grafo, rng: Rng, faixaPedida: number | null = null): number | null {
  const meuLado = Math.sign(ent.pos.z) || 1;
  const inimigos = grafo.nos.filter((w) => Math.sign(w.z) === -meuLado);
  const naFaixa = faixaPedida === null ? inimigos : inimigos.filter((w) => faixa(w) === faixaPedida);
  const opcoes = naFaixa.length ? naFaixa : inimigos.length ? inimigos : grafo.nos;
  if (!opcoes.length) return null;
  return opcoes[Math.floor(rng() * opcoes.length)].id;
}

// Rota do começo do round. Os Ts indo ao bombsite se dividem como num time de CS: metade pela rota do
// próprio site, metade pelo meio. Sem isso os cinco seguiam o mesmo caminho mais curto, em fila.
function rotaDoRound(
  ent: Entidade, grafo: Grafo, caixas: Caixa[], destino: number | null, bomba: DestinoBomba | null, mundo: Mundo | null,
  indice: number,
): number[] {
  if (!bomba?.chave.startsWith('site:') || ent.time !== mundo!.bomba!.terroristas || mundo!.bomba!.plantada) {
    return rotaAte(ent, grafo, caixas, destino);
  }
  const passagem = mundo!.mapa.bombsites[bomba.chave.slice(5) as Site].rotas?.[indice % 2];
  const ida = passagem === undefined ? [] : rotaAte(ent, grafo, caixas, passagem);
  if (!ida.length) return rotaAte(ent, grafo, caixas, destino);
  return [...ida, ...caminho(grafo, passagem, destino!).slice(1)];
}

export function criarCerebro(
  ent: Entidade, grafo: Grafo, rng: Rng, caixas: Caixa[] = [], mundo: Mundo | null = null,
): Cerebro {
  const indice = ent.id % 5;
  const ordem = [1, 2, 0]; // meio, túnel, corredor
  const casaZ = ent.pos.z >= 0 ? 0 : 1; // metade do mapa onde nasceu
  // `ent.cerebro` ainda é o do round anterior (outra metade depois da troca de lados): passa a casa nova.
  const bomba = mundo ? destinoBomba(ent, mundo, casaZ) : null;
  const destino = bomba ? bomba.waypoint! : objetivo(ent, grafo, rng, ordem[indice % 3]);
  // Dificuldade por nome (perfil avulso, sem nome, usa o do médio).
  const desvio = DESVIO_MIRA[typeof mundo?.dificuldade === 'string' ? mundo.dificuldade : 'medio'];
  return {
    estado: 'rota', rota: rotaDoRound(ent, grafo, caixas, destino, bomba, mundo, indice), alvoId: null, vistoHa: 0,
    rajada: 0, pausaAte: 0, ultimoDano: null,
    passoRota: 0, ultimaPos: null, perdidoHa: 0, esperaAte: 0, chegou: false,
    cabeca: false, municaoVista: null,
    gatilho: false, emRajada: false, preso: 0, queriaAndar: false, recuou: false,
    ouvidoEm: -Infinity, ouvidoAte: 0, ouvidoPos: null, chaveBomba: bomba ? bomba.chave : null,
    proxGranada: 0, cegoVisto: 0, casaZ,
    desvioMira: sortear(rng, [-desvio, desvio]), desencalhes: 0,
    percepcao: [], mao: criarMao(),
  };
}

// Centro da cabeça e do tronco (escalados se agachado), como nas hitboxes.
// `alturaTronco`: o bot fácil mira mais baixo, e o spray sobe menos até a cabeça.
function pontosDoCorpo(
  alvo: Pick<Entidade, 'pos' | 'agachado'>, alturaTronco = 1.1,
): { cabeca: Vec3; tronco: Vec3 } {
  const k = alvo.agachado ? 1.2 / 1.8 : 1;
  const { x, y, z } = alvo.pos;
  return { cabeca: { x, y: y + 1.6 * k, z }, tronco: { x, y: y + alturaTronco * k, z } };
}

// Instante da amostra mais antiga do inimigo `id` ainda guardada (`agora` se não houver nenhuma).
function vistoDesde(amostras: readonly Amostra[], id: number, agora: number): number {
  let t = agora;
  for (const a of amostras) if (a.id === id && a.t < t) t = a.t;
  return t;
}

// Inimigos visíveis do olho do bot, do mais perto ao mais longe.
function enxergar(ent: Entidade, mundo: Mundo): Visto[] {
  const o = olho(ent);
  const vistos: Visto[] = [];
  if (mundo.tempo < (ent.cegoAte ?? 0)) return vistos; // cego pela flash: não vê ninguém
  for (const outro of mundo.entidades) {
    if (!outro.vivo || outro.time === ent.time) continue;
    const d = distXZ(o, outro.pos);
    if (d > ALCANCE_VISAO) continue;
    if (d > VISAO_360 && Math.abs(angulo(yawPara(o, outro.pos) - ent.yaw)) > MEIO_CONE) continue;
    const p = pontosDoCorpo(outro);
    if (!visadaLivre(mundo, o, p.cabeca) && !visadaLivre(mundo, o, p.tronco)) continue; // fumaça também corta a visão
    vistos.push({ ent: outro, d });
  }
  vistos.sort((a, b) => a.d - b.d);
  return vistos;
}

// Ruído de inimigo mais recente ao alcance do ouvido que o bot ainda não tratou; null se não houver.
export function ouvir(ent: Entidade, mundo: Mundo, c: Pick<Cerebro, 'ouvidoEm'>): Ruido | null {
  let melhor: Ruido | null = null;
  for (const r of mundo.ruidos ?? []) {
    if (r.time === ent.time || r.em <= c.ouvidoEm) continue;
    if (distXZ(ent.pos, r) > (r.alcance ?? ALCANCE_OUVIDO)) continue;
    if (melhor === null || r.em > melhor.em) melhor = r;
  }
  return melhor;
}

// Para onde o bot vai por causa da C4: { chave, waypoint? , ponto? } ou null (sem bomba em jogo).
// A chave muda quando o objetivo muda (C4 plantada, caiu, outro bombsite): aí o bot refaz a rota.
// `casaZ`: metade onde o bot nasceu neste round (índice do `espera`).
function destinoBomba(
  ent: Entidade, mundo: Mundo, casaZ: 0 | 1 = ent.cerebro?.casaZ ?? (ent.pos.z >= 0 ? 0 : 1),
): DestinoBomba | null {
  const b = mundo.bomba;
  if (!b || b.explodiu || b.desarmada) return null;
  const sites = mundo.mapa.bombsites;
  if (ent.time === b.terroristas) {
    if (b.plantada) return { chave: `site:${b.site}`, waypoint: bombsiteDe(mundo.mapa, b.site)?.waypoint };
    if (b.portador === null && b.pos) {
      // Só um terrorista vai buscar a C4 solta (o mais perto); os outros esperam no bombsite.
      // Quem já está indo continua até pegar ou morrer: a rota pode se afastar da C4 antes de chegar,
      // e comparar só a distância fazia dois bots trocarem a vez sem parar.
      const outros = mundo.entidades.filter((o) => o !== ent && o.vivo && o.time === ent.time && o.bot);
      const meu = distXZ(ent.pos, b.pos);
      const jaVou = ent.cerebro?.chaveBomba === 'solta';
      const outroVai = outros.some((o) => o.cerebro?.chaveBomba === 'solta');
      const maisPerto = outros.every((o) => distXZ(o.pos, b.pos!) >= meu);
      if (jaVou || (!outroVai && maisPerto)) return { chave: 'solta', ponto: b.pos };
    }
    return { chave: `site:${b.siteAlvo}`, waypoint: sites[b.siteAlvo].waypoint };
  }
  if (b.plantada) return { chave: `site:${b.site}`, waypoint: bombsiteDe(mundo.mapa, b.site)?.waypoint };
  // Antes da plantada, o CT segura o site de um pouco atrás, do lado da própria base (mira o corredor de entrada).
  const site = ent.id % 2 === 0 ? 'A' : 'B';
  return { chave: `espera:${site}`, waypoint: sites[site].espera[casaZ] };
}

// Visada limpa na altura da cintura entre o bot e um ponto do chão.
const veDireto = (ent: Entidade, mundo: Mundo, p: PontoXZ): boolean => temVisada(
  { x: ent.pos.x, y: 0.9, z: ent.pos.z }, { x: p.x, y: 0.9, z: p.z }, mundo.mapa.caixas);

// T que chegou perto do bombsite vai para o seu ponto em volta do centro e fica lá (ESPALHAR).
function espalharNoSite(ent: Entidade, mundo: Mundo, site: Site | null): TarefaBomba {
  const centro = bombsiteDe(mundo.mapa, site)?.centro;
  if (!centro || distXZ(ent.pos, centro) > PERTO_DO_SITE) return { segurar: true };
  const [dx, dz] = ESPALHAR[ent.id % ESPALHAR.length];
  const ponto = { x: centro.x + dx, z: centro.z + dz };
  if (distXZ(ent.pos, ponto) < 0.6) return { parado: true, segurar: true };
  return veDireto(ent, mundo, ponto) ? { direto: ponto, segurar: true } : { segurar: true };
}

// Ações da C4 enquanto o bot não tem inimigo à vista. Devolve { direto?, parado?, segurar? } ou null:
// direto = anda reto até o ponto; parado = fica onde está (planta/desarma); segurar = rota acabou, espera.
function tarefaBomba(ent: Entidade, mundo: Mundo, cmd: Comandos): TarefaBomba | null {
  const b = mundo.bomba;
  if (!b || b.explodiu || b.desarmada) return null;
  if (ent.time === b.terroristas) {
    if (b.plantada) return espalharNoSite(ent, mundo, b.site);
    if (b.portador === ent.id) {
      if (!siteEm(mundo.mapa, ent.pos)) return null;
      cmd.usar = true;
      return { parado: true, segurar: true };
    }
    if (b.portador === null && b.pos && distXZ(ent.pos, b.pos) < 8 && veDireto(ent, mundo, b.pos)) {
      return { direto: b.pos, segurar: true };
    }
    return b.portador === null && b.pos ? null : espalharNoSite(ent, mundo, b.siteAlvo);
  }
  if (!b.plantada) return { segurar: true };
  const d = distXZ(ent.pos, b.pos!);
  if (d <= BOMBA.raioAcao - 0.3) {
    if (!b.acao || b.acao.id === ent.id) cmd.usar = true; // só um CT desarma; o resto cobre
    return { parado: true, segurar: true };
  }
  return d < 16 && veDireto(ent, mundo, b.pos!) ? { direto: b.pos!, segurar: true } : null;
}

// Waypoint do próximo trecho: o da C4 se houver bomba em jogo, senão um sorteio na metade inimiga.
function proximoObjetivo(ent: Entidade, c: Cerebro, mundo: Mundo, grafo: Grafo, rng: Rng): number | null {
  const bomba = destinoBomba(ent, mundo);
  if (!bomba) return objetivo(ent, grafo, rng);
  c.chaveBomba = bomba.chave;
  return bomba.waypoint ?? waypointPerto(grafo, bomba.ponto!, mundo.mapa.caixas);
}

// Saída do fogo: das direções radial (centro→bot), ±45°, ±90°, ±135° e para trás, a de borda mais perto
// sem parede no caminho. Contra a parede, a radial bate nela: sem isto o bot empurrava a parede até morrer.
const DIRECOES_SAIDA = [0, 1, -1, 2, -2, 3, -3, 4].map((k) => (k * Math.PI) / 4);
function saidaDoFogo(ent: Entidade, mundo: Mundo, f: Fogo): Vec3 {
  const dx = ent.pos.x - f.pos.x;
  const dz = ent.pos.z - f.pos.z;
  const atras = direcao(ent.yaw + Math.PI, 0); // bem no centro: a radial é para trás
  const base = Math.hypot(dx, dz) > 0.05 ? Math.atan2(dz, dx) : Math.atan2(atras.z, atras.x);
  const pe = { x: ent.pos.x, y: ent.pos.y + 0.5, z: ent.pos.z };
  let melhor: { d: number; alvo: Vec3 } | null = null;
  for (const da of DIRECOES_SAIDA) {
    const ux = Math.cos(base + da);
    const uz = Math.sin(base + da);
    for (let d = 0.4; d <= 2 * f.raio + 1; d += 0.4) {
      if (noFogo(mundo, { x: ent.pos.x + ux * d, y: ent.pos.y, z: ent.pos.z + uz * d }, 0.3, ent.time)) continue;
      const alvo = { x: ent.pos.x + ux * (d + FOGO_SAIDA), y: ent.pos.y + 0.5, z: ent.pos.z + uz * (d + FOGO_SAIDA) };
      if (temVisada(pe, alvo, mundo.mapa.caixas) && (!melhor || d < melhor.d)) melhor = { d, alvo };
      break;
    }
  }
  const ux = Math.cos(base);
  const uz = Math.sin(base);
  return melhor?.alvo ?? { x: f.pos.x + ux * (f.raio + FOGO_SAIDA), y: ent.pos.y, z: f.pos.z + uz * (f.raio + FOGO_SAIDA) };
}

// O ponto `FOGO_OLHAR` à frente na direção (dx, dz) está no fogo de outro time?
function fogoAFrente(ent: Entidade, mundo: Mundo, dx: number, dz: number): boolean {
  const n = Math.hypot(dx, dz);
  if (n < 0.05) return false;
  const k = FOGO_OLHAR / n;
  return Boolean(noFogo(mundo, { x: ent.pos.x + dx * k, y: ent.pos.y, z: ent.pos.z + dz * k }, 0.3, ent.time));
}

// Fogo da molotov (só o do outro time, o do próprio não queima): queimando, foge para fora (larga
// plantar/desarmar); com o fogo logo à frente no caminho, para e espera apagar. Devolve o destino a usar.
function evitarFogo(ent: Entidade, mundo: Mundo, destino: PontoXZ | null, cmd: Comandos): PontoXZ | null {
  const f = noFogo(mundo, ent.pos, 0.3, ent.time);
  const c = ent.cerebro!;
  if (!f) c.saidaFogo = null;
  else {
    cmd.usar = false;
    // A saída escolhida vale por SAIDA_FIXA: recalcular a cada quadro alternava entre duas saídas parecidas
    // (ao longo da parede) e o bot ficava parado no fogo.
    if (!c.saidaFogo || mundo.tempo >= c.saidaFogo.ate) c.saidaFogo = { alvo: saidaDoFogo(ent, mundo, f), ate: mundo.tempo + SAIDA_FIXA };
    return c.saidaFogo.alvo;
  }
  if (!destino) return null;
  return fogoAFrente(ent, mundo, destino.x - ent.pos.x, destino.z - ent.pos.z) ? null : destino;
}

// Granada no meio da briga: HE, molotov ou flash no inimigo à vista, com intervalo e um pouco de sorte.
// `granadaAlvo` é o ponto onde o arco deve cair (ver `lancar` em granadas.js).
function jogarGranada(ent: Entidade, c: Cerebro, alvo: Entidade, mundo: Mundo, cmd: Comandos, rng: Rng): void {
  const g = ent.equip?.granadas;
  if (!g || mundo.tempo < c.proxGranada) return;
  const d = distXZ(ent.pos, alvo.pos);
  let tipo: TipoGranada | null = null;
  if (g.he > 0 && d >= ALCANCE_HE[0] && d <= ALCANCE_HE[1] && rng() < 0.5) tipo = 'he';
  else if (g.molotov > 0 && d >= ALCANCE_MOLOTOV[0] && d <= ALCANCE_MOLOTOV[1] && rng() < 0.45) tipo = 'molotov';
  else if (g.flash > 0 && d >= ALCANCE_FLASH[0] && d <= ALCANCE_FLASH[1] && rng() < 0.4) tipo = 'flash';
  if (!tipo) return;
  cmd.granada = tipo;
  cmd.granadaAlvo = { x: alvo.pos.x, y: alvo.pos.y + (tipo === 'flash' ? 1.5 : 0.1), z: alvo.pos.z };
  c.proxGranada = mundo.tempo + sortear(rng, GRANADA_INTERVALO);
}

// Fuga: smoke na direção da ameaça para cobrir a retirada.
function fumacaDeFuga(ent: Entidade, c: Cerebro, ameaca: PontoXZ, mundo: Mundo, cmd: Comandos): void {
  if (!((ent.equip?.granadas?.smoke ?? 0) > 0) || mundo.tempo < c.proxGranada) return;
  const d = Math.max(1, distXZ(ent.pos, ameaca));
  const k = Math.min(FUMACA_RECUO, d) / d;
  cmd.granada = 'smoke';
  cmd.granadaAlvo = { x: ent.pos.x + (ameaca.x - ent.pos.x) * k, y: 0.3, z: ent.pos.z + (ameaca.z - ent.pos.z) * k };
  c.proxGranada = mundo.tempo + sortear(() => 0.5, GRANADA_INTERVALO);
}

// Gira no máximo GIRO_MAX*dt em direção ao ângulo desejado.
function girar(atual: number, desejado: number, dt: number): number {
  const delta = angulo(desejado - atual);
  const max = GIRO_MAX * dt;
  return atual + Math.max(-max, Math.min(max, delta));
}

const comandoBase = (ent: Entidade): Comandos => ({
  frente: 0, lado: 0, pular: false, agachar: false, devagar: false, atirar: false,
  zoom: false, recarregar: false, usar: false, granada: null, slot: null, yaw: ent.yaw, pitch: ent.pitch,
});

interface Angulos { yaw: number; pitch: number }
/** Amostra percebida já adiantada pela previsão, com a velocidade (m/s, XZ) com que o ponto anda agora. */
type Previsto = Amostra & { vel: { x: number; z: number } };
/** Ângulos de mira e, se o ponto anda, a velocidade angular dele (rad/s) para o feedforward da mão. */
type Mira = Angulos & { vel?: Angulos };

// Leva a mira pela mão virtual (mao.ts) até `alvo`; o pitch fica dentro do mesmo limite do `passo`.
function mirarComMao(
  ent: Entidade, c: Cerebro, alvo: Mira, perfil: PerfilMao, agora: number, dt: number, rng: Rng, cmd: Comandos,
): void {
  const r = moverMao({ yaw: ent.yaw, pitch: ent.pitch }, alvo, c.mao, perfil, agora, dt, rng, alvo.vel);
  cmd.yaw = r.yaw;
  cmd.pitch = Math.max(-PITCH_MAX, Math.min(PITCH_MAX, r.pitch));
}

// Mão parada no lugar: sem ponto percebido ainda, segura a mira atual (a velocidade que sobrou freia, sem tremor).
function segurarMira(ent: Entidade, c: Cerebro, dif: Dificuldade, agora: number, dt: number, rng: Rng, cmd: Comandos): void {
  mirarComMao(ent, c, { yaw: ent.yaw, pitch: ent.pitch }, { ...dif.mao, tremor: 0 }, agora, dt, rng, cmd);
}

// Onde a mão deve mirar o alvo `id`: a amostra percebida (`mao.atraso` s atrás) adiantada, só no plano XZ, pela
// velocidade percebida × atraso × `mao.previsao` (o humano rastreia com previsão e só erra quando o alvo muda de
// direção). Só usa amostras da percepção; escondido, p e a velocidade não mudam → o ponto fica parado.
// `vel`: com que velocidade o ponto anda agora — a percebida enquanto p ainda avança (amostra recente), zero
// quando p parou de mudar (alvo sumiu há mais de `atraso` s), para o feedforward não empurrar a mão.
function pontoPrevisto(c: Cerebro, id: number, agora: number, dif: Dificuldade): Previsto | null {
  const p = percebido(c.percepcao, id, agora, dif.mao.atraso);
  if (!p) return null;
  const v = velocidadePercebida(c.percepcao, id, agora, dif.mao.atraso);
  const k = dif.mao.atraso * dif.mao.previsao;
  const vivo = agora - dif.mao.atraso - p.t <= AMOSTRA_RECENTE;
  return { ...p, pos: { x: p.pos.x + v.x * k, y: p.pos.y, z: p.pos.z + v.z * k }, vel: vivo ? v : { x: 0, z: 0 } };
}

// Velocidade angular (rad/s) de `ponto` visto de `o` quando ele anda a `v` (m/s, XZ): derivada de `yawPara`
// (yaw = atan2(−dx, −dz)) e do pitch (atan2(dy, distância XZ)). Alimenta o feedforward da mão.
function velocidadeAngular(o: Vec3, ponto: Vec3, v: { x: number; z: number }): Angulos {
  const dx = ponto.x - o.x;
  const dz = ponto.z - o.z;
  const dy = ponto.y - o.y;
  const h2 = dx * dx + dz * dz;
  if (h2 < 1e-6) return { yaw: 0, pitch: 0 };
  const h = Math.sqrt(h2);
  const dh = (dx * v.x + dz * v.z) / h;
  return { yaw: (dz * v.x - dx * v.z) / h2, pitch: (-dy * dh) / (h2 + dy * dy) };
}

// Yaw/pitch do ponto (cabeça ou tronco, `c.cabeca`) de onde o alvo foi percebido; parte escondida (atrás de
// caixa baixa, por exemplo) → mira na outra.
function miraNoPercebido(ent: Entidade, c: Cerebro, p: Previsto, dif: Dificuldade, mundo: Mundo): Mira {
  const o = olho(ent);
  const corpo = pontosDoCorpo(p, dif.alturaTronco);
  let ponto = c.cabeca ? corpo.cabeca : corpo.tronco;
  if (!temVisada(o, ponto, mundo.mapa.caixas)) ponto = c.cabeca ? corpo.tronco : corpo.cabeca;
  return {
    yaw: yawPara(o, ponto), pitch: Math.atan2(ponto.y - o.y, distXZ(o, ponto)), vel: velocidadeAngular(o, ponto, p.vel),
  };
}

// Alvo guardado (`alvoId`) fora da visada: a mão continua indo para o último ponto previsto dele (`pontoPrevisto`,
// não ganha posição nova). Devolve false se não há o que olhar (sem alvo ou ainda sem amostra de `mao.atraso` s atrás).
function olharPercebido(
  ent: Entidade, c: Cerebro, mundo: Mundo, dif: Dificuldade, dt: number, rng: Rng, cmd: Comandos,
): boolean {
  const p = c.alvoId === null ? null : pontoPrevisto(c, c.alvoId, mundo.tempo, dif);
  if (!p) return false;
  mirarComMao(ent, c, miraNoPercebido(ent, c, p, dif, mundo), dif.mao, mundo.tempo, dt, rng, cmd);
  return true;
}

// Mira onde prevê o alvo a partir do que percebeu `mao.atraso` s atrás (pela mão virtual) e decide o gatilho.
// Mexe só em yaw/pitch/atirar/zoom/lado.
function atacar(
  ent: Entidade, c: Cerebro, alvo: Entidade, mundo: Mundo, dif: Dificuldade, dt: number, rng: Rng, cmd: Comandos,
  { strafe }: { strafe: boolean },
): void {
  const agora = mundo.tempo;
  const arma = armaEmMao(ent);
  const def = ARMAS[arma.tipo];
  const p = pontoPrevisto(c, alvo.id, agora, dif);
  let mira: Mira | null = null;
  if (p) {
    mira = miraNoPercebido(ent, c, p, dif, mundo);
    // `disparar` soma o recuo antes de aplicar: a mão tenta compensar o valor que o próximo tiro vai usar.
    mira.pitch -= Math.min(arma.recuoAcum + def.recuo, RECUO_MAX);
    mirarComMao(ent, c, mira, dif.mao, agora, dt, rng, cmd);
  } else {
    segurarMira(ent, c, dif, agora, dt, rng, cmd);
  }
  cmd.zoom = arma.tipo === 'sniper';

  // Tiros que saíram desde o último pensar (a munição caiu) contam na rajada.
  if (c.municaoVista && c.municaoVista.slot === ent.slot && arma.municao < c.municaoVista.n) {
    c.rajada -= c.municaoVista.n - arma.municao;
    if (!def.auto) c.cabeca = rng() < dif.chanceCabeca;
  }
  c.municaoVista = { slot: ent.slot, n: arma.municao };

  // Gatilho: a mira real (depois da mão) perto do ponto percebido, nos dois eixos.
  const mirando = mira !== null && Math.abs(angulo(mira.yaw - cmd.yaw)) < dif.toleranciaTiro
    && Math.abs(mira.pitch - cmd.pitch) < dif.toleranciaTiro;
  const pronto = c.vistoHa >= dif.reacao && mirando && arma.recarregandoAte === 0 && arma.municao > 0;
  if (def.auto) {
    if (c.rajada <= 0 && c.emRajada) {
      c.emRajada = false;
      c.pausaAte = agora + sortear(rng, [0.25, 0.4]);
      c.cabeca = rng() < dif.chanceCabeca;
    }
    if (!c.emRajada && agora >= c.pausaAte && pronto) {
      c.emRajada = true;
      c.rajada = 3 + Math.floor(rng() * 3);
    }
    cmd.atirar = c.emRajada && pronto;
    c.disparando = c.emRajada && c.vistoHa >= dif.reacao;
  } else {
    cmd.atirar = pronto && !c.gatilho && agora >= arma.prontaEm;
    c.disparando = c.vistoHa >= dif.reacao && agora >= arma.prontaEm - 0.15;
  }
  c.gatilho = cmd.atirar;
  if (strafe && (familia(arma.tipo) === 'smg' || arma.tipo === 'escopeta')) {
    cmd.lado = Math.floor(agora / STRAFE_TROCA) % 2 ? 1 : -1;
  }
}

// Anda pela rota: devolve o próximo waypoint (e vira para ele) ou null se acabou.
function seguirRota(ent: Entidade, c: Cerebro, grafo: Grafo, dt: number, cmd: Comandos): Waypoint | null {
  while (c.passoRota < c.rota.length && distXZ(ent.pos, grafo.nos[c.rota[c.passoRota]]) < CHEGOU) {
    c.passoRota += 1;
  }
  if (c.passoRota >= c.rota.length) {
    c.preso = 0;
    return null;
  }
  // Desencalha: quase parado por ~1 s tentando andar a rota → pula e passa para o waypoint seguinte.
  // Quadro em que o bot não tentava andar (parado de propósito) não conta.
  c.preso = c.queriaAndar && ent.velHoriz < 1 ? c.preso + dt : 0;
  if (c.preso > PRESO_TEMPO) {
    c.preso = 0;
    c.desencalhes += 1;
    cmd.pular = true;
    if (c.passoRota < c.rota.length - 1) c.passoRota += 1;
  }
  const w = grafo.nos[c.rota[c.passoRota]];
  cmd.yaw = girar(ent.yaw, yawPara(ent.pos, w), dt);
  cmd.pitch = ent.pitch + Math.max(-GIRO_MAX * dt, Math.min(GIRO_MAX * dt, -ent.pitch));
  return w;
}

// Calcula frente/lado a partir do yaw que vai valer neste passo.
function andarPara(pos: PontoXZ, yaw: number, alvo: PontoXZ): { frente: number; lado: number } {
  const dx = alvo.x - pos.x;
  const dz = alvo.z - pos.z;
  const n = Math.hypot(dx, dz);
  if (n < 1e-6) return { frente: 0, lado: 0 };
  const f = direcao(yaw, 0);
  return { frente: (dx * f.x + dz * f.z) / n, lado: (dx * -f.z + dz * f.x) / n };
}

// Longe demais para a arma e fora da rajada: anda pela rota até o alvo, sem tirar a mira dele.
function avancar(
  ent: Entidade, c: Cerebro, alvo: Entidade, grafo: Grafo, caixas: Caixa[], agora: number, dt: number, cmd: Comandos,
): Waypoint | null {
  const ideal = ALCANCE_IDEAL[armaEmMao(ent).tipo];
  if (c.disparando || (ideal !== undefined && distXZ(ent.pos, alvo.pos) <= ideal)) return null;
  if (agora >= (c.refazerEm ?? 0)) {
    const perto = waypointPerto(grafo, alvo.pos, caixas);
    c.rota = perto === null ? [] : rotaAte(ent, grafo, caixas, perto);
    c.passoRota = 0;
    c.refazerEm = agora + REFAZER_ROTA;
  }
  const { yaw, pitch } = cmd;
  const destino = seguirRota(ent, c, grafo, dt, cmd);
  cmd.yaw = yaw;
  cmd.pitch = pitch;
  return destino;
}

function irParaCobertura(
  ent: Entidade, c: Cerebro, grafo: Grafo, caixas: Caixa[], ameacaPos: Vec3, estado: EstadoCerebro,
): boolean {
  const id = coberturaPerto(grafo, ent.pos, ameacaPos, caixas);
  if (id === null) return false;
  const rota = rotaAte(ent, grafo, caixas, id);
  if (!rota.length) return false;
  Object.assign(c, { estado, rota, passoRota: 0, chegou: false, preso: 0 });
  return true;
}

function voltarParaRota(ent: Entidade, c: Cerebro, grafo: Grafo, caixas: Caixa[], destinoId: number | null): void {
  Object.assign(c, {
    estado: 'rota', rota: rotaAte(ent, grafo, caixas, destinoId), passoRota: 0,
    alvoId: null, vistoHa: 0, chegou: false, preso: 0, emRajada: false, semDireto: false,
  });
}

// Passos de inimigo ouvidos há pouco viram a mira (pela mão virtual, na horizontal) para o barulho
// (ganha da mira parada).
function olharRuido(ent: Entidade, c: Cerebro, mundo: Mundo, dif: Dificuldade, dt: number, cmd: Comandos, rng: Rng): void {
  const ruido = ouvir(ent, mundo, c);
  if (ruido) {
    c.ouvidoEm = ruido.em;
    c.ouvidoAte = mundo.tempo + OLHAR_RUIDO;
    c.ouvidoPos = perceberRuido(ent.pos, ruido, rng);
  }
  if (c.ouvidoPos && mundo.tempo < c.ouvidoAte) {
    mirarComMao(ent, c, { yaw: yawPara(ent.pos, c.ouvidoPos), pitch: 0 }, dif.mao, mundo.tempo, dt, rng, cmd);
  }
}

// No posto sem alvo: mira a saída da rota inimiga (com o desvio do bot), pitch na horizontal.
function mirarEntrada(ent: Entidade, c: Cerebro, mundo: Mundo, dt: number, cmd: Comandos): void {
  const site = c.chaveBomba!.slice('espera:'.length) as Site;
  const mira = mundo.mapa.bombsites[site].mira[c.casaZ];
  cmd.yaw = girar(ent.yaw, yawPara(ent.pos, mira) + c.desvioMira, dt);
  cmd.pitch = ent.pitch + Math.max(-GIRO_MAX * dt, Math.min(GIRO_MAX * dt, -ent.pitch));
}

function recarregarSePreciso(ent: Entidade, cmd: Comandos, temAlvo: boolean): void {
  const arma = armaEmMao(ent);
  const def = ARMAS[arma.tipo];
  if (arma.municao === 0 && arma.reserva === 0 && ent.slot === 'primaria') {
    cmd.slot = 'pistola';
    return;
  }
  if (cmd.atirar || arma.recarregandoAte > 0 || arma.reserva <= 0) return;
  // Pente vazio recarrega sempre (em combate o gatilho fica solto, então a arma não recarrega sozinha).
  const vazio = arma.municao === 0;
  const baixo = arma.municao < 0.3 * def.pente && !temAlvo;
  if (vazio || baixo) cmd.recarregar = true;
}

export function pensar(
  ent: Entidade, mundo: Mundo, grafo: Grafo, dificuldade: Dificuldade | NomeDificuldade, dt: number, rng: Rng,
): Comandos {
  const cmd = comandoBase(ent);
  if (!ent.vivo || !ent.armas) return cmd;
  const dif = typeof dificuldade === 'string' ? DIFICULDADE[dificuldade] : dificuldade;
  const caixas = mundo.mapa.caixas;
  const c = ent.cerebro ?? (ent.cerebro = criarCerebro(ent, grafo, rng, caixas, mundo));
  const agora = mundo.tempo;

  // Visão: mantém o alvo atual enquanto visível; senão, o inimigo mais perto.
  const vistos = enxergar(ent, mundo);
  // Percepção atrasada: guarda onde cada visto está agora; a mira usa o que foi visto `mao.atraso` s atrás.
  registrarVistos(c.percepcao, vistos.map((v) => v.ent), agora, JANELA_PERCEPCAO);
  const alvo = (vistos.find((v) => v.ent.id === c.alvoId) ?? vistos[0])?.ent ?? null;
  if (alvo) {
    if (alvo.id !== c.alvoId) {
      // A reação conta desde a primeira vez que este inimigo foi visto dentro da janela de percepção: quem já
      // espiou há pouco não começa do zero (dois inimigos se revezando na mesma porta zeravam a reação a cada troca).
      // Inimigo nunca visto começa em 0, como antes.
      const vistoHa = agora - vistoDesde(c.percepcao, alvo.id, agora);
      Object.assign(c, { alvoId: alvo.id, vistoHa, emRajada: false, rajada: 0, refazerEm: 0 });
      c.cabeca = rng() < dif.chanceCabeca;
    }
    c.vistoHa += dt;
    c.perdidoHa = 0;
    c.ultimaPos = { ...alvo.pos };
  }

  // Levou dano: só sabe a direção. Se algum inimigo visível está nessa direção (±erro), é ele e o combate segue;
  // senão procura cobertura contra um ponto naquela direção (com erro) e vira o olhar para lá.
  if (c.ultimoDano !== null) {
    const { angulo: anguloDano } = c.ultimoDano;
    c.ultimoDano = null;
    const visto = vistos.some((v) => Math.abs(angulo(yawPara(ent.pos, v.ent.pos) - anguloDano)) <= ERRO_DIRECAO_DANO);
    if (!visto && c.estado !== 'recuo') {
      const ponto = ameacaPorDirecao(ent, anguloDano, rng);
      irParaCobertura(ent, c, grafo, caixas, { x: ponto.x, y: 0, z: ponto.z }, 'cobertura');
      c.ouvidoAte = agora + OLHAR_RUIDO;
      c.ouvidoPos = ponto;
    }
  }
  // Ferido e vendo o inimigo: recua uma vez só por round. Recuar de novo a cada visada virava um vaivém
  // sem fim (cobertura, espera, volta à rota, vê o inimigo, cobertura...); depois do recuo ele luta.
  if (alvo && ent.hp < HP_RECUO && c.estado !== 'recuo' && !c.recuou) {
    if (irParaCobertura(ent, c, grafo, caixas, alvo.pos, 'recuo')) {
      c.recuou = true;
      fumacaDeFuga(ent, c, alvo.pos, mundo, cmd);
    }
  }
  // Cegado pela flash: larga o combate e vai para a cobertura mais perto do último inimigo visto.
  if (agora < (ent.cegoAte ?? 0) && c.cegoVisto !== ent.cegoAte) {
    c.cegoVisto = ent.cegoAte!;
    if (c.ultimaPos && c.estado !== 'recuo') irParaCobertura(ent, c, grafo, caixas, c.ultimaPos, 'cobertura');
  }

  // No posto, a C4 mudou (plantada, por exemplo) → sai e segue para o novo objetivo.
  if (c.estado === 'posto' && destinoBomba(ent, mundo)?.chave !== c.chaveBomba) {
    voltarParaRota(ent, c, grafo, caixas, proximoObjetivo(ent, c, mundo, grafo, rng));
  }

  // Procurando o inimigo perdido: se ele reaparece, é combate normal.
  if (c.estado === 'procura' && alvo) c.estado = 'combate';

  let destino: PontoXZ | null = null;
  if (c.estado === 'recuo' || c.estado === 'cobertura' || c.estado === 'procura') {
    destino = seguirRota(ent, c, grafo, dt, cmd);
    if (!destino) {
      if (!c.chegou) {
        c.chegou = true;
        c.esperaAte = agora + (c.estado === 'recuo' ? ESPERA_RECUO : sortear(rng, ESPERA_COBERTURA));
      }
      if (c.estado === 'recuo') cmd.agachar = true;
      if (alvo) atacar(ent, c, alvo, mundo, dif, dt, rng, cmd, { strafe: false });
      else if (agora >= c.esperaAte) voltarParaRota(ent, c, grafo, caixas, proximoObjetivo(ent, c, mundo, grafo, rng));
    } else if (alvo && c.estado === 'cobertura') {
      atacar(ent, c, alvo, mundo, dif, dt, rng, cmd, { strafe: false });
    }
    // Cobertura por causa de dano: a mira vira (pela mão virtual) para a direção do tiro, sem alvo à vista.
    if (c.estado === 'cobertura' && !alvo && c.ouvidoPos && agora < c.ouvidoAte) {
      mirarComMao(ent, c, { yaw: yawPara(ent.pos, c.ouvidoPos), pitch: 0 }, dif.mao, agora, dt, rng, cmd);
    }
  } else if (c.estado === 'posto') {
    // Segurando o ângulo: atira do lugar, sem avançar e sem perseguir; sem alvo, volta a mirar a entrada.
    if (alvo) {
      atacar(ent, c, alvo, mundo, dif, dt, rng, cmd, { strafe: false });
      jogarGranada(ent, c, alvo, mundo, cmd, rng);
    } else {
      c.perdidoHa += dt;
      if (c.perdidoHa > PERDER_ALVO) Object.assign(c, { alvoId: null, vistoHa: 0, emRajada: false });
      // Inimigo visto há pouco (alvo ainda guardado): a mão vai para onde ele foi percebido, não volta para a
      // entrada. Sem isso, quem aparecia por um quadro na borda do cone sumia antes de o bot começar a mirar.
      if (!olharPercebido(ent, c, mundo, dif, dt, rng, cmd)) mirarEntrada(ent, c, mundo, dt, cmd);
      olharRuido(ent, c, mundo, dif, dt, cmd, rng);
    }
  } else if (alvo) {
    c.estado = 'combate';
    atacar(ent, c, alvo, mundo, dif, dt, rng, cmd, { strafe: true });
    jogarGranada(ent, c, alvo, mundo, cmd, rng);
    destino = avancar(ent, c, alvo, grafo, caixas, agora, dt, cmd);
  } else if (c.estado === 'combate') {
    c.perdidoHa += dt;
    if (!olharPercebido(ent, c, mundo, dif, dt, rng, cmd)) cmd.yaw = girar(ent.yaw, yawPara(ent.pos, c.ultimaPos!), dt);
    if (c.perdidoHa > PERDER_ALVO) {
      voltarParaRota(ent, c, grafo, caixas, waypointPerto(grafo, c.ultimaPos!, caixas));
      c.estado = 'procura';
    }
  } else {
    // C4: o objetivo mudou (plantada, caiu, outro bombsite) → refaz a rota.
    const bomba = destinoBomba(ent, mundo);
    if (bomba && bomba.chave !== c.chaveBomba) {
      voltarParaRota(ent, c, grafo, caixas, proximoObjetivo(ent, c, mundo, grafo, rng));
    }
    const desencAntes = c.desencalhes;
    destino = seguirRota(ent, c, grafo, dt, cmd);
    const tarefa = tarefaBomba(ent, mundo, cmd);
    // Preso andando reto: a visada do centro passa, mas o corpo encosta numa quina. O `direto` sobrepunha a
    // rota e o desencalhe não o tirava dali; agora ele larga o `direto` e segue a rota até o fim.
    if (tarefa?.direto && c.desencalhes > desencAntes) c.semDireto = true;
    if (!destino) c.semDireto = false;
    if (tarefa?.direto && !c.semDireto) {
      cmd.yaw = girar(ent.yaw, yawPara(ent.pos, tarefa.direto), dt);
      destino = tarefa.direto;
    } else if (tarefa?.parado) {
      destino = null;
    } else if (!destino && !tarefa?.segurar) {
      voltarParaRota(ent, c, grafo, caixas, proximoObjetivo(ent, c, mundo, grafo, rng));
      destino = seguirRota(ent, c, grafo, dt, cmd);
    } else if (!destino && bomba && c.chaveBomba!.startsWith('espera:') && c.rota.at(-1) === bomba.waypoint) {
      // CT antes da plantada que chegou ao `espera`: fica no posto segurando o ângulo.
      c.estado = 'posto';
    }
    // Ouviu passos de inimigo: segue a rota, mas com a mira virada para o barulho.
    olharRuido(ent, c, mundo, dif, dt, cmd, rng);
  }
  if (mundo.fogos?.length) destino = evitarFogo(ent, mundo, destino, cmd);
  if (destino) {
    const mov = andarPara(ent.pos, cmd.yaw, destino);
    cmd.frente = mov.frente;
    cmd.lado = mov.lado;
  } else if ((cmd.frente || cmd.lado) && mundo.fogos?.length) {
    // Strafe do combate (sem destino): não pisa no fogo.
    const f = direcao(cmd.yaw, 0);
    if (fogoAFrente(ent, mundo, f.x * cmd.frente - f.z * cmd.lado, f.z * cmd.frente + f.x * cmd.lado)) {
      cmd.frente = 0;
      cmd.lado = 0;
    }
  }
  c.queriaAndar = cmd.frente !== 0 || cmd.lado !== 0;
  recarregarSePreciso(ent, cmd, Boolean(alvo));
  return cmd;
}
