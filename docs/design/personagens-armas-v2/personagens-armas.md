# Personagens e armas v2 — design

Pedido do dono: "melhorar os personagens, dar vida a eles, e o design das armas + a visão do player
segurando as armas". Este diretório é só design: nada em `packages/` foi alterado.

| Arquivo | O que é |
|---|---|
| `modelos-v2.ts` | Substituto drop-in de `client/src/modelos.ts`: 10 armas (6–14 caixas), paleta, mãos da 1ª pessoa |
| `avatar-v2.ts` | Receita do boneco: medidas, roupas, 5 variantes, rosto em canvas, poses, tabela de animações |
| `gerar-svg.mjs` | Gera as 3 folhas a partir das mesmas tabelas (`node --import tsx … [--png]`) |
| `armas-lado.svg`, `armas-primeira-pessoa.svg`, `boneco-folha.svg` | Folhas (PNG em `previa/`) |

## 1. Direção de arte

**Brinquedo tático.** A forma é de Roblox (caixas, cor chapada, sem textura); a informação é de CS
(silhueta que diz a arma, cor que diz o time, pose que diz o que o inimigo está fazendo).

- Não vira brinquedo: paleta dessaturada nas armas (metal escuro + 1 material quente), equipamento de
  verdade (colete, coldre, joelheira, rádio), postura de tiro de lado, nada de sorriso fixo.
- Não vira sisudo: cabeça grande, rosto de 16×16 px com expressão exagerada, cores de time vivas,
  bonecos que se desmancham em blocos, um acento colorido por arma.

Princípios, em ordem de prioridade:

1. **Leitura a 30 m antes de detalhe a 3 m.** Time = matiz dominante (mangas, calça, faixa do chapéu);
   arma = silhueta de lado; ação = pose (recarregando, plantando, tomando tiro).
2. **A hitbox manda.** Cabeça, chapéu, tronco, colete e mochila ficam dentro das hitboxes com folga
   ≤ 0,05 m em qualquer animação (`LIMITES` em `avatar-v2.ts`). Só braços e pernas saem, como hoje.
3. **Uma fonte de verdade.** As mesmas tuplas alimentam o boneco, a 1ª pessoa, a miniatura do HUD e os SVGs.
4. **Vida vem de movimento, não de polígono.** Poucas caixas a mais; muitas reações curtas (0,1–0,3 s).
5. **Custo fixo.** Nenhuma textura por boneco, nenhum material novo por boneco, nenhuma transparência nova.

## 2. Boneco (`avatar-v2.ts`, folha `boneco-folha.svg`)

- **Medidas:** 1,80 m. Tronco 0,46×0,60×0,26; cabeça 0,40³; braço 0,15×0,66; perna 0,22×0,80.
  Ombros mais estreitos que hoje (meia-largura 0,38 contra 0,43): menos braço fora da hitbox.
- **Roupas:** camisa e mangas na cor do time, colete escuro com tarja clara no peito, cinto, mochila,
  faixa clara no braço, luva, joelheira, bota, coldre. Azul (CT) = capacete, bolsos, rádio.
  Laranja (T) = gorro/boné/bandana, lenço vermelho, cartucheira. A silhueta da cabeça também diz o time.
- **Variantes (`id % 5`):** Recruta (limpo), Sombra (óculos escuros), Veterano (ruivo de barba),
  Fantasma (balaclava), Bandana (máscara). Mudam pele, cabelo, rosto e chapéu; nunca a cor do time.
- **Rosto:** `desenharRosto(ctx, expressao, variante)` numa grade 16×16; um atlas único de 64×80 px
  (4 expressões × 5 variantes). Trocar de expressão = trocar a geometria do plano do rosto.
  Prioridade: morte > dano (0,35 s após acerto, ou cego) > foco (0,6 s após atirar; recarregando,
  plantando, pino puxado) > neutra. Tabela completa no comentário de `expressaoDe`.
- **Postura com arma (`poseArmado`):** braços sem cotovelo têm alcance fixo (0,58 m), então a arma longa
  só é "segurada de verdade" com o tronco de lado: giro de 0,7 rad (ombro esquerdo à frente), arma no
  peito direito, mão direita no punho e esquerda no começo do guarda-mão. Pistola: de frente, dois braços
  esticados. Faca: mão baixa à frente, esquerda em guarda. As contas estão na função, não em números mágicos.
- **Hierarquia:** `raiz → pernaE, pernaD, tronco, cabeca, mira → (bracoE, bracoD, arma)`. O grupo `mira`
  (pivô nos ombros) recebe o pitch, o recuo, a recarga e o saque de uma vez só.

### Animações (números em `ANIM`)

