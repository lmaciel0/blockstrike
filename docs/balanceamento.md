# Balanceamento de lados e armas (Plano 2, Task 10)

Medido com `node --import tsx tools/bs-varredura.mjs --seeds=1..30` (partidas só de bots, modo `relogio`).
Metas (Global Constraints do Plano 2): vitória T entre 45% e 55% em cada dificuldade; nenhuma arma acima de ~35%
das kills sem justificativa escrita; headshot 15–25 / 30–40 / 40–50%; primeiro acerto ~1,2 / ~0,8 / ~0,5 s;
desencalhes ≈ 0; nenhum bot mudo.

## Tabelas (30 seeds)

Antes (`tools/baseline/varredura-antes.json`, código antes do Plano 2):

| dificuldade | vitória T | headshot | 1º acerto (s) | desenc./partida | mudos | arma topo |
|---|---|---|---|---|---|---|
| fácil | 34,6% | 63,5% | 1,38 | 0,07 | 31 | rifle 42,3% |
| médio | 43,5% | 68,2% | 0,83 | 0,07 | 15 | rifle 48,0% |
| difícil | 55,3% | 74,9% | 0,37 | 0,00 | 8 | rifle 56,2% |

Depois da calibração da mira (`tools/baseline/varredura-calibrada.json`, Task 9):

| dificuldade | vitória T | headshot | 1º acerto (s) | desenc./partida | mudos | arma topo |
|---|---|---|---|---|---|---|
| fácil | 40,5% | 58,8% | 1,32 | 0,20 | 1 | rifle 32,6% |
| médio | 53,1% | 60,0% | 0,87 | 0,00 | 0 | rifle 41,5% |
| difícil | 53,9% | 68,5% | 0,55 | 0,00 | 0 | rifle 52,8% |

Final (`tools/baseline/varredura-depois.json`):

| dificuldade | vitória T | headshot | 1º acerto (s) | desenc./partida | mudos | arma topo | 2ª arma |
|---|---|---|---|---|---|---|---|
| fácil | 41,9% | 58,0% | 1,30 | 0,13 | 2 | SMG 32,0% | rifle 29,3% |
| médio | 51,4% | 61,2% | 0,88 | 0,00 | 1 | rifle 33,8% | SMG 31,6% |
| difícil | 54,0% | 67,7% | 0,57 | 0,03 | 1 | rifle 46,0% | SMG 20,8% |

Duelo de entrada (`tools/bs-duelo.mjs --cenario=entrada --seeds=1..50`), igual ao da Task 9 em todas as
dificuldades: mira 0,57 / 0,40 / 0,27 s; 1º tiro 0,77 / 0,58 / 0,32 s; acerto 1,00 / 0,70 / 0,55 s.

## Mudanças

| # | alavanca | antes → depois | motivo | efeito medido |
|---|---|---|---|---|
| 0 | `bots.ts`: desencalhe durante o `direto` da C4 | `direto` sobrepunha a rota → o bot larga o `direto` (`semDireto`) e segue a rota até o fim | armadilha da Task 9 (R10): T preso na quina da caixa x −1,5..1,5, z −16..−14 indo pegar a C4 | cenário do teste: antes, 29 desencalhes em 30 s sem pegar a C4; depois, pega a C4 em 3,9 s com 1 desencalhe; varredura 30 seeds: vitória T mudou < 0,3 ponto |
| 1 | `ECONOMIA.derrota` | [1400, 1900, 2400, 2900, 3400] → [1900, 2400, 2900, 3400] | no fácil os Ts perdiam e ficavam sem dinheiro (sobra média depois da compra: T $991, CT $1837); o bônus maior segura a bola de neve | 60 seeds (1..60, sozinha): fácil 42,2 → 46,1%; médio 51,0 → 49,3%; difícil 55,0 → 57,0% |
| 2 | `ITENS.rifle.preco` | $2700 → $3100 (o preço do fuzil) | rifle acima de 35% das kills no médio e no difícil; é a arma mais comprada | com a #1, 30 seeds: rifle no médio 43,6 → 33,8%, no difícil 54,2 → 46,0%; o SMG fica com a diferença |
| 3 | `DESVIO_MIRA` (posto) | 0,15 rad em todas → fácil 0,6, médio e difícil 0,15 | no fácil o CT parado com a mira pronta na entrada ganhava o duelo de quem entrava | só no fácil (sozinha, 60 seeds): 42,2 → 45,4%; não muda médio, difícil nem o duelo |

Efeito do conjunto (1 + 2 + 3), vitória T, comparado à calibração:

| dificuldade | calibrada, seeds 1..30 | final, seeds 1..30 | calibrada, 1..60 | final, 1..60 |
|---|---|---|---|---|
| fácil | 40,3% | 41,9% | 42,2% | 44,4% |
| médio | 53,0% | 51,4% | 51,0% | 49,9% |
| difícil | 53,8% | 54,0% | 55,0% | 54,8% |

## Ruído da medida

A partida só de bots é caótica: mudar qualquer valor muda todas as trajetórias. A mesma configuração dá
números bem diferentes em dois blocos de 30 seeds (final, fácil: 41,9% nas seeds 1..30 e 46,9% nas 31..60).
O desvio-padrão de uma vitória T de ~620 rounds é ~2 pontos, e a diferença entre dois blocos chega a 5. Por isso
cada alavanca foi conferida também nas seeds 31..60, e nenhuma ficou só por um resultado de 30 seeds.

