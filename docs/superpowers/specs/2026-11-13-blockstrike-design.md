# Block Strike — repo próprio, evolução e multiplayer online (design)

Data: 2026-11-13. Status: rascunho para aprovação. Após aprovado, vira o primeiro commit do repo novo, em `docs/superpowers/specs/`.

## Intenção e porquê

Block Strike é um FPS 5x5 em Three.js (estilo Roblox: blocos e cores chapadas) que vive hoje dentro do hub `flow-games` (lmaciel0/flow-games), junto com outros seis jogos. O dono quer levá-lo adiante como produto próprio: bots mais convincentes, balanceamento, estética melhor e multiplayer online. A Play Store é uma possibilidade futura, não meta atual.

O jogo cresceu além do hub: ~6,7 mil linhas de JS, 21 arquivos de teste, ferramentas próprias de simulação e agora precisa de servidor. Ele não cabe mais num hub estático sem build.

## Estado atual (lido do código em 2026-11-13)

- `js/games/blockstrike/`: simulação pura (`mundo`, `bots`, `granadas`, `fisica`, `armas`, `economia`, `bomba`, `rounds`, `navegacao`, `config`, `mapa`, `rng`), sem DOM nem Three.js. RNG com seed injetável. `passo(mundo, dt, comandos, ...)` recebe `dt`. Hoje o `dt` é variável (teto de 0,05 s) e não há passo fixo.
- Three.js só em `render.js`. `hud.js`, `entrada.js`, `sons.js` (Web Audio sintetizado) e `index.js` (loop, menus, contrato com o hub) são cliente.
- Bots: máquina de estados (rota, combate, cobertura, recuo, procura, posto, tarefas de bomba), A* em grafo de waypoints feito à mão, visão por cone e raycast, audição, mira com erro gaussiano por dificuldade (fácil, médio, difícil). Sem tática de equipe.
- Um mapa, definido como dados (caixas AABB, spawns, waypoints, bombsites). Sem arquivos de textura, modelo ou áudio.
- Acoplamento com o hub: contexto de `mount` (áudio, storage, confetti, conta) e cinco pontos: `js/main.js`, `index.html`, conta/placar (`js/core/conta/*`, `js/games/placar.js`), `supabase/schema.sql` (RPC `registrar_partida_blockstrike`, check do placar) e README.
- Testes (`node:test`) e simuladores sem interface vivem fora do repo, em `~/arcade-tools` (repo git próprio), e importam o jogo via variável `REPO`.
- Só PC: mouse, teclado e pointer lock. Em tela de toque o jogo se recusa.

## Objetivos

1. Repo `lmaciel0/blockstrike` independente, com o histórico git do jogo preservado.
2. Bots melhores, com resultado **medido** (ver critérios).
3. Balanceamento de armas, economia e lados, guiado por simulação em massa.
4. Estética melhor (direção definida no passo 4, com mockups).
5. Multiplayer online por **sala com código**: humanos e bots na mesma partida, servidor autoritativo.
6. Arquitetura que não bloqueie um app Android depois.

## Não objetivos (agora)

- Fila pública, matchmaking, ranking global, contas, anti-cheat sofisticado.
- Controles de toque e publicação na Play Store (só não fechar a porta).
- Mais de um mapa, skins, cosméticos.
- Mexer nos outros seis jogos do hub além de remover o Block Strike.

## Anti-objetivos (seria fracasso mesmo que "funcione")

- Bots que ganham por aimbot ou por informação que um humano não teria.
- Cliente que decide dano, bomba ou resultado de round.
- Perder o histórico git ou os dados de progresso que já estão no Supabase do hub.
- Regressão silenciosa: mudar comportamento da simulação sem os testes acusarem.

## Restrições

- Fluxo do dono (CLAUDE.md): plano aprovado antes de código; TDD; `code-reviewer` uma vez no diff final; `security-auditor` quando a mudança toca entrada externa (o servidor WebSocket toca); commit e push só quando o dono pedir.
- Agents: `typescript-pro` e `frontend-developer` (Sonnet) implementam. `Agent(model: "fable")` (Fable 5.2) e `Agent(model: "opus")` entram nas partes difíceis, por autorização do dono: arquitetura (passo 1), netcode (passo 3) e IA dos bots (passo 2).
- Navegador: o dono autorizou usar a janela atual do Brave via `agent-browser` quando precisar mexer em sites (GitHub, Vercel, Fly), com aprovação dele no navegador. Preferir as CLIs (`gh` já logado com escopo `repo`, `vercel`, `flyctl`) e usar o navegador só onde a CLI não cobrir. Se o Brave não estiver com depuração remota ativa, perguntar ao dono antes de seguir.
- Hospedagem do servidor precisa de WebSocket persistente. O Vercel não serve.
- Usuários principais no Brasil: latência importa.

## Abordagens consideradas