| Animação | Dispara | Amplitude | Duração / curva |
|---|---|---|---|
| Caminhada | `noChao && velHoriz > 0,5`; fase = `distAndada` × 4 | perna 0,28 rad (1,5 m/s) → 0,7 (5 m/s) → 0,8 (6,2); quico 0,025 m; contragiro do tronco 0,07 rad; arma 0,012 m | contínua, seno |
| Correr × devagar | `velHoriz` (devagar = 0,52×, agachado = 0,34×) | tronco inclina 0,05 rad acima de 3,6 m/s; quico ×0,5 abaixo de 3,2 | entra em 0,2 s |
| Agachar | `agachado` | escala Y 0,667 (igual à hitbox) + pernas abrem 0,14 rad | 0,12 s, ease-out (hoje: instantâneo) |
| Mira vertical | `pitch` | `mira` = pitch × 0,9 (limite 1,1); cabeça = pitch × 0,35 (limite 0,25) | suavização 14/s |
| Recuo | evento `tiro` | `mira` 0,06 rad, arma 0,035 m; sniper/escopeta 0,16 rad, 0,07 m | decai 16/s (9/s pesadas) |
| Recarga | evento `recarga` + `recarregandoAte` | arma inclina 0,35 rad; braço esquerdo desce 0,9 rad até o pente; cabeça olha 0,2 rad para baixo | 5 fases em p = 0–0,15–0,35–0,6–0,8–1 |
| Plantar/desarmar | `bomba.acao.id` | `mira` −0,9 rad, cabeça −0,25, passada ±0,5 rad, raiz −0,05 m, mão treme 0,12 rad a 6 Hz | entra 0,2 s, sai 0,15 s |
| Arremesso | pino puxado → evento `arremesso` | braço direito 2,7 → 0,7 rad; tronco +0,25 → −0,2 rad | 0,15 + 0,14 + 0,25 s |
| Dano (flinch) | evento `acerto` (ou `hp` caiu) | tronco 0,14 rad para o lado do tiro, cabeça −0,18 rad, raiz 0,03 m | 0,12 s (0,03 sobe, 0,09 volta) |
| Idle | `velHoriz < 0,5` | respiração 1,6 rad/s (±0,008 m); cabeça olha ±0,2 rad a cada 2,5–5 s; peso ±0,015 rad | contínua |
| Ar / pouso | `!noChao`; evento `pouso` | pernas +0,45/−0,25 rad; pouso −0,045 m | 0,16 s |
| Saque | evento `saque` | `mira` −0,7 rad → 0 | 0,25 s |
| Morte | evento `morte` (desmanche já existe) | 6 partes fundidas, com todas as cores, + a arma como 7ª peça; cabeça com rosto "morte" | — |

**O que o sim precisa expor:** nada obrigatório. Todos os campos pedidos existem (`velHoriz`, `agachado`,
`distAndada`, `pitch`, `yaw`, `noChao`, `slot`) e os eventos também (`tiro`, `acerto`, `recarga`, `saque`,
`arremesso`, `pouso`, `acao-inicio`). Lacunas, todas contornáveis no render (lista em `SIM_PRECISA_EXPOR`):
direção do movimento (Δpos), `devagar` (limiar de `velHoriz`), dano sem evento (Δ`hp`), luneta de outros
jogadores. A única que pede decisão: **ajoelhar de verdade ao plantar exige o sim forçar `agachado`**.

## 3. Armas (`modelos-v2.ts`, folha `armas-lado.svg`)

Paleta: 0 metal escuro `#2c2f36` · 1 metal médio `#7c838d` · 2 madeira/polímero (por arma) ·
3 acento/óptica (por arma) · 4 manga do time · 5 pele · 6 luva `#23262b`.

| Arma | Caixas | Intenção em uma linha |
|---|---|---|
| rifle (AK) | 12 | Madeira avermelhada, pente comprido adiantado, tubo de gás e massa de mira alta: a arma "suja" do T |
| fuzil (M4) | 12 | Reto e modular: guarda-mão areia, trilho comprido, ponto vermelho, coronha em tubo |
| rifleS | 11 | O silenciador cinza grosso é a silhueta; coronha esqueleto, pente curto, anel dourado |
| smg (MP5) | 11 | Guarda-mão gordinho, tubo sobre o cano curto, aro de mira, pente fino e longo |
| miniSmg (P90) | 9 | Tijolo bullpup: pente âmbar deitado no topo, dois punhos ligados por baixo; a mais curta |
| smgS (MP5SD) | 10 | O silenciador É o guarda-mão; coronha retrátil de haste fina |
| sniper (AWP) | 14 | Chassi verde-oliva, cano de 0,5 m, luneta com objetiva larga e lente ciano virada para o jogador |
| escopeta | 11 | Dois tubos, telha de madeira (a peça que desliza no pump), coronha caída |
| pistola (USP) | 9 | Dois tons: ferrolho claro sobre armação escura; ponto verde na mira; base do pente aparece |
| faca | 6 | Lâmina com ponta subindo, fio claro, cabo verde-escuro, guarda e pomo |

