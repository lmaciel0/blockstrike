# Block Strike — mapa, personagens e armas (design visual)

Data: 2026-11-16. Status: desenho pronto, **nada implementado no jogo**. Tudo vive em `docs/design/`; `packages/` não foi tocado.

## Intenção

O dono não gosta do mapa ("nada parece encaixar") e quer: um mapa na vibe de **Dust II**, personagens com **vida** e armas melhores com **mãos visíveis na primeira pessoa**. Mistura de Roblox (leve, blocos, cores chapadas) com a pegada de Counter-Strike. Prioridade explícita do dono: gastar poucos tokens depois.

## Metas / não metas / anti-metas

- Metas: mapa legível e com identidade; bots e balanceamento continuam valendo; visual novo cabe em 60 fps na GPU integrada; tudo procedural (sem arquivo de textura ou modelo).
- Não metas: mapa novo com layout 100% Dust II (assimétrico); mudar hitboxes; mexer na simulação além de aceitar uma lista extra de caixas visuais; multiplayer.
- Anti-metas: bots presos ou rotas quebradas por causa de um mapa bonito; recalibrar o balanceamento inteiro por causa de arte; visual pesado que derruba o fps.

## Abordagens consideradas (o dono escolheu B pela economia de tokens)

- **A. Dust II assimétrico.** Sites perto do CT, grafo de waypoints novo, sem espelhamento, balanceamento refeito. Fica mais fiel, mas vira projeto de IA dos bots. Descartada por custo.
- **B. Inspirado em Dust II, mantendo o espelho (escolhida).** Mesmo esqueleto (Longa à esquerda, meio com portas, túneis do B à direita), mesmos spawns, bombsites, waypoints e arestas. Só muda a caixa de colisão e entra uma camada de decoração sem colisão.
- Limite honesto de B [Certo]: os sites continuam no meio do mapa, equidistantes dos dois times. Fica "Dust II de aparência e de rotas", não de equilíbrio. Se o jogo ainda parecer sem tática depois disso, a causa é essa e o caminho é A.

## Mapa (feito e validado)

Arquivo drop-in: `docs/design/mapa-v2/mapa.ts` (substitui `packages/sim/src/mapa.ts`).

O que mudou na geometria [Certo, medido]:
- Portão azul da Longa (vão de 4,6 m, verga a 2,8 m), container azul, arcos de pedra na entrada dos dois sites.
- Portas do meio (vão de 3,2 m na faixa central), "xbox" verde, janela do B na parede interna do túnel (peitoril de 1,3 m, mais alto que um pulo), teto do túnel maior.
- Cobertura dos sites do lado de fora do retângulo: carro, pilhas, barris, container verde.
- Piso por zona e molduras (coroa e rodapé nas paredes) na camada `decoracao`.

Validação feita num scratchpad com o repo copiado [Certo]:
- `vitest packages/sim`: 575 de 576 passam. A única falha é o teto de 80 caixas em `mapa.test.ts` (o mapa v2 tem 109 caixas de colisão). Intencional: o teto sobe.
- `bs-presos`, seeds 1 a 4 com 7 rounds: **0 bot preso**. A primeira versão do portão (pilar direito a 0,3 m do waypoint 6) prendeu bots por mais de 90 s; foi corrigida prolongando a parede interna. Qualquer ajuste futuro de caixa precisa repetir esse teste.
- O baseline `ts-plano2.json` **vai divergir** [Provável]: a visada mudou. Regenerar depois, e só depois de o handoff dos CTs espalhados estar fechado, para não misturar causas.

## Personagens e armas

Entregues pelo Fable 5.2 em `docs/design/personagens-armas-v2/` (modelos de armas em caixas com paleta, mãos e braços na primeira pessoa, receita do boneco com 5 variantes por time e rosto procedural, tabela de animações, folhas SVG/PNG). Texto de direção em `personagens-armas.md` ali dentro. Hitboxes de `fisica` ficam congeladas.

Pontos fracos que o próprio agente apontou [Certo]: braços sem cotovelo, antebraço esquerdo na primeira pessoa ainda lê como "barra", e a pose só foi vista em SVG, não dentro do jogo. Sem mexer no render, as armas novas aparecem em só duas cores.

## Vida do mapa

Entregue pelo Fable 5.2 em `docs/design/mapa-v2/` (`decoracao`, `atmosfera.ts/.md`, `vida-do-mapa.md`, prévias 3D reais em `previa/`: vista de cima e cenas à altura do olho). Só visual: nada disso entra na colisão.

Conferido por mim depois da entrega [Certo]: `caixas` e waypoints idênticos à versão validada; `vitest packages/sim` com 575 de 576 (só o teto de caixas); `bs-presos` com 0 bot preso em 4 seeds. A decoração tem 797 caixas e 21,7 mil vértices (limite 30 mil). A fachada de casas no muro, o horizonte (mesquita, minarete), as placas A/B altas e o túnel escuro estão na prévia.

Fraco: praças atrás dos sites ainda lisas, prédios do horizonte simples, caixotes todos marrom-escuro. 32 adereços de chão ficam em cantos mortos e são atravessáveis.

## Decisões abertas para o dono

1. Céu e neblina: o drop-in manteve `0x87ceeb` e `[30, 90]` para o teste passar. O agente propõe `0xf0dfb8` e `[38, 150]` (areia quente), o que obriga a mudar `mapa.test.ts`.
2. Luzes: com as intensidades atuais (0,9 e 0,8) o mapa fica marrom no three 0.169; proposta 2,1 e 2,5. [Provável]
3. Aceitar 797 caixas de decoração ou cortar para ~700 (a ordem de corte está em `vida-do-mapa.md`).
4. Container azul da Longa fica perto do azul do time; trocar a cor ou aceitar.
5. Boneco: ajoelhar ao plantar exige o sim forçar `agachado`; capacete em todo CT ou só com colete; cotovelos (+2 draw calls por boneco); trocar a cabeça amarela por tons de pele; P90 com pente no topo.

## Como implementar depois (ordem, cada passo cabe numa sessão curta)

1. **Mapa**: copiar `mapa.ts` para o sim; `tipos.ts` ganha `Mapa.decoracao?: Caixa[]`; `mapa.test.ts` troca o teto de caixas (e `ceu`/`neblina` se a atmosfera mudar). Rodar `vitest`, `bs-presos` (4 seeds) e regenerar o baseline.
2. **Render do mapa**: `geometriaDoMapa` recebe `caixas + decoracao` (mesma geometria, 1 draw call); luz e céu da atmosfera.
3. **Armas v2 e mãos**: trocar `modelos.ts`; materiais por índice; mãos no viewmodel.
4. **Boneco v2**: roupas, variantes por `id % 5`, rosto.
5. **Animações**: caminhada, recuo, recarga, plantar/desarmar, flinch.
6. **Efeitos de vida do mapa**: poeira e panos (render apenas).

Passos 1 e 2 mexem em `sim`; fazer com o handoff dos bots fechado. 3 a 6 são só cliente e podem rodar em paralelo a qualquer trabalho no sim.

## Riscos

- [Certo] Caixa de colisão nova é o único jeito de quebrar bots; a decoração nunca os afeta.
- [Provável] 109 caixas de colisão deixam o `bs-sim` um pouco mais lento (cada visada testa todas). Medir no passo 1; se pesar, fundir caixas contíguas.
- [Chute] O fps no render só se confirma jogando no navegador; o orçamento de vértices é a defesa.

## Decisões que ficam com o dono

- Aceitar o limite de B (sites no meio) ou ir para A depois.
- Direção de arte final das prévias (as imagens estão em `previa/`).