**A. Monorepo TypeScript: simulação compartilhada, servidor Node autoritativo (escolhida).** Pacotes `sim` (puro, usado por cliente e servidor), `client` (Three.js + Vite) e `server` (Node + `ws`). O servidor roda o mesmo `mundo.ts` e `bots.ts` que o cliente. Prós: reaproveita ~tudo, os testes atuais viram especificação do port, cliente e servidor simulam igual (predição e reconciliação confiáveis), um idioma só. Contras: exige build e port JS para TS; servidor Node single-thread (suficiente para salas de 10 jogadores).

**B. Servidor em Java (ou Go) com a simulação reescrita.** Prós: runtime mais robusto, alinha com a carreira do dono em Java. Contras: duas cópias da simulação para manter idênticas, risco alto de divergência entre predição do cliente e servidor, reescrever bots e testes. O dono disse que Java não importa neste projeto. Descartada.

**C. P2P (um jogador é o host, WebRTC).** Prós: sem servidor. Contras: o host trapaceia à vontade, NAT atrapalha, host com ping alto estraga a partida. Contraria o "servidor autoritativo". Descartada.

**D. Motor novo (Godot/Unity) com export web e Android.** Prós: Android nativo, ferramentas de mapa. Contras: joga fora o código e os testes, e nada do que o dono pediu exige isso. Descartada.

Recomendação do assistente: A. O dono delegou a escolha de linguagens ("use as que achar melhor"); a escolha acima é chamada do assistente, não algo que ele aprovou item a item.

## Decisões de projeto (chamadas do assistente, o dono pode corrigir)

- **Repo:** `lmaciel0/blockstrike`, público (mesmo perfil do hub, serve de portfólio; nenhum segredo vai no repo). Criado via `gh`. Histórico preservado extraindo `js/games/blockstrike/`, `css/games/blockstrike.css` e os specs/planos do Block Strike do `flow-games` (ex.: `git filter-repo`; detalhe fica com o builder). Testes e simuladores de `~/arcade-tools` entram no repo novo.
- **Stack:** TypeScript estrito em tudo. npm workspaces. Vite no cliente. Vitest nos testes (portando os `.test.mjs`). Three.js via npm com versão fixa (some o vendor de 671 KB). Servidor Node LTS com `ws`.
- **Estrutura:** `packages/sim`, `packages/client`, `packages/server`, `docs/`, simuladores em `tools/`.
- **Adaptadores no lugar do contexto do hub:** `AudioPort`, `StoragePort`, `Confetti` no cliente; sem `conta`. Progresso e carreira continuam locais (localStorage) no v1.
- **Identidade no v1:** convidado com apelido. Sem contas e sem Supabase no jogo novo.
- **Multiplayer v1:** sala com código de 6 caracteres. O anfitrião cria e define dificuldade dos bots; até 10 humanos (5x5); vagas vazias são preenchidas por bots que rodam **no servidor**. Servidor autoritativo, passo fixo, snapshots do servidor para o cliente, predição e reconciliação do movimento do próprio jogador, interpolação dos demais, compensação de lag para tiros hitscan. Os números (tick, taxa de snapshot, janela de rewind) e o formato do protocolo ficam para o spec de netcode, escrito no passo 3 pelo Fable.
- **Hospedagem:** cliente estático no Vercel (projeto novo). Servidor no Fly.io, região `gru` (São Paulo), com TLS (`wss`). Chamada do assistente por latência no Brasil e custo baixo; pode trocar se o dono preferir.
- **Entrada:** camada `Entrada` abstrata (teclado e mouse hoje), desenhada para aceitar toque depois sem mexer na simulação.
- **Hub `flow-games`:** em PR separado, o Block Strike sai do registro, da home, do `index.html`, do CSS, do vendor Three.js e do README; o card passa a ser um link para o site novo. Tabelas, RPC e dados do Supabase do hub **ficam intactos** (não destrutivo). Verificar que a página Placar do hub não quebra sem o jogo registrado. Merge do PR só com ok do dono.

## Passos

0. **Repo e extração.** Criar `lmaciel0/blockstrike`, extrair com histórico, portar testes e simuladores, subir CI simples (testes). Remover do hub em PR separado. Pré-requisito dos demais.
1. **Arquitetura (Fable 5.2).** Monorepo; port JS→TS da simulação com **comportamento idêntico** (mesma seed, mesmo resultado nos simuladores, antes e depois); só depois o passo fixo de simulação; adaptadores de áudio e storage; camada de entrada. Gate: todos os testes verdes e simuladores com resultado equivalente.
2. **Bots e balanceamento (Fable 5.2 na IA; simuladores sem interface para medir).** Tática de equipe, melhor uso de granadas e cobertura, mira e reação mais humanas. Metas medidas (ver critérios). Depende do passo 1 (a simulação já em TS e com passo fixo). Pode rodar antes do multiplayer, porque a IA roda na mesma simulação.
3. **Netcode (Fable 5.2 escreve o spec; `typescript-pro` implementa).** Servidor, protocolo, salas, predição, interpolação, compensação de lag, bots no servidor, reconexão básica, deploy no Fly. `security-auditor` revisa toda entrada de rede.
4. **Estética (`frontend-developer` + `ui-ux-designer`).** Só cliente; pode rodar em paralelo depois do passo 1. Direção visual a definir com o dono, com mockups, antes de implementar. Gate visual do CLAUDE.md aplica (prints em 360, 768 e 1280, tema claro e escuro, se houver `docs/DESIGN_SYSTEM.md`; o repo novo ainda não tem o kit, sugerir `/iniciar-projeto` no passo 0).
5. **Fechamento por passo:** `code-reviewer` no diff final da branch, verificação com saída real, entrada no histórico do cofre (`Projetos/blockstrike/`, hub nova) e atualização da hub `flow-games`.

