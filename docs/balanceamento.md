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

Fim da Task 10 (antes da correção da revisão final):

| dificuldade | vitória T | headshot | 1º acerto (s) | desenc./partida | mudos | arma topo | 2ª arma |
|---|---|---|---|---|---|---|---|
| fácil | 41,9% | 58,0% | 1,30 | 0,13 | 2 | SMG 32,0% | rifle 29,3% |
| médio | 51,4% | 61,2% | 0,88 | 0,00 | 1 | rifle 33,8% | SMG 31,6% |
| difícil | 54,0% | 67,7% | 0,57 | 0,03 | 1 | rifle 46,0% | SMG 20,8% |

Fim do Plano 2 (commit 4b8bf2f; código com a correção da revisão: no posto a mão é movida uma vez só por passo):

| dificuldade | vitória T | headshot | 1º acerto (s) | desenc./partida | mudos | arma topo | 2ª arma |
|---|---|---|---|---|---|---|---|
| fácil | 42,2% | 58,2% | 1,33 | 0,03 | 0 | SMG 33,0% | rifle 28,0% |
| médio | 51,5% | 61,7% | 0,88 | 0,00 | 0 | rifle 33,8% | SMG 31,8% |
| difícil | 58,3% | 67,4% | 0,55 | 0,03 | 0 | rifle 46,5% | SMG 19,0% |

A correção da revisão mudou o olhar do CT no posto e, com a simulação caótica, moveu a vitória T do difícil de
54,0% para 58,3% (+4,3 pontos, dentro da variação de ±5 pontos entre blocos de seeds vista na Task 10). Os mudos
foram a zero e os desencalhes caíram no fácil.

Final (`tools/baseline/varredura-depois.json`, CTs espalhados e headshot, commit 994acfd):

| dificuldade | vitória T | headshot | 1º acerto (s) | desenc./partida | mudos | arma topo | 2ª arma |
|---|---|---|---|---|---|---|---|
| fácil | 43,2% | 35,8% | 1,50 | 0,00 | 0 | SMG 26,8% | rifle 25,9% |
| médio | 42,2% | 39,2% | 1,00 | 0,00 | 0 | rifle 35,3% | SMG 20,8% |
| difícil | 47,6% | 48,2% | 0,58 | 0,00 | 0 | rifle 44,6% | SMG 15,8% |

Medição intermediária (só CTs espalhados, commit 3fdaa62, antes do headshot): vitória T 40,5 / 39,6 / 49,4%;
headshot 62,4 / 64,4 / 73,3%; 1º acerto 1,27 / 0,85 / 0,55 s; mudos 0.

Duelo de entrada (`tools/bs-duelo.mjs --cenario=entrada --seeds=1..50`), igual ao da Task 9 em todas as
dificuldades: mira 0,57 / 0,40 / 0,27 s; 1º tiro 0,77 / 0,58 / 0,32 s; acerto 1,00 / 0,70 / 0,55 s.

## Mudanças