Compatibilidade: a API é a mesma. Sem tocar no render, o índice 0 cai no metal escuro e 1–3 no material
claro antigo (funciona, fica "bege"); a miniatura do HUD também funciona. `pente` continua uma caixa só.
Novos campos opcionais: `cores`, `bocaY`, `penteSobe` (miniSmg: o pente sai para cima).

## 4. Primeira pessoa (folha `armas-primeira-pessoa.svg`)

- **Posição (`VIEW_V2`):** por arma, em vez do `POS_VIEW` único. Rifles em `[0,18; −0,185; −0,47]` com
  `rot [0,02; 0,06; −0,03]` (hoje `[0,24; −0,22; −0,40]` sem giro): 7 cm mais à frente para a mão direita
  caber na tela, cano apontando de leve para a mira. Pistola mais central e alta; faca inclinada.
- **Mãos (`MAOS_VIEW`):** 3 caixas por braço (luva, dedos de pele, antebraço com a manga do time), filhas
  do grupo da arma — herdam balanço, ginga, recuo, saque e inspeção sem código novo. Direita no punho,
  esquerda por baixo do guarda-mão (`PEGADA`); faca e granada só a direita. Cor dos dedos = pele da variante.
- **FOV separado do mundo:** desenhar o viewmodel num segundo passo (`renderer.clearDepth()` + câmera
  própria com FOV fixo de 75°). Ganhos: a arma para de atravessar parede, e a luneta/slider de FOV deixa
  de deformar as mãos. Custo: 1 chamada de `render` a mais com ~20 caixas.
- **Já existe e fica:** balanço ao andar (0,012 m), ginga em yaw/pitch (±0,08/±0,06 rad), recuo (0,08 m),
  recarga (abaixa 0,12 m, pente desce 0,28 m), saque (0,3 s), golpe da faca, inspeção (1,7 s).
- **Falta (em ordem de valor):**
  1. **Mão esquerda na recarga:** em p 0,15–0,8 a mão esquerda solta o guarda-mão e acompanha o pente
     (mesmo `dy` do pente), voltando em p 0,8–1. É o que faz a recarga parecer "feita por alguém".
  2. **Saque com mão:** a arma sobe de `y −0,3` já com as mãos; pistola 0,2 s, rifle 0,3 s, sniper 0,45 s.
  3. **Sprint-tilt:** acima de 85% da velocidade da arma, `rz +0,12`, `ry +0,18`, `y −0,02` em 0,18 s;
     volta em 0,1 s ao atirar. Diz "estou correndo, não estou pronto".
  4. **Pump/ferrolho:** escopeta desliza a telha (caixa 3) 0,06 m por 0,25 s após o tiro; sniper gira a
     alavanca (caixa 12). Uma caixa animada cada.
  5. **Inspeção com mãos:** na inspeção atual a mão esquerda solta e abre (some 0,1 m para baixo).
  6. **Pouso:** `y −0,03` por 0,15 s no evento `pouso` (hoje só sobe 0,02 no ar).

## 5. Orçamento de performance (meta: 60 fps em GPU integrada)

| Item | Hoje | v2 |
|---|---|---|
| Draw calls por boneco | 9 + 2–4 da arma | 9 (6 partes fundidas + rosto + arma fundida + sombra) |
| Caixas por boneco | 6 + 2 olhos | ~40 (≈ 480 triângulos), todas dentro de 6 geometrias |
| 10 bonecos | ~120 draw calls | ~90 draw calls, ~5 mil triângulos |
| Materiais de boneco | 6 | 2 (cor por vértice; rosto com o atlas) |
| Texturas | 0 | 1 canvas de 64×80 px, NEAREST, sem mipmap, para todos |
| Viewmodel | 2–4 caixas, 2 materiais | ≤ 14 + 6 caixas; arma fundida + pente + mãos = 3–4 draw calls |

- Geometrias em cache por `(time, variante, parte)`: no máximo 40, criadas sob demanda.
- Arma fundida por tipo (cor por vértice), compartilhada entre boneco e peça do desmanche.
- Nenhuma transparência nova (a única continua sendo a sombra de blob); nenhuma luz nova; nenhuma sombra.
- Animação: só `rotation`/`position` de 7 grupos por boneco; zero alocação por quadro.

## 6. Critérios de aceite visuais

1. A 30 m, com o boneco parado, dá para dizer o time em menos de 1 s (teste: captura em tons de cinza
   ainda separa CT de T pela cabeça — capacete × gorro/boné).