## Critérios de aceite

- Passo 0: repo existe, `git log` mostra o histórico do jogo, testes rodam no repo novo, hub sem Block Strike e sem erro no console nas outras telas.
- Passo 1: mesma seed gera o mesmo resultado nos simuladores antes e depois do port; o passo fixo roda a taxa definida; zero referência a DOM ou Three.js em `packages/sim` (checado por lint ou teste).
- Passo 2 (metas iniciais, o builder pode refinar): em N partidas simuladas com seeds fixas por dificuldade, taxa de bots presos próxima de zero, vitória T×CT dentro de 45–55%, fatia de kills por arma sem uma arma acima de ~35% sem justificativa, headshot% por dificuldade em faixa definida no spec. Playtest do dono: "parecem humanos o bastante". Nenhum bot usa informação que um humano não teria.
- Passo 3: duas abas (ou mais) entram na mesma sala por código e jogam um round completo; cliente não consegue causar dano ou mudar placar por conta própria; partida tolera 150 ms de latência e 2% de perda simulados sem teleporte visível do jogador local; servidor sobrevive a mensagem malformada.
- Passo 4: aprovado pelo dono em prints antes e depois.

## Decisões adicionais após revisão (chamadas do assistente)

- **Equivalência no passo 1, em duas etapas.** (a) Port JS→TS mantendo o `dt` variável: baseline gravado antes do port com os simuladores atuais em `dt` fixo de 1/60 (`bs-sim --dt`) e seeds fixas; depois do port o resultado tem de ser **idêntico** (mesmos placares, mesmas mortes). (b) Introduzir o passo fixo: o comportamento muda de leve, então o gate vira **estatístico** (métricas dos simuladores dentro de tolerância definida no spec) contra o baseline da etapa (a).
- **Ordem de prioridade:** 0, 1, 2, 3, com 4 (estética) em paralelo depois do 1. É a ordem em que o dono listou as frentes (bots, balanceamento, estética, multiplayer).
- **Jogador que sai ou cai no meio da partida:** um bot assume a vaga imediatamente, com o mesmo loadout. Cada jogador recebe um token aleatório ao entrar (guardado no `sessionStorage`); com o token ele retoma a vaga no início do round seguinte, até o fim da partida. Sem token válido, entra como novo jogador se houver vaga. Anfitrião que sai passa o posto ao humano mais antigo da sala; sala sem humanos fecha em 60 s.
- **Início da partida:** o anfitrião pode iniciar com 1 humano ou mais; o resto das vagas é preenchido por bots.
- **Histórico na extração:** o repo novo contém só arquivos do jogo; a fiação do hub (`main.js`, `schema.sql`, conta/placar) fica no histórico do hub.
- **Progresso (resposta do dono):** só o dono usa o hub. Sem migração; progresso e carreira ficam locais no v1.
- **Escala do v1 (ajustada pelo dono):** começar com 5 a 10 salas simultâneas (até ~100 jogadores) numa máquina pequena do Fly, sem roteamento por sala; o servidor recusa sala nova acima do limite configurável (padrão 10). Limites básicos de taxa de mensagens por conexão e por IP, e tamanho máximo de mensagem. Mais de uma máquina fica para depois.
- **Hitboxes e estética:** formas de hitbox (cabeça, tronco, pernas) vêm da simulação atual (`fisica`) e são congeladas antes do passo 3. O passo 4 muda só a aparência; se o modelo visual exigir outra geometria de hitbox, volta ao passo 3 para retestar a compensação de lag.
- **Modelos:** se `Agent(model: "fable")` ou `"opus"` não estiver disponível, o assistente avisa o dono e cai para o próximo disponível (opus, depois sonnet), sem mudar o escopo.

## Fica com o builder

Taxas de tick e snapshot, formato do protocolo (JSON ou binário), biblioteca de empacotamento, método exato de extração do git, estrutura interna dos pacotes, técnica de IA dos bots (utility AI, behavior tree ou ajuste do estado atual), valores finais das metas de balanceamento, detalhes de CI.

## Riscos conhecidos

- Predição do cliente diverge do servidor se a simulação não for determinística entre Node e navegador (ponto flutuante). O passo fixo e testes de equivalência mitigam.
- O RNG de `sons.js` usa `Math.random`; é só áudio e fica fora da simulação.
- Dados de progresso do Block Strike no Supabase do hub (projeto pausado segundo a hub do cofre) ficam sem uso; decisão futura sobre migrar ou arquivar.
- Existe uma cópia obsoleta do jogo em `flow-games/.claude/teste/main/` (ignorada pelo git); não entra na extração.
