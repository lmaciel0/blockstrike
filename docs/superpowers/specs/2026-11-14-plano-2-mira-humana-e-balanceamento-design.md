# Block Strike — Plano 2: mira humana, métricas e balanceamento (design)

Data: 2026-11-14. Status: rascunho para aprovação. Passo 2 do spec `2026-11-13-blockstrike-design.md`, dividido a pedido do dono: este plano cobre mira, métricas e balanceamento; a tática de equipe (trade, rotação, divisão de entrada) fica para o **Plano 2b**.

## Intenção e porquê

O dono joga no médio e sente que os bots "miram e atiram rápido demais, parece aimbot". Ele quer bots que percam e ganhem duelos como gente: quem vê primeiro e mira melhor ganha, não a máquina. O difícil deve ser um **humano bom**, nunca sobre-humano. Junto, o jogo precisa de lados e armas equilibrados, medidos por simulação, porque mudar a mira mexe em todos esses números.

## Estado atual (lido do código em 2026-11-14)

- `packages/sim/src/bots.ts`, função `atacar`: o bot gira para o alvo **desde o primeiro quadro em que o vê**; o tempo de reação (`DIFICULDADE.reacao`, 0,38 s no médio) só segura o gatilho. Quando pode atirar, a mira já está no alvo.
- Giro linear a `GIRO_MAX` = 8 rad/s que para exatamente no ponto: sem passar do alvo, sem correção.
- Recuo compensado 100% a cada tiro (`compensa`).
- Erro gaussiano sorteado a cada 0,15 s (`TROCA_ERRO`), do mesmo tamanho no primeiro tiro e no décimo, com o alvo parado ou correndo; mira na posição **atual** do alvo (rastreio sem atraso).
- Ao levar dano de quem não vê, o bot recebe a posição exata do atirador (`ultimoDanoDe` → `atirador.pos`, `bots.ts:544`). Um humano só sabe a direção.
- Baseline `tools/baseline/ts-relogio.json` (30 partidas por dificuldade, seeds fixas):

  | dificuldade | vitória T | headshot (% das kills) | presos |
  |---|---|---|---|
  | fácil | 34,6% | 63,5% | 0 |
  | médio | 43,4% | 68,2% | 0 |
  | difícil | 55,3% | 74,9% | 0 |

- "Presos" é sempre 0: a métrica conta episódios de > 3 s parado querendo andar, mas o próprio bot se desencalha com 1 s (`PRESO_TEMPO`, pula e avança o waypoint). A métrica fica cega a bot que vive se desencalhando.
- Não existe métrica de kills por arma nem de tempo até o primeiro acerto.
- `npm test` roda `tests/baseline.test.mjs`, que compara a simulação com o baseline gravado: qualquer mudança intencional de comportamento quebra esse teste.

## Objetivos

1. Mira com cara de humano em todas as dificuldades, com o médio como referência ("jogador comum") e o difícil como "humano bom".
2. Métricas confiáveis no simulador: tempo até o primeiro acerto, headshot %, kills por arma, presos (consertada), vitória por lado.
3. Bot sem informação que um humano não teria ao levar dano.
4. Balanceamento de lados e armas dentro das metas abaixo, nas três dificuldades.

## Não objetivos

- Tática de equipe (trade, rotação ao ouvir/ver a C4 no outro site, divisão de entrada, chamadas): **Plano 2b**.
- Mudar navegação, rotas, geometria do mapa, spawns, granadas além do necessário para as metas.
- Netcode, estética, cliente (só a tela não muda; a dificuldade escolhida continua a mesma).
- Otimizador automático de parâmetros.

## Anti-objetivos (fracasso mesmo que "funcione")

- Bot que acerta por saber algo que não viu: mirar na posição atual de quem está atrás de parede ou fumaça, ou no atirador que não enxerga.
- Médio que só "erra mais" por sorteio grosseiro (spray aleatório, tiros no chão) em vez de reagir e mirar como gente.
- Difícil que vence por reflexo abaixo do humano (começar a mirar antes de ~0,2 s).
- Metas batidas no simulador à custa de bots travados, parados ou sem atirar.
- Mudança de comportamento sem o baseline e os testes acusarem; baseline regravado sem registro do porquê.

## Restrições

- Fluxo do dono (CLAUDE.md): plano aprovado, TDD, `code-reviewer` uma vez no diff final; commit e push só com pedido do dono; branch + commits pequenos + PR, merge só com ok.
- `packages/sim` continua puro (sem DOM, sem Three.js) e determinístico pela seed: todo sorteio novo usa o `rng` do bot.
- Só desktop (o jogo não terá mobile).
- O mesmo `pensar` roda no servidor no Plano 3: nada que dependa de relógio real ou do cliente.

