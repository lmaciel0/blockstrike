// Coletor de métricas da partida só de bots: encontros, primeiro acerto, kills por arma, desencalhes e bots mudos.
// Só observa (entidades, cérebros e eventos já emitidos); não chama o sim nem sorteia nada.
//
// Encontro: por par (bot, alvo). Abre no primeiro passo em que `cerebro.alvoId` do bot vira esse id e continua
// aberto mesmo que o bot olhe outro alvo e volte (o bot retargeta quando o alvo some atrás de algo). Fecha quando
// (a) o alvo morre, (b) o bot passa mais de GAP_ENCONTRO s sem `alvoId` = esse id, ou (c) o round acaba.
// Um par só tem encontros em sequência, nunca sobrepostos.
// Primeiro acerto: tempo do início do encontro até o primeiro evento `acerto` do bot nesse alvo, com o encontro aberto.
// Encontro fechado sem acerto conta em `encontrosSemAcerto`.
// Bot mudo: num round, >= 3 s com `alvoId` apontando para alvo ainda vivo e nenhum evento `tiro` dele.
const MUDO_MIN = 3;
export const GAP_ENCONTRO = 2;

export function criarColetor() {
  const killsPorArma = {};
  const primeirosAcertos = [];
  let encontros = 0;
  let encontrosSemAcerto = 0;
  let desencalhes = 0;
  let botsMudos = 0;
  const cerebrosContados = new WeakSet();
  // Por round: encontros abertos (chave `bot>alvo`), tempo com alvo / tiros por bot.
  let abertos = new Map(); // `${bot}>${alvo}` -> { bot, alvo, inicio, ultimo, acertou }
  let comAlvo = new Map(); // id do bot -> segundos com alvoId não nulo
  let tiros = new Map(); // id do bot -> tiros emitidos
  let mortosRound = new Set(); // ids que morreram no round: o `alvoId` pode ficar velho, e não abre encontro
  let ultimo = null; // { n, t } do passo anterior, para o dt só entre passos seguidos

  function fechar(chave) {
    const a = abertos.get(chave);
    abertos.delete(chave);
    if (a && !a.acertou) encontrosSemAcerto++;
  }

  return {
    passo({ n, t, entidades, eventos }) {
      const dt = ultimo && n === ultimo.n + 1 ? t - ultimo.t : 0;
      ultimo = { n, t };
      // Lacuna: encontro cujo alvo não foi o `alvoId` do bot por mais de GAP_ENCONTRO s fecha antes de olhar este passo.
      for (const [chave, a] of [...abertos]) if (t - a.ultimo > GAP_ENCONTRO) fechar(chave);
      for (const e of entidades) {
        const alvo = e.vivo !== false && e.cerebro ? e.cerebro.alvoId : null;
        if (alvo === null) continue;
        const dono = entidades.find((x) => x.id === alvo);
        if (mortosRound.has(alvo) || dono?.vivo === false) continue; // alvoId velho de alvo morto: nem encontro nem tempo com alvo
        comAlvo.set(e.id, (comAlvo.get(e.id) ?? 0) + dt);
        const chave = `${e.id}>${alvo}`;
        const a = abertos.get(chave);
        if (a) a.ultimo = t;
        else {
          abertos.set(chave, { bot: e.id, alvo, inicio: t, ultimo: t, acertou: false });
          encontros++;
        }
      }
      const mortos = new Set(entidades.filter((e) => e.vivo === false).map((e) => e.id));
      for (const x of eventos) {
        if (x.tipo === 'morte') {
          killsPorArma[x.arma] = (killsPorArma[x.arma] ?? 0) + 1;
          mortos.add(x.vitima);
          mortosRound.add(x.vitima);
        } else if (x.tipo === 'tiro') {
          tiros.set(x.atirador, (tiros.get(x.atirador) ?? 0) + 1);
        } else if (x.tipo === 'acerto') {
          const a = abertos.get(`${x.atirador}>${x.alvo}`);
          if (a && !a.acertou) {
            a.acertou = true;
            primeirosAcertos.push(t - a.inicio);
          }
        }
      }
      // Alvo morto fecha o encontro (depois dos acertos do mesmo passo).
      for (const [chave, a] of [...abertos]) if (mortos.has(a.alvo)) fechar(chave);
    },
    // Chamar antes de recriar os cérebros (e no fim da partida): fecha o round.
    fimRound(entidades) {
      for (const chave of [...abertos.keys()]) fechar(chave);
      for (const [id, s] of comAlvo) if (s >= MUDO_MIN && !(tiros.get(id) > 0)) botsMudos++;
      for (const e of entidades) {
        if (!e.cerebro || cerebrosContados.has(e.cerebro)) continue;
        cerebrosContados.add(e.cerebro);
        desencalhes += e.cerebro.desencalhes ?? 0;
      }
      abertos = new Map();
      comAlvo = new Map();
      tiros = new Map();
      mortosRound = new Set();
      ultimo = null;
    },
    resultado() {
      return {
        killsPorArma: { ...killsPorArma }, primeirosAcertos: [...primeirosAcertos], encontros, encontrosSemAcerto,
        desencalhes, botsMudos,
      };
    },
  };
}
