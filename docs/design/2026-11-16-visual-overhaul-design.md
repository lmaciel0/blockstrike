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

## Vida do mapa

Entregue pelo Fable 5.2 em `docs/design/mapa-v2/` (`decoracao`, `atmosfera`, prévias 3D em `previa/`, `vida-do-mapa.md`). Só visual: nada disso entra na colisão.

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