## Abordagens consideradas

**1. Remendos em `atacar`.** Atraso antes de girar, overshoot com correção, compensação parcial do recuo, erro maior no primeiro contato e em movimento. Pouco código e fácil de ler, mas uns 8 a 10 parâmetros por dificuldade com efeito combinado difícil de prever; o rastreio de alvo em movimento continua perfeito sem um quinto remendo.

**2. Mão virtual (escolhida pelo dono).** Duas peças:
- **Percepção atrasada:** o bot guarda o que viu de cada inimigo e mira onde o alvo estava há `atraso` segundos, não onde está agora. Isso dá o atraso para começar a mirar e o atraso no rastreio; se o alvo muda de direção, o bot erra até perceber.
- **Mira com inércia:** yaw e pitch do bot são movidos por um controlador de segunda ordem (mola e amortecedor) com aceleração limitada e tremor. A mira acelera, freia, passa do ponto e corrige. O recuo é compensado pela mesma mão, então sai imperfeito.

Uns 4 números por dificuldade (atraso, firmeza, amortecimento, tremor), um modelo só para todos os sintomas. Contra: muda mais código; calibração ruim faz o bot errar demais, por isso a afinação é feita pelo simulador.

**3. Reescrever a IA (utility AI ou behavior tree).** Descartada: o problema relatado é a mira, não a tomada de decisão; reescrita fica para o Plano 2b se ele precisar.

**Balanceamento (nos dois casos):** script de varredura com seeds fixas e ajuste manual dos números olhando a tabela. Otimizador automático descartado: tende a achar valores absurdos que só funcionam no simulador.

## Decisões de projeto

Do dono:
- Mão virtual (abordagem 2).
- Médio = jogador comum; difícil = humano bom, sem nada sobre-humano.
- Tática de equipe em plano separado (2b).
- **Alavancas do balanceamento:** armas, economia, tempos (round, timer da C4, plantar, desarmar) e onde os bots CT seguram o site (`espera`/`mira` dos bombsites e o comportamento de posto). Geometria do mapa e spawns não mudam.
- **Prioridade em conflito:** mira com cara de humano > equilíbrio de lados (T 45–55%) > limite de kills por arma. Meta que sobrar fora da faixa é registrada no PR com a diferença, não forçada.

Chamadas do assistente (o dono pode corrigir):
- **Percepção atrasada vale para a mira, não para a decisão de entrar em combate.** O bot sabe que viu alguém no instante em que vê (o "notar" já é o atraso); a posição que alimenta a mira é a atrasada. Alvo que some da visada: a mira continua indo para a última posição percebida, e o bot não ganha posição nova até voltar a ver.
- **O atraso só vale para inimigo visível.** Não há memória de posição de quem nunca foi visto; quem sai de trás da parede começa do zero (sem amostras, sem mira).
- **Gatilho:** o bot atira quando a mira (real, depois da inércia) está dentro de uma tolerância do ponto **percebido**, depois de `reacao` desde que viu. Some o `MIRA_OK` fixo em favor de uma tolerância por arma/dificuldade, se o builder achar preciso.
- **Recuo:** a mão "tenta" compensar o recuo do próximo tiro como alvo da mola; a inércia faz a compensação sair atrasada e parcial. Sem constante mágica de "x% do recuo".
- **Dano de quem não vê:** o bot recebe só a **direção** de onde veio o tiro (ângulo no plano, com erro de ~±15°), e a cobertura é escolhida contra um ponto naquela direção a uma distância fixa (ex.: 15 m), não contra a posição real.
- **Dano: direção também vira o olhar.** Com a direção (±15°), o bot escolhe a cobertura e também vira a mira para lá (pela mão virtual, como um humano que se vira para o tiro). Vale para todo dano que hoje preenche `ultimoDanoDe` (tiro, HE); o fogo da molotov já é visível e segue como está.
- **Ruído com a mesma regra.** Passos e tiros ouvidos dão direção com erro (±15°) e distância aproximada (±30%), não a posição exata; o giro para o barulho passa pela mão virtual. Hoje `ouvidoPos` é a posição exata do ruído.
- **Cabeça ou tronco continua escolha do bot.** `DIFICULDADE.chanceCabeca` fica como a decisão de mirar na cabeça (humanos miram na cabeça de propósito) e é recalibrada; a mão virtual decide se o tiro chega lá. O headshot % é o resultado dos dois.
- **População das métricas:** todas as entidades da simulação (nas partidas do simulador todas são bots, inclusive a vaga do jogador). Encontro que termina sem acerto (alvo some, alguém morre antes) não entra na mediana do primeiro acerto; a tabela mostra à parte a % de encontros sem acerto.
- **Metas iniciais por dificuldade** (o builder refina com dados e registra no PR):

  | | começa a mirar após ver | 1º acerto (mediana, desde que viu) | headshot (% das kills) |
  |---|---|---|---|
  | fácil | ~0,55 s | ~1,2 s | 15–25% |
  | médio | ~0,4 s | ~0,8 s | 30–40% |
  | difícil | ~0,25 s | ~0,5 s | 40–50% |

  Faixas de referência de jogadores reais de FPS (kills com headshot ~35–50%); "humano bom" fica no topo dessa faixa, nunca acima.
