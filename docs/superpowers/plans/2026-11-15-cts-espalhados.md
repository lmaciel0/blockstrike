# CTs espalhados no posto e na ida — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** CTs do mesmo bombsite deixam de andar colados pelo mesmo caminho e de ficar empilhados no mesmo waypoint de posto.

**Architecture:** Bug achado no playtest do Plano 2 (PR #1), já presente no `main`. Em `bots.ts`, `destinoBomba` manda todo CT do site (`ent.id % 2`) para o mesmo `sites[site].espera[casaZ]`. A correção espelha o que os Ts já têm (`ESPALHAR` + `espalharNoSite`): cada CT ganha um ponto próprio em volta do `espera` (Task 1) e uma rota de ida que evita os waypoints internos das rotas dos colegas do mesmo site (Task 2). Entra na mesma branch e no mesmo PR do Plano 2.

**Tech Stack:** TypeScript estrito, npm workspaces, Vitest (`packages/sim/test`), `node:test` via `tsx` (`tests/*.test.mjs`).

**Spec:** `docs/superpowers/specs/2026-11-14-plano-2-mira-humana-e-balanceamento-design.md` (o comportamento de posto é alavanca de balanceamento lá; geometria do mapa e spawns não mudam). Aprovação do dono em 2026-11-15: "sim" para posto espalhado e "sim" para rotas de ida diferentes.

**Reprodução:** `npx tsx <scratchpad>/ct-colados.mts "$PWD"` (script da sessão anterior, pode não existir mais). Equivalente: cenário de `packages/sim/test/bots-espalhados.test.ts`, Ts mortos, 20 s em dt 0,05; medido nas seeds 1..3: na ida os CTs do mesmo site ficam a 1–2 m; no posto, a partir de ~15 s, a 0,0–0,1 m.

## Global Constraints

- Branch `feat/plano-2-mira-humana` (PR #1 aberto); um commit por tarefa; push só com ok do dono; merge nunca sem ok.
- `packages/sim` sem DOM e sem Three.js; determinístico: nenhum sorteio novo (nem `Math.random`), tudo derivado de ids e do grafo.
- Geometria do mapa, spawns e dados de `mapa.ts` não mudam.
- No posto, a mão virtual continua movida no máximo uma vez por passo (teste em `packages/sim/test/bots-mao.test.ts`).
- O `semDireto` (desencalhe desliga o caminho direto) continua valendo para o andar até o ponto do posto.
- CLIs que carregam o sim rodam com `node --import tsx`. Durante as tarefas, `tools/baseline/ts-plano2.json` é regenerado só com seeds 1..5: `node --import tsx tools/baseline.mjs --out=tools/baseline/ts-plano2.json --seeds=1..5 --dt=relogio`; as 30 seeds só na Task 3.
- Código escrito pelo agent `typescript-pro` (Sonnet).

## Review Focus

1. **CT morto ou ausente no meio do round:** o índice de cada CT no site não muda quando um colega morre (ordem estável por id entre todos os CTs do time com o mesmo site), para ninguém trocar de ponto no meio do posto. Teste na Task 1 (`posto: índice do CT não muda quando um colega morre`).
2. **Ponto do posto dentro de caixa ou sem visada:** o CT fica no waypoint `espera` e entra em posto mesmo assim, sem ficar tentando andar. Teste na Task 1 (`posto: ponto bloqueado fica no waypoint`).
3. **Sem caminho alternativo no grafo:** a rota volta a ser a mais curta, sem rota vazia. Teste na Task 2 (`caminho: proibidos que desconectam dão []` e `rota: sem alternativa usa o caminho mais curto`).
4. **C4 plantada depois de o CT chegar ao ponto:** sai do posto e segue para a C4 como hoje (`chaveBomba` muda). Coberto pelos testes existentes de `bots-posto.test.ts`, que precisam continuar verdes.

---

### Task 1: ponto próprio de cada CT no posto

**Files:**
- Modify: `packages/sim/src/bots.ts` (`tarefaBomba` no ramo CT antes da plantada; entrada no estado `posto` perto da linha 755)
- Test: `packages/sim/test/bots-espalhados.test.ts`

**Interfaces:**
- Produces: `indiceNoSite(ent: Entidade, mundo: Mundo): number` (não exportada): posição de `ent`, por id crescente, entre **todas** as entidades do time de `ent` com a mesma paridade de id (`id % 2`, a mesma regra de site de `destinoBomba`), vivas ou não.
- Produces: `pontoDoPosto(ent: Entidade, mundo: Mundo, site: Site): PontoXZ` (não exportada). Com `w` = posição do waypoint `sites[site].espera[c.casaZ]`, `m` = `sites[site].mira[c.casaZ]`, `d` = unitário de `w` para `m` no plano XZ e `p` = perpendicular `(-d.z, d.x)`: ponto = `w + p × OFFSET_POSTO[indiceNoSite % OFFSET_POSTO.length]`, com `const OFFSET_POSTO = [0, 3, -3, 6, -6]` (m).
- Comportamento: em `tarefaBomba`, para o CT com `chaveBomba` começando por `espera:` e a C4 não plantada, quando estiver a até `PERTO_DO_SITE` (8 m) do `espera`: no ponto (< 0,6 m) → `{ parado: true, segurar: true }`; ponto com `veDireto` e fora de caixa → `{ direto: ponto, segurar: true }`; senão → `{ segurar: true }` (fica no waypoint). Longe do `espera` continua `{ segurar: true }` como hoje. O CT entra em `estado = 'posto'` quando chega ao ponto (`parado`) **ou** quando a rota acabou no `espera` e o ponto é inalcançável (regra de hoje).

- [ ] **Step 1: testes falhando** em `bots-espalhados.test.ts` (usar `cenario()` e `rodar()` do arquivo, Ts mortos com `matar`):
  - `no posto os CTs do mesmo site ficam a pelo menos 2 m uns dos outros` — 20 s; todo par de CTs vivos com o mesmo `chaveBomba` `espera:*` e `estado === 'posto'` tem distância XZ ≥ 2; e ao menos um CT do A está em `posto`.
  - `posto: índice do CT não muda quando um colega morre` — após 20 s, guardar a posição de cada CT em posto; matar o CT de menor id do A (`vivo = false`); rodar mais 3 s; os demais CTs do A estão a < 0,6 m da posição guardada.
  - `posto: ponto bloqueado fica no waypoint` — mapa com uma caixa sobre os pontos ±3 m do `espera` do A (cópia de `MAPA` com `caixas` acrescidas, sem alterar `MAPA`); após 20 s, os CTs do A estão em `posto` e nenhum tem `cmd.frente`/`cmd.lado` ≠ 0 nos últimos 2 s.
- [ ] **Step 2:** `npx vitest run packages/sim/test/bots-espalhados.test.ts` → FAIL nos três (hoje a distância é 0,0 m).
- [ ] **Step 3:** implementar `indiceNoSite`, `OFFSET_POSTO`, `pontoDoPosto`, o ramo CT de `tarefaBomba` e a entrada em `posto`.
- [ ] **Step 4:** `npx vitest run packages/sim/test` → PASS (inclui `bots-posto`, `bots-mao`, `bots-mira`). Teste antigo que quebrar por mudança intencional é reescrito com comentário do porquê.
- [ ] **Step 5:** regenerar `ts-plano2.json` com seeds 1..5; `npm test && npm run typecheck` → PASS; `npm run baseline:check` → `IDENTICO`.
- [ ] **Step 6: Commit** `fix(bots): CTs do mesmo site se espalham no posto`.

### Task 2: rotas de ida diferentes para CTs do mesmo site

**Files:**
- Modify: `packages/sim/src/navegacao.ts` (`caminho`), `packages/sim/src/bots.ts` (`rotaDoRound`)
- Test: `packages/sim/test/navegacao.test.ts`, `packages/sim/test/bots-espalhados.test.ts`

**Interfaces:**
- Consumes: `indiceNoSite(ent, mundo)` (Task 1).
- Produces: `caminho(grafo: Grafo, deId: number, paraId: number, proibidos?: ReadonlySet<number>): number[]` — igual ao de hoje, mas sem passar por nenhum id de `proibidos` (`deId` e `paraId` nunca são proibidos); `[]` se não houver caminho. Sem o parâmetro, resultado idêntico ao atual.
- Produces em `bots.ts`: `comprimento(grafo: Grafo, rota: number[]): number` (soma das arestas em m) e `const ROTA_ALT_MAX = 1.5`.
- Comportamento: em `rotaDoRound`, CT com destino `espera:*` e `k = indiceNoSite(ent, mundo) > 0`: as rotas dos colegas de índice `0..k-1` são recalculadas pela mesma regra (determinística, sem estado compartilhado). Tenta `caminho(..., proibidos = waypoints internos das rotas de 0..k-1)`; se vazio ou `comprimento > ROTA_ALT_MAX × comprimento(mais curto)`, tenta proibindo só os internos da rota do índice 0; se ainda falhar, usa o mais curto (como hoje). Ts e CTs depois da plantada não mudam.

- [ ] **Step 1: testes falhando:**
  - `navegacao.test.ts`: `caminho: proibidos desviam do nó` (grafo em losango 0–1–3 e 0–2–3, arestas iguais: `caminho(g,0,3,new Set([1]))` = `[0,2,3]`); `caminho: proibidos que desconectam dão []` (`new Set([1,2])` → `[]`); `caminho: sem proibidos é o de hoje` (mesmo resultado com e sem `new Set()`).
  - `bots-espalhados.test.ts`: `na ida os CTs do mesmo site não seguem o mesmo caminho` — logo após `cenario()`, as rotas iniciais (`cerebro.rota`) dos CTs de índice 0 e 1 do A diferem em ao menos um waypoint interno; e `rota: sem alternativa usa o caminho mais curto` — em grafo de linha (sem alternativa), a rota do índice 1 é igual à do índice 0.
- [ ] **Step 2:** `npx vitest run packages/sim/test/navegacao.test.ts packages/sim/test/bots-espalhados.test.ts` → FAIL.
- [ ] **Step 3:** implementar `proibidos` em `caminho`, `comprimento`, `ROTA_ALT_MAX` e a regra em `rotaDoRound`.
- [ ] **Step 4:** `npx vitest run packages/sim/test` → PASS. Rodar o cenário de reprodução (20 s, seeds 1..3): nenhum par de CTs do mesmo site a < 2 m no posto; anotar as distâncias na ida (t = 5 s e 10 s) no relatório.
- [ ] **Step 5:** `node --import tsx tools/bs-varredura.mjs --rapido` (uma dificuldade por comando se o tempo estourar) e `npx tsx --test tests/duelo.test.mjs` → PASS; anotar vitória T, arma topo, headshot, 1º acerto, desencalhes e mudos no commit.
- [ ] **Step 6:** regenerar `ts-plano2.json` com seeds 1..5; `npm test && npm run typecheck && npm run build -w @blockstrike/client` → PASS; `npm run baseline:check` → `IDENTICO`.
- [ ] **Step 7: Commit** `feat(bots): CTs do mesmo site vão por caminhos diferentes`.

### Task 3: baseline completo, números finais e PR (controller)

**Files:**
- Modify: `tools/baseline/ts-plano2.json`, `tools/baseline/varredura-depois.json`, `docs/balanceamento.md`, descrição do PR #1

- [ ] **Step 1:** em paralelo, em segundo plano: `node --import tsx tools/baseline.mjs --out=tools/baseline/ts-plano2.json --seeds=1..30 --dt=relogio` e `node --import tsx tools/bs-varredura.mjs --seeds=1..30 --verificar --out=tools/baseline/varredura-depois.json` (~20 min cada).
- [ ] **Step 2:** `npm run baseline:check` → `IDENTICO`; `npm test` → PASS.
- [ ] **Step 3:** atualizar `docs/balanceamento.md`: nova tabela "Final" (a de 4b8bf2f vira histórico), uma linha em "Mudanças" para o posto espalhado e as rotas, e o texto de "Metas fora da faixa" com os números novos de vitória T e rifle.
- [ ] **Step 4: Commit** `chore(baseline): ts-plano2 e varredura final com CTs espalhados`.
- [ ] **Step 5:** com ok do dono: `git push` e atualizar a descrição do PR #1 (tabela final; marcar o item "dois CTs andando colados"). Continua pendente: playtest do dono e a decisão sobre headshot (`MULT_PARTE`/`COLETE` ou a regra "tronco escondido → cabeça"). Merge só com ok.