Alavancas testadas e descartadas (30 seeds, junto com a #1; ruído de ±2–4 pontos):

| alavanca | efeito | por que não ficou |
|---|---|---|
| `ECONOMIA.vitoria` 3250 → 2900 / 2600 | difícil 51,7% nas seeds 1..30 e 58,6% nas 31..60; fácil 35,9–43,7% | sem efeito estável; derruba o fácil |
| `ROUND.duracao` 115 → 100 / 140 | difícil 57,0%; fácil 41,7% | só 3–5% dos rounds acabam no tempo |
| `BOMBA.explode` 40 → 25 + `plantar` 3,2 → 2,5 | T +3 a +5,5 pontos em todas | sobe o difícil junto |
| `BOMBA.explode` 40 → 50 / `plantar` → 4 / 4,5 | difícil −1 a +1 ponto | dentro do ruído; a C4 é plantada em só 8–15% dos rounds |
| `espera` do A no waypoint de cobertura 8 | difícil 58,2% | sem efeito |
| SMG $1250 → $1050; escopeta `spreadBase` 0,06 → 0,035 | difícil 55,4% / 58,0%; rifle igual | sem efeito no lado nem na arma |
| `recompensaKill.rifle` 300 → 150 | difícil 57,0% | sem efeito |
| rifle $3400 | difícil rifle 40,6–45,8%; vitória T 54,6–57,7% | acima do fuzil ($3100) e da Rifle-S ($2900): quebra a ordem de preço por pouco ganho |
| bônus de derrota maior ([2400, 2900, 3400]) | fácil 48,0% nas seeds 1..30, 41,9% nas 31..60; difícil 58,6% (1..60) | sobe o difícil acima de 55% |

## Metas fora da faixa

- **Vitória T no fácil: 41,9% (meta 45–55%), −3,1 pontos nas seeds 1..30.** Em 60 seeds o fácil fica em
  44,4% (−0,6). A diferença entre fácil e difícil (~11–13 pontos) é maior que a largura da faixa (10), e quase
  toda alavanca permitida move as três dificuldades juntas. As duas que separam (bônus de derrota e desvio do
  posto) somam ~+2 a +3 pontos no fácil. Mais do que isso tira o difícil da faixa (ver tabela acima).
  Por que o fácil favorece o CT: o T faz a primeira kill em 55% dos rounds, mas só converte 56% deles (no
  difícil, 77%). Com mira lenta o CT que sobra segura a posição e ganha o round.
- **Rifle no difícil: 46,0% das kills (meta ~35%), justificado.** O rifle é a arma mais comprada: é a preferência
  de 35% dos bots (`PESOS`, fora das alavancas) e a reserva de quem não alcança a sniper (sniper + colete) ou o
  fuzil. No difícil ~33% dos bots entram no round com o rifle e ele faz 46% das kills: a mira precisa favorece a
  arma automática mais precisa. Fechar 35% exigiria piorar o rifle (dano ou spread) a ponto de ele perder para o SMG, o que distorce o
  jogo. Com a #2 o rifle caiu de 54% para 46% e ficou dentro no fácil (29,3%) e no médio (33,8%).
- **Headshot: 58,0 / 61,2 / 67,7% (meta 15–25 / 30–40 / 40–50%). Decisão do dono pendente.** Diagnóstico da Task 9:
  a cabeça vale ×4 (`MULT_PARTE`) e o colete reduz o corpo a ×0,55 (`COLETE`). Uma bala na cabeça quase mata e
  o corpo precisa de ~5; com ~10–18% dos acertos na cabeça, 40–60% das kills já saem na cabeça. Em ~20% dos quadros
  de mira o tronco está escondido atrás de caixas de 1,2 m e a cabeça não, e a mira troca para a cabeça. Recuo e
  spread não explicam (recuo zero deixa o headshot igual). As alavancas da Task 9 chegam a um piso de ~53% no fácil.
  `MULT_PARTE` e `COLETE` não são alavancas desta tarefa: fechar a faixa exige o dono mudar o dano por parte, o
  colete ou a regra "tronco escondido → cabeça". As mudanças desta tarefa não pioraram o headshot nem o primeiro
  acerto além do ruído (headshot −0,8 / +1,2 / −0,8 ponto; 1º acerto −0,02 / +0,01 / +0,02 s).
- **Mudos: 2 / 1 / 1 (meta 0).** Os três casos inspecionados (fácil seed 3, médio seed 4, difícil seed 23) têm o mesmo padrão: bot em combate com a arma cheia, alvo a
  22–38 m que aparece e some atrás de uma caixa baixa. O alvo conta como visto em mais de 3 s somados, mas
  `vistoHa` volta a zero a cada perda e não chega à `reacao` (fica em 0,25–0,45 s). É a percepção intermitente, a
  mesma classe da Task 9, e não vem das alavancas desta tarefa. Fica para o Plano 2b.
- **Desencalhes: 0,13 / 0,00 / 0,03 por partida** (calibrada: 0,20 / 0 / 0). A armadilha da C4 (R10) foi corrigida
  (mudança 0). O que sobra são casos isolados (5 desencalhes em 90 partidas).