- **Metas de balanceamento:** vitória T entre 45% e 55% em cada dificuldade; nenhuma arma acima de ~35% das kills sem justificativa escrita (o rifle é a arma mais comprada; se passar, o PR explica); bots presos (métrica consertada) ≈ 0; nenhum bot sem atirar um round inteiro com inimigo à vista.
- **Métrica de presos consertada:** passa a contar também os desencalhes automáticos (cada vez que `PRESO_TEMPO` dispara) e episódios curtos repetidos no mesmo lugar; a meta é por partida (média), não zero absoluto.
- **Métricas novas:** tempo até o primeiro acerto (do primeiro quadro em que o bot vê um inimigo até o primeiro dano nele, por encontro), headshot %, kills por arma, vitória por lado. Ficam num script único de varredura em `tools/` que roda N partidas por dificuldade com seeds fixas e imprime uma tabela; N padrão 30 (como o baseline), com modo rápido para iterar.
- **Ordem de trabalho:** (1) métricas e varredura sobre o código atual, gravando a tabela "antes"; (2) dano só com direção; (3) mão virtual; (4) calibração das dificuldades; (5) balanceamento de armas, economia e lados; (6) baseline novo.
- **Baseline:** o comportamento muda de propósito. No fim, grava-se um baseline novo (`tools/baseline/ts-plano2.json`) e `tests/baseline.test.mjs`, `tools/baseline-check.mjs` e `tools/baseline-compara.mjs` passam a comparar com ele, ainda por hash exato (regressão silenciosa é anti-objetivo; mudança intencional, inclusive no Plano 2b, regrava o baseline com o porquê no PR); o antigo fica no repo como histórico. As faixas de metas ficam na varredura, não no teste. O PR mostra a tabela antes/depois.
- **Duelo controlado:** `tools/bs-duelo.mjs` ganha um cenário de alvo que entra na visada andando de lado, para medir reação, primeiro acerto e rastreio por dificuldade sem o ruído da partida inteira. Testes unitários da mão virtual (atraso respeitado, sem mira antes de `atraso`, overshoot presente, convergência) ficam em `packages/sim`.
- **Modelos:** a mão virtual e a calibração são "IA dos bots", parte difícil do spec: implementação com `typescript-pro` e `Agent(model: "opus")` nas peças de controle e calibração (Fable 5.2 se disponível, como no spec).

## Critérios de aceite

- Tabela da varredura (30 partidas × 3 dificuldades, seeds fixas) dentro das metas acima, anexada ao PR com a tabela "antes".
- Duelo controlado: no médio, nenhum tiro antes de ~0,35 s desde que o bot viu; mediana do primeiro acerto na faixa; no difícil, nenhuma reação abaixo de 0,2 s.
- Nenhum uso de posição de inimigo não visto na mira ou na escolha de cobertura (teste que coloca o atirador atrás de parede e verifica que o bot não recebe a posição).
- `npm test`, `npm run typecheck` e build do cliente verdes; `packages/sim` sem DOM/Three.js.
- Playtest do dono no médio: "não parece mais aimbot".

## Fica com o builder

Forma exata do controlador (mola-amortecedor, PD com saturação, ou equivalente), estrutura do buffer de percepção, valores finais dos parâmetros por dificuldade, tolerância do gatilho por arma, quais números de arma/economia mexer para bater as metas, formato da tabela da varredura.

## Riscos

- Calibração que bate as metas no simulador mas fica estranha jogando (bot "bêbado"). Mitiga: duelo controlado + playtest do dono antes do merge.
- Mexer na mira muda a vitória por lado; o balanceamento vem depois da calibração, nunca antes.
- Custo de CPU do buffer de percepção com 10 bots no servidor (Plano 3): guardar só amostras dos inimigos visíveis e por janela curta.