| # | alavanca | antes → depois | motivo | efeito medido |
|---|---|---|---|---|
| 0 | `bots.ts`: desencalhe durante o `direto` da C4 | `direto` sobrepunha a rota → o bot larga o `direto` (`semDireto`) e segue a rota até o fim | armadilha da Task 9 (R10): T preso na quina da caixa x −1,5..1,5, z −16..−14 indo pegar a C4 | cenário do teste: antes, 29 desencalhes em 30 s sem pegar a C4; depois, pega a C4 em 3,9 s com 1 desencalhe; varredura 30 seeds: vitória T mudou < 0,3 ponto |
| 1 | `ECONOMIA.derrota` | [1400, 1900, 2400, 2900, 3400] → [1900, 2400, 2900, 3400] | no fácil os Ts perdiam e ficavam sem dinheiro (sobra média depois da compra: T $991, CT $1837); o bônus maior segura a bola de neve | 60 seeds (1..60, sozinha): fácil 42,2 → 46,1%; médio 51,0 → 49,3%; difícil 55,0 → 57,0% |
| 2 | `ITENS.rifle.preco` | $2700 → $3100 (o preço do fuzil) | rifle acima de 35% das kills no médio e no difícil; é a arma mais comprada | com a #1, 30 seeds: rifle no médio 43,6 → 33,8%, no difícil 54,2 → 46,0%; o SMG fica com a diferença |
| 3 | `DESVIO_MIRA` (posto) | 0,15 rad em todas → fácil 0,6, médio e difícil 0,15 | no fácil o CT parado com a mira pronta na entrada ganhava o duelo de quem entrava | só no fácil (sozinha, 60 seeds): 42,2 → 45,4%; não muda médio, difícil nem o duelo |
| 4 | `bots.ts`: posto espalhado (b2513a5) | CTs do mesmo site paravam no mesmo ponto → cada CT pega um ponto distinto do posto | bug do playtest: dois CTs andando colados | incluído na #5 (medido junto) |
| 5 | `bots.ts`: rotas alternativas, `ROTA_ALT_MAX` 1.7 (3fdaa62, 6bb7a65) | CTs do mesmo site iam pelo mesmo caminho → o CT de índice 1 vai por rota diferente | CTs do mesmo site não chegam em fila | com o posto (@3fdaa62), vitória T 42,2 / 51,5 / 58,3% → 40,5 / 39,6 / 49,4% |
| 6 | H1 (1cef285, cad0647, d52e434): `trocaParaCabeca` | todo bot trocava a mira do tronco escondido para a cabeça → só o difícil troca; bot sem visada do tronco não trava parado | a troca em todo bot explicava o headshot de 58–67% | medido junto com H2 a H4 (tabela Final) |
| 7 | H2 (a0a8831): `MULT_PARTE` cabeça | ×4 → ×2,5 | headshot 58–67% muito acima da meta | medido junto com H3 e H4 |
| 8 | H3 (64a0c62): `chanceCabeca` do difícil | 0,35 → 0,1 | com 0,35 o headshot do difícil dava 60%; 0,2 → 55%; 0,1 → 48% (30 seeds) | difícil: headshot 48% |
| 9 | H4 (994acfd): `trocaParaCabecaApos` (substitui o booleano do H1) | fácil 0,5 s, médio 0,7 s, difícil 0 s | o maior valor com 0 mudos e 1º acerto ≤ 1,5 / 1,0 s. Fácil: 0,55 já tem 1 mudo e 0,6 dá 1,53 s. Médio: 0,7 → headshot 39%, 1º acerto 1,00 s; 0,75 passa de 1,0 s | headshot fácil 35,8%, médio 39,2% |

Efeito final do conjunto (4 a 9): tabela Final acima.

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

Sobre a tabela Final (commit 994acfd).

- **Vitória T no fácil (43,2%) e no médio (42,2%), abaixo de 45%. Aceito pelo dono em 2026-11-16.** Causa: as rotas
  alternativas dos CTs (o médio caiu ~12 pontos com o posto espalhado e as rotas, 51,5 → 39,6% na medição
  intermediária). O difícil (47,6%) está dentro da faixa.
- **Headshot do fácil: 35,8% (meta 15–25%).** Nenhum `trocaParaCabecaApos` com 1º acerto ≤ 1,5 s fecha a faixa (ver a
  #9). O médio (39,2%) e o difícil (48,2%) estão dentro. No cenário curto de `packages/sim/test/bots-cabeca.test.ts`
  o headshot dá fácil 19,5 / médio 21,6 / difícil 18,8%: ali a ordem fácil < médio < difícil não vale; na partida
  (tabela Final) vale.
- **Rifle: médio 35,3% (0,3 ponto acima de ~35%) e difícil 44,6%, justificado.** O rifle é a arma mais comprada: é a
  preferência de 35% dos bots (`PESOS`, fora das alavancas) e a reserva de quem não alcança a sniper (sniper + colete)
  ou o fuzil. A mira precisa favorece a arma automática mais precisa. Fechar 35% exigiria piorar o rifle (dano ou
  spread) a ponto de ele perder para o SMG, o que distorce o jogo.
- **Mudos e desencalhes: 0 / 0 / 0.** Os mudos da Task 10 (`recuo` correndo para a cobertura sem atirar) e os
  desencalhes isolados sumiram na tabela Final.