2. De lado, cada uma das 10 armas é identificada só pela silhueta preta (teste na folha `armas-lado`).
3. Na 1ª pessoa, a mão esquerda toca o guarda-mão e a direita o punho, sem vão maior que 1 cm, em
   todas as armas de fogo; nenhuma caixa de mão atravessa a arma em repouso.
4. Nenhum vértice de cabeça/chapéu/tronco/mochila sai mais de 0,05 m da hitbox, em pé e agachado
   (teste automático: percorrer `caixasDaParte` com o giro máximo de `LIMITES`).
5. Dois bots lado a lado com `id` diferente não são iguais (variante); dois do mesmo time têm a mesma cor.
6. Tomar tiro, atirar e recarregar são percebidos de terceira pessoa sem som (flinch, recuo, mão no pente).
7. 10 bonecos + viewmodel: quadro ≤ 16,6 ms na GPU integrada de referência; draw calls ≤ hoje.
8. `tsc --strict` passa; nenhum arquivo de imagem/modelo no repo; nenhuma dependência nova.

## 7. Ordem de implementação (cada tarefa ≤ 1 arquivo principal do cliente)

| # | Tarefa | Arquivo | Pronto quando |
|---|---|---|---|
| 1 | Copiar `modelos-v2.ts` por cima de `modelos.ts` (trocar o import relativo) | `modelos.ts` | jogo roda igual, armas novas em 2 cores |
| 2 | Materiais por `PALETA_ARMA` + `cores` (cache por hex) em `criarViewmodel` e `armarAvatar`; clarão em `bocaY` | `render.ts` | armas com 3–4 cores na mão e no boneco |
| 3 | Miniatura do HUD usa `corDaArma` | `hud.ts` | loadout colorido |
| 4 | `VIEW_V2` no lugar de `POS_VIEW`; `penteSobe` | `render.ts` | pose nova por arma |
| 5 | Mãos: `MAOS_VIEW` como filhas do viewmodel (manga = time, dedos = pele) | `render.ts` | folha da 1ª pessoa reproduzida no jogo |
| 6 | Passo separado do viewmodel (`clearDepth`, câmera de 75°) | `render.ts` | arma não atravessa parede |
| 7 | Copiar `avatar-v2.ts` para `client/src/avatar.ts` + teste do `desenharRosto` e do limite de hitbox | `avatar.ts` | testes verdes |
| 8 | `montarParte` (fundir caixas, cor por vértice) + nova hierarquia em `criarAvatar`; `poseArmado` em `armarAvatar` | `render.ts` | boneco novo parado, com arma |
| 9 | Atlas do rosto + plano + `expressaoDe` | `render.ts` | 4 expressões trocando |
| 10 | Caminhada, agachar suave, pitch (`cicloCaminhada`, `ampDaPerna`) | `render.ts` | anda e mira para cima/baixo |
| 11 | Reações por evento: recuo, flinch, saque, pouso | `render.ts` | critério 6 |
| 12 | Recarga, bomba e arremesso no boneco | `render.ts` | idem |
| 13 | Viewmodel: mão esquerda na recarga, sprint-tilt, pump/ferrolho | `render.ts` | seção 4, itens 1–4 |
| 14 | Desmanche com as partes fundidas + arma como 7ª peça | `render.ts` | morte com as cores certas |
| 15 | Idle (olhar em volta, peso) e polimento | `render.ts` | — |

Tarefas 1–6 (armas e mãos) e 7–12 (boneco) são independentes; 1–5 já entregam o que o dono mais vê.

## 8. Fraquezas conhecidas e decisões do dono

- **Braços sem cotovelo.** A pose de tiro depende do tronco de lado; a mão esquerda chega só ao começo
  do guarda-mão (na escopeta, fica ~10 cm atrás da telha). Cotovelos resolveriam (+2 draw calls/boneco).
- **Agachado continua "amassado"** (escala Y 0,667): é o que a hitbox congelada faz. Pose real de agachar
  exigiria mudar a hitbox.
- **Aba do boné tem 5 cm** por causa da folga da hitbox da cabeça; lê como boné, mas é curta.
- **Capacete em todo CT** pode confundir com o item "capacete" da loja. Opções: manter cosmético (como
  no CS) ou mostrar o casco só com `equip.capacete`.
- **Plantar não ajoelha** (ver seção 2). Decidir se o sim força `agachado` na ação.
- **P90 com pente no topo** depende de `penteSobe` no render; sem isso o pente desce por dentro da arma.
- **Folhas SVG usam pintor por face**, não z-buffer: pequenas sobreposições erradas nas mãos são do
  desenho, não do modelo. A pose da 1ª pessoa precisa ser conferida no jogo (tarefa 5).
- **Cores de pele substituem a cabeça amarela.** Se o amarelo "noob" for identidade do jogo, vira uma
  6ª variante ou a cor da variante 0.
