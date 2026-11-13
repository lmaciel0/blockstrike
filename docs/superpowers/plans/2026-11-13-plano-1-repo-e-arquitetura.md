# Block Strike — Plano 1: repo próprio e arquitetura (passos 0 e 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tirar o Block Strike do hub `flow-games` para o repo `lmaciel0/blockstrike`, portar a simulação para TypeScript com resultado idêntico, introduzir passo fixo de simulação e publicar o cliente standalone.

**Architecture:** Monorepo npm workspaces. `packages/sim` (simulação pura, sem DOM) e `packages/client` (Three.js + Vite). O servidor (`packages/server`) NÃO entra neste plano: é o Plano 3. Os testes `node:test` viram Vitest junto com o port de cada módulo.

**Tech Stack:** TypeScript estrito, Node 22, npm workspaces, Vite, Vitest, Three.js 169 (mesma revisão do vendor atual), `tsx` para scripts, GitHub Actions, Vercel (cliente).

**Spec:** `/home/lmaciel0/Documentos/Cofre Pessoal/Projetos/blockstrike/2026-11-13-blockstrike-design.md` (vira `docs/superpowers/specs/2026-11-13-blockstrike-design.md` no repo novo, Task 1). Este plano cobre os passos 0 e 1 do spec. Os Planos 2 (bots e balanceamento), 3 (netcode) e 4 (estética) são escritos depois, cada um com seu design detalhado (o de netcode pelo Fable).

## Global Constraints

- Repo `lmaciel0/blockstrike`, **público**, sem segredos. Criado com `gh` (já logado, escopo `repo`).
- TypeScript `strict: true`. `packages/sim` compila com `lib: ["ES2022"]` **sem DOM**: qualquer `document`/`window` é erro de compilação.
- Identificadores e comentários existentes ficam em português e **não são removidos nem encurtados** no port.
- Três.js via npm na revisão exata `0.169.0`; some `js/vendor/three.module.min.js`.
- Port JS→TS com **comportamento idêntico** (mesma seed, mesmo resultado) antes de qualquer mudança de comportamento. Passo fixo só depois (Task 12).
- Simulação: `TICK_HZ = 60` como padrão provisório; o spec de netcode (Plano 3) pode mudar.
- Histórico git do jogo preservado; repo novo só com arquivos do jogo.
- Commits convencionais em português (`feat:`, `fix:`, `chore:`), um por task. **Push e merge só onde o plano manda** (Task 1 e Task 13: push; Task 14: PR sem merge); no resto, só quando o dono pedir.
- Migração JS→TS: todo módulo do sim vira `.ts` já na Task 4, com `// @ts-nocheck` na primeira linha (sem remover comentários existentes); cada task seguinte tira o `@ts-nocheck` dos módulos que porta e tipa. Testes legados `.mjs` rodam com `tsx --test` (resolve `./x.js` para `x.ts`); testes portados rodam com Vitest. `npm test` roda os dois.
- Quem implementa: `typescript-pro` (Sonnet). Tasks 5, 9 e 12 são arquitetura: `Agent(model: "fable")`, com `typescript-pro` como agent. Se `fable` indisponível, usar `opus` e avisar o dono.
- Navegador: preferir CLIs (`gh`, `vercel`). Se precisar do navegador, `agent-browser` na janela atual do Brave, com aprovação do dono lá.
- Saídas de build e teste filtradas (resumo e falhas).

## Review Focus

- **dt enorme** (aba em segundo plano volta com 5 s): o relógio de passo fixo limita os passos por quadro e descarta o excedente, sem travar. Teste na Task 12.
- **`localStorage` lançando exceção** (modo privado, cota): `StoragePort` cai para memória e o jogo abre. Teste na Task 10A.
- **Preferências salvas corrompidas** (`lerMira`, `lerCarreira` com lixo ou `null`): voltam ao padrão sem exceção. Teste na Task 10A.
- **Sem WebGL ou tela só de toque:** aviso "Disponível apenas no computador" e nenhuma instância ativa, como hoje. Teste na Task 10B.
- **Seed `0`, negativa ou não inteira** em `criarRng`: resultado determinístico e sem `NaN`. Teste na Task 6.

---

## Fase A — Passo 0: repo e extração

### Task 1: Criar o repo com o histórico extraído

**Files:**
- Create: repo `~/Área de trabalho/repositorios/blockstrike/` (clone novo; o `flow-games` não é alterado nesta task)
- Create: `LICENSE` (cópia do hub), `README.md` (curto), `docs/superpowers/specs/2026-11-13-blockstrike-design.md`, `docs/superpowers/plans/2026-11-13-plano-1-repo-e-arquitetura.md`

**Interfaces:**
- Produces: repo local e remoto `origin/main` com histórico do jogo; layout plano herdado do hub: `js/games/blockstrike/*.js`, `css/games/blockstrike.css`.

- [ ] **Step 1: Instalar `git-filter-repo`**

Run: `pipx install git-filter-repo || pip3 install --user git-filter-repo`
Expected: `git filter-repo --version` imprime uma versão.

- [ ] **Step 2: Clonar o hub em pasta de trabalho e filtrar**

Clone local de `flow-games` em `~/Área de trabalho/repositorios/blockstrike`. Rode `git filter-repo` mantendo só `--path js/games/blockstrike/ --path css/games/blockstrike.css --path LICENSE --path docs/superpowers/specs/2026-10-16-block-strike-design.md --path docs/superpowers/specs/2026-10-21-block-strike-granada-compra-bots-design.md --path docs/superpowers/plans/2026-10-16-block-strike.md --path docs/superpowers/plans/2026-10-21-block-strike-granada-compra-bots.md` (confirme com `ls docs/superpowers/*` no hub se há outros specs ou planos do Block Strike, e inclua). Não entram: `js/vendor/`, `js/core/`, `.claude/`, `.vercel/`.

- [ ] **Step 3: Verificar o histórico**

Run: `git log --oneline | wc -l` e `git log --oneline -3`
Expected: dezenas de commits (o arquivo `mundo.js` sozinho tem 18). O topo pode ser um `Merge pull request #22`; confira que `fix(blockstrike): ajustes da revisão da molotov` aparece nos primeiros commits. `js/games/blockstrike/melhorias v1/melhorias.md` é versionado e entra na extração (a Task 4 o move). `docs/blockstrike-testes/` existe só na branch `feat/block-strike-drop-armas` e fica fora.

- [ ] **Step 4: Adicionar docs e README**

Copiar design e este plano do cofre para `docs/superpowers/{specs,plans}/`. `README.md`: nome, uma linha de descrição, "em migração para TypeScript (ver plano)".

- [ ] **Step 5: Criar o repo remoto e dar push**

Run: `gh repo create lmaciel0/blockstrike --public --source=. --remote=origin --push`
Expected: URL do repo impressa; `gh repo view lmaciel0/blockstrike --json visibility` = `PUBLIC`.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "docs: design e plano 1 do repo próprio"
git push origin main
```

- [ ] **Step 7: Sugerir `/iniciar-projeto` ao dono** para o repo novo (AGENTS.md e `docs/` do kit), conforme o CLAUDE.md; não rodar sem o ok.

### Task 2: Trazer testes e simuladores e rodar no repo novo

**Files:**
- Create: `tests/*.test.mjs` (21 arquivos de `~/arcade-tools/blockstrike/`), `tests/_repo.mjs`, `tools/bs-*.mjs` (simuladores sem navegador: `bs-sim`, `bs-sim-partida`, `bs-sim-bomba`, `bs-presos`, `bs-duelo`), `package.json`, `.github/workflows/ci.yml`

**Interfaces:**
- Produces: `npm test` roda os 21 arquivos; `REPO` padrão = raiz do repo.

- [ ] **Step 1: Registrar o resultado atual no hub (referência)**

Run (em `~/arcade-tools`): `REPO="<flow-games>" node --test blockstrike/ 2>&1 | tail -8`
Expected: anote `# tests N`, `# pass N`, `# fail 0`. Esse N é o critério desta task.

- [ ] **Step 2: Copiar arquivos e ajustar `tests/_repo.mjs`**

`mod = (p) => import(pathToFileURL(path.join(process.env.REPO ?? process.cwd(), p)).href)`. Copiar só os simuladores sem puppeteer. `package.json`: `"type": "module"`, devDependencies `tsx`, `vitest`, `typescript`, `puppeteer-core`; script `"test": "tsx --test tests/"` (a Task 4 acrescenta o Vitest).

- [ ] **Step 3: Rodar no repo novo**

Run: `npm test 2>&1 | tail -8`
Expected: mesmo N de testes passando, 0 falhas.

- [ ] **Step 4: CI**

`.github/workflows/ci.yml`: em `push` e `pull_request`, Node 22, `npm ci`, `npm test`. Verificar com `gh run watch` após o push do Task 14, ou localmente com `act` se existir; o critério aqui é o arquivo existir e o YAML ser válido (`python3 -c "import yaml;yaml.safe_load(open('.github/workflows/ci.yml'))"`).

- [ ] **Step 5: Commit** — `chore: testes e simuladores no repo novo`

### Task 3: Gravar o baseline do código JS atual

**Files:**
- Create: `tools/baseline.mjs`, `tools/baseline/js-dt60.json`
- Test: `tests/baseline.test.mjs`

**Interfaces:**
- Produces: `resumoPartida(carregar, dif, seed, opcoesDt) -> { rounds:number, placar:{azul:number, laranja:number}, mortes:number, cabecas:number, presos:number, dinheiroFinal:number[], hash:string }`, onde `carregar(nome)` devolve o módulo do sim (`mundo`, `bots`, `rounds`, `navegacao`, `mapa`, `config`, `rng`, `fisica`, `economia`, `bomba`) e `opcoesDt = { modo: 'fixo', dt: number } | { modo: 'variavel', seed: number }` (variável: `dt` sorteado por RNG com seed em `[1/144, 0.05]`, o teto atual de `index.js:589`). `hash` = FNV-1a de 32 bits sobre a sequência `(tick, vitima, assassino, arma, cabeca)` de cada evento `morte` (campos reais de `mundo.js:277` e `bomba.js:50`). `presos` = contagem de episódios de bot preso, com a definição de `tools/bs-presos.mjs`. CLI: `npx tsx tools/baseline.mjs --out=<arquivo> [--seeds=1..5] [--dt=fixo|variavel]`.
- Consumes: o laço de `tools/bs-sim-partida.mjs` (partida completa **com economia, compra, C4 e granadas**), não o de `bs-sim.mjs`, que não exercita `economia` nem `bomba`.

- [ ] **Step 1: Escrever o teste que falha** — `baseline.test.mjs`: `resumoPartida` com `('medio', 3, 1/60)` chamado duas vezes devolve objetos `deepEqual`; `hash` é string de 8 hex; `rounds >= 13`.
- [ ] **Step 2: Rodar e ver falhar** — `node --test tests/baseline.test.mjs`; Expected: FAIL (módulo inexistente).
- [ ] **Step 3: Implementar `tools/baseline.mjs`** extraindo o laço de `bs-sim-partida.mjs` para função que recebe `carregar` (sem `process.argv` no escopo do módulo). Também cobre `dt` fixo e variável.
- [ ] **Step 4: Teste passa** — mesmo comando; Expected: PASS.
- [ ] **Step 5: Gravar os baselines** — `npx tsx tools/baseline.mjs --dt=fixo --out=tools/baseline/js-dt60.json` e `--dt=variavel --out=tools/baseline/js-dt-variavel.json`, com facil, medio, dificil × seeds 1 a 5. Rodar cada um duas vezes e `diff`: Expected: sem diferença. O segundo é a referência da Task 12.
- [ ] **Step 6: Commit** — `chore: baseline determinístico do código JS`

## Fase B — Passo 1: arquitetura e port para TypeScript

Gate comum a toda task desta fase: `npm run baseline:check` imprime `IDENTICO` (compara a saída atual com `tools/baseline/js-dt60.json`) e a suíte da task passa. Exceção: Task 12, que muda o comportamento de propósito.

### Task 4: Esqueleto do monorepo e relocação dos arquivos

**Files:**
- Create: `package.json` (workspaces `packages/*`, scripts `test`, `typecheck`, `baseline:check`), `tsconfig.base.json` (`strict`, `module: ESNext`, `moduleResolution: Bundler`, `target: ES2022`), `packages/sim/{package.json,tsconfig.json}` (`lib: ["ES2022"]`, sem DOM), `packages/client/{package.json,tsconfig.json,vite.config.ts}`
- Move (`git mv`, preserva histórico): módulos da simulação `config mapa rng fisica armas economia bomba rounds navegacao granadas bots mundo` → `packages/sim/src/*.ts` (extensão `.ts` já aqui, com `// @ts-nocheck` na primeira linha; imports internos seguem `./x.js`); cliente `carreira mira modelos entrada sons hud render index` → `packages/client/src/*.js` (viram `.ts` na Task 10B); `css/games/blockstrike.css` → `packages/client/src/estilos/blockstrike.css`; `js/games/blockstrike/melhorias v1/melhorias.md` → `docs/melhorias/melhorias.md`
- Modify: `tests/*.test.mjs` e `tests/baseline.test.mjs` (caminho passa de `js/games/blockstrike/x.js` para `packages/sim/src/x.js`; `sons.test` aponta para `packages/client/src/sons.js`), `tools/*.mjs` (mesmos caminhos)

**Interfaces:**
- Produces: nomes de workspace `@blockstrike/sim` e `@blockstrike/client`; scripts `npm test` (todas as suítes), `npm run typecheck`, `npm run baseline:check` (roda `tools/baseline.mjs` para arquivo temporário e `diff` contra `tools/baseline/js-dt60.json`, imprime `IDENTICO` ou o diff).

- [ ] **Step 1: Teste que falha** — adicionar em `tests/baseline.test.mjs` o caso "baseline:check imprime IDENTICO" que executa o script npm e verifica a saída. Rodar: Expected FAIL (script inexistente).
- [ ] **Step 2: Mover os arquivos com `git mv`** conforme a lista (sim já como `.ts` com `@ts-nocheck`); ajustar os caminhos nos testes e ferramentas.
- [ ] **Step 3: Criar os `package.json`/`tsconfig`** (sim com `allowJs: false`, `noEmit`, sem DOM) e os scripts: `test` = `tsx --test tests/ && vitest run`, `baseline:check`. `npm install` na raiz.
- [ ] **Step 4: Rodar a suíte** — `npm test 2>&1 | tail -8`; Expected: mesmo N da Task 2, 0 falhas (o Vitest sem arquivos de teste ainda não deve falhar: usar `vitest run --passWithNoTests`); `npm run baseline:check`: `IDENTICO`.
- [ ] **Step 5: Commit** — `chore: monorepo npm workspaces e relocação dos módulos`

### Task 5: Tipos do domínio (arquitetura, Fable)

**Files:**
- Create: `packages/sim/src/tipos.ts`
- Test: `packages/sim/test/tipos.test.ts`

**Interfaces:**
- Produces (todos exportados de `tipos.ts`, campos derivados do código real de `mundo.js`, `bots.js`, `armas.js`, `bomba.js`, `rounds.js`, `economia.js`): `Vec3`, `Caixa { min: Vec3; max: Vec3; cor: number | string }`, `Rng = () => number`, `Arma`, `Equip`, `Entidade`, `Comandos`, `Cerebro`, `Bomba`, `Partida`, `Mundo`, e `Evento` como **união discriminada por `tipo`** cobrindo todo `tipo:` que o sim emite em `eventos.push`.
- Consumes: nenhum.

- [ ] **Step 1: Levantar os `tipo:` de evento e a forma real de cada objeto** — `grep -rn "tipo:" packages/sim/src` e leitura de `criarMundo`, `criarCerebro`, `criarPartida`, `criarBomba`, `criarArma`. Registrar a lista no topo de `tipos.ts` como comentário.
- [ ] **Step 2: Escrever o teste que falha** — `tipos.test.ts` usa `expectTypeOf` para: `Evento` tem `tipo` literal em todos os membros; `Entidade` tem `id`, `time`, `vivo`, `pos: Vec3`; `Mundo['entidades']` é `Entidade[]`. Rodar `npx vitest run packages/sim/test/tipos.test.ts --typecheck`; Expected: FAIL.
- [ ] **Step 3: Implementar `tipos.ts`** sem `any`; campos opcionais só onde o JS realmente omite o campo.
- [ ] **Step 4: Teste passa** — mesmo comando; Expected: PASS.
- [ ] **Step 5: Commit** — `feat(sim): tipos do domínio`

### Task 6: Port dos módulos folha (`config`, `mapa`, `rng`, `fisica`, `armas`)

**Files:**
- Modify: `packages/sim/src/{config,mapa,rng,fisica,armas}.ts` (remover `// @ts-nocheck`, tipar)
- Test: `packages/sim/test/{armas,fisica,mapa,rng}.test.ts` (port de `tests/{armas,fisica,mapa}.test.mjs` + `rng` novo); apagar os `.mjs` correspondentes

**Interfaces:**
- Consumes: `tipos.ts` (Task 5).
- Produces (assinaturas tipadas, mesmos nomes): `criarRng(seed: number): Rng`; `moverComColisao(pos: Vec3, desloc: Vec3, raio: number, altura: number, caixas: Caixa[]): Vec3`; `raycastCaixas(origem: Vec3, dir: Vec3, caixas: Caixa[], maxDist: number): { dist: number; ponto: Vec3; /* demais campos reais */ } | null`; `hitboxes(ent: Entidade)`, `raycastEntidades(...)`, `temVisada(a: Vec3, b: Vec3, caixas: Caixa[]): boolean`, `olho`, `direcao`; `criarArma`, `danoDe`, `podeAtirar`, `calcularSpread`, `disparar` com tipos de `Arma`.

- [ ] **Step 1: Port dos testes existentes para Vitest** (imports diretos de `../src/x.js`; asserts idênticos) e escrever `rng.test.ts`: para `seed` em `0`, `-5`, `1.5`, 20 chamadas de `criarRng(seed)()` são finitas, em `[0, 1)`, e duas instâncias com a mesma seed geram a mesma sequência.
- [ ] **Step 2: Rodar** — `npx vitest run packages/sim/test 2>&1 | tail -8`; Expected: o port dos testes existentes passa (o código ainda é o mesmo); só `rng.test.ts` pode falhar se `criarRng` não cobrir um dos casos. O que fecha esta task é o typecheck do Step 3.
- [ ] **Step 3: Remover `@ts-nocheck` e tipar** sem mudar a lógica; `npx tsc --noEmit -p packages/sim` sem erro **nestes cinco arquivos** (os demais ainda têm `@ts-nocheck`).
- [ ] **Step 4: Rodar** — `npx vitest run packages/sim/test`; Expected: PASS; `npm test` (restante em `.mjs`) PASS; `npm run baseline:check`: `IDENTICO`.
- [ ] **Step 5: Commit** — `refactor(sim): port para TypeScript dos módulos folha`

### Task 7: Port de `economia`, `bomba`, `rounds`, `navegacao`

**Files:**
- Modify: `packages/sim/src/{economia,bomba,rounds,navegacao}.ts` (remover `@ts-nocheck`, tipar)
- Test: `packages/sim/test/{economia,bomba,bomba-rounds,rounds,navegacao}.test.ts` (port dos `.mjs`; apagar os antigos)

**Interfaces:**
- Consumes: `tipos.ts`, módulos da Task 6.
- Produces: `criarPartida(opcoes?: Partial<OpcoesPartida>): Partida`; `tickPartida(p: Partida, dt: number, vivos: Vivos, bomba: Bomba | null): string[]` (nomes de evento de round: `'fim-round'`, `'novo-round'`, `'troca-lados'`); `terroristasDe(round: number)`, `ladoAzul(round: number)`, `vencedorPorTempo(vivos: Vivos)`; `criarBomba(mundo: Mundo, terroristas: number): Bomba`, `siteEm`, `acaoPossivel`, `tickBomba(mundo: Mundo, dt: number, agindo: Agindo, eventos: Evento[])`; `iniciarEconomia(mundo)`, `resetarEconomia`, `premiarKill`, `premiarRound`, `perderEquip`, `equipVazio`; `criarGrafo(waypoints, arestas)`, `caminho(grafo, deId, paraId)`, `maisProximo`, `coberturaPerto`. Tipos auxiliares (`OpcoesPartida`, `Vivos`, `Agindo`, `Grafo`) ficam em `tipos.ts` (acrescentar nesta task).

- [ ] **Step 1: Port dos testes para Vitest**, asserts idênticos.
- [ ] **Step 2: Rodar** — `npx vitest run packages/sim/test`; Expected: PASS (o código ainda é o mesmo; fecha a task o typecheck).
- [ ] **Step 3: Remover `@ts-nocheck` e tipar**; `npx tsc --noEmit -p packages/sim` limpo nos arquivos já tipados.
- [ ] **Step 4: Rodar** — Expected: PASS; `npm run baseline:check`: `IDENTICO`.
- [ ] **Step 5: Commit** — `refactor(sim): port de economia, bomba, rounds e navegação`

### Task 8: Port de `granadas` e `bots`

**Files:**
- Modify: `packages/sim/src/{granadas,bots}.ts` (remover `@ts-nocheck`, tipar)
- Test: `packages/sim/test/{granadas,granada-mao,bots,bots-bomba,bots-cabeca,bots-espalhados,bots-posto,bots-presos,bots-procura,ouvido}.test.ts` (port; apagar os `.mjs`)

**Interfaces:**
- Consumes: `tipos.ts`, Tasks 6 e 7.
- Produces: `lancar(mundo: Mundo, e: Entidade, tipo: TipoGranada, eventos: Evento[], alvo?: Vec3 | null, forca?: 'longe' | 'medio' | 'curto'): void` (`granadas.js:23`); `granadasDe`, `proximaGranada`, `criarMao`, `atualizarMao`; `criarCerebro(ent: Entidade, grafo: Grafo, rng: Rng, caixas?: Caixa[], mundo?: Mundo | null): Cerebro`; `pensar(...)` com a assinatura atual; `escolherPrimaria(indiceNoTime: number, rng: Rng)`; `ouvir(ent: Entidade, mundo: Mundo, c: Cerebro)`. `TipoGranada = 'he' | 'molotov' | 'flash' | 'smoke'` (de `ORDEM_GRANADAS`).

- [ ] **Step 1: Port dos testes** (preservar asserts; são os de maior volume, `granadas.test` e `bots.test`).
- [ ] **Step 2: Rodar** — `npx vitest run packages/sim/test`; Expected: PASS (mesmo código).
- [ ] **Step 3: Remover `@ts-nocheck` e tipar**; sem mudar a lógica do `pensar`; `npx tsc --noEmit -p packages/sim` limpo nos arquivos já tipados.
- [ ] **Step 4: Rodar** — Expected: PASS; `baseline:check`: `IDENTICO`.
- [ ] **Step 5: Commit** — `refactor(sim): port de granadas e bots`

### Task 9: Port de `mundo`, API pública e pureza (arquitetura, Fable)

**Files:**
- Modify: `packages/sim/src/mundo.ts` (remover `@ts-nocheck`, tipar)
- Create: `packages/sim/src/index.ts` (barrel), `packages/sim/test/pureza.test.ts`
- Test: `packages/sim/test/{mundo,mundo-granada}.test.ts` (port; apagar os `.mjs`)
- Modify: `tools/bs-sim*.mjs`, `tools/bs-presos.mjs`, `tools/bs-duelo.mjs` (caminhos para `packages/sim/src`, rodando com `npx tsx`)

**Interfaces:**
- Consumes: todas as anteriores.
- Produces: `criarMundo(op: { mapa: Mapa; primariaJogador: TipoArma; dificuldade: Dificuldade | string; rng: Rng; modo?: 'partida' | 'treino' }): Mundo` (confirmar `modo` no código); `posicionarParaRound(mundo: Mundo, ladoAzul: 'A' | 'B'): void`; `passo(mundo: Mundo, dt: number, comandos: Map<number, Comandos>, opcoes?: { congelado?: boolean; comBomba?: boolean }): Evento[]` (devolve os eventos do passo, `mundo.js:444`); `vivosPorTime(mundo: Mundo): Vivos`; `relatorioDano`, `registrarMvp`. `index.ts` reexporta tudo que `client` e, depois, `server` consomem (decisão de arquitetura: o cliente **só** importa de `@blockstrike/sim`, nunca de arquivos internos).

- [ ] **Step 1: Escrever o teste de pureza que falha** — `pureza.test.ts` lê todos os `packages/sim/src/**/*.ts` e afirma que nenhum contém `document`, `window`, `navigator`, `THREE`, `Math.random` nem `Date.now`. Rodar `npx vitest run packages/sim/test/pureza.test.ts`; Expected: FAIL se algum módulo ainda tiver `Math.random`, `Date.now` ou DOM; se passar de primeira, o teste fica como regressão.
- [ ] **Step 2: Port dos testes `mundo` e `mundo-granada`**.
- [ ] **Step 3: Tipar `mundo`; criar o barrel**; confirmar que nenhum `@ts-nocheck` resta em `packages/sim/src` (`grep -rn "@ts-nocheck" packages/sim/src` vazio); `npm run typecheck -w @blockstrike/sim` limpo com `lib: ["ES2022"]`.
- [ ] **Step 4: Rodar tudo** — `npm test` PASS; `npm run baseline:check`: `IDENTICO`; `npx tsx tools/bs-sim-partida.mjs 1 medio | tail -5` roda sem erro.
- [ ] **Step 5: Commit** — `refactor(sim): port de mundo, barrel público e teste de pureza`

### Task 10A: Portas de áudio e storage

**Files:**
- Create: `packages/client/src/portas.ts`
- Test: `packages/client/test/portas.test.ts`

**Interfaces:**
- Produces: `interface AudioPort { contexto(): AudioContext | null }` (pode devolver `null`, como `sons.js:42`); `interface StoragePort { get<T>(chave: string, padrao: T): T; set(chave: string, valor: unknown): void }`; `interface Portas { audio: AudioPort; storage: StoragePort; confetti: () => void }`; `criarStorage(prefixo: string, backend?: Storage): StoragePort`.
- `criarStorage` replica o contrato do hub (`js/core/storage.js`, incluindo `tipoValido` na linha 17): valor salvo com tipo diferente do `padrao` é descartado e o `padrao` volta. O prefixo é `arcade:blockstrike:` (as preferências do dono no Vercel começam vazias, pois é outra origem; o prefixo só evita colisão).

- [ ] **Step 1: Teste que falha** — `portas.test.ts`: (a) `backend` cujo `getItem` e `setItem` lançam `DOMException`: `criarStorage` não lança e `set('a', 1)` seguido de `get('a', 0)` devolve `1` (memória); (b) valor salvo `'{lixo'`: `get('x', 7)` devolve `7`; (c) valor salvo `"texto"` com `padrao` numérico: devolve o `padrao`.
- [ ] **Step 2: Rodar** — `npx vitest run packages/client/test/portas.test.ts`; Expected: FAIL.
- [ ] **Step 3: Implementar** `portas.ts` lendo `js/core/storage.js` do hub como referência de comportamento.
- [ ] **Step 4: Rodar** — Expected: PASS.
- [ ] **Step 5: Commit** — `feat(client): portas de áudio e storage`

### Task 10B: Port dos módulos do cliente para TypeScript

**Files:**
- Move (`git mv`): `packages/client/src/{carreira,mira,modelos,entrada,sons,hud,render,index}.js` → `.ts`
- Modify: `render.ts` (`import * as THREE from 'three'`), `sons.ts` (recebe `AudioPort`), `index.ts` (`iniciar(raiz, portas)` no lugar do contrato do hub; sem `conta`), `packages/client/package.json` (`three@0.169.0`, `@types/three@0.169.0`)
- Test: `packages/client/test/{carreira,mira,sons,ambiente}.test.ts` (`sons` é port de `tests/sons.test.mjs`)

**Interfaces:**
- Consumes: `@blockstrike/sim` (só pelo barrel), `Portas` (10A).
- Produces: `iniciar(raiz: HTMLElement, portas: Portas): { pausar(): void; retomar(): void; destruir(): void }`; `lerMira(bruto: unknown, corLegada?: string): Mira`; `lerCarreira(bruto: unknown): Carreira` (mesmos nomes de hoje).

- [ ] **Step 1: Testes que falham** — `mira.test.ts`: `lerMira(null)`, `lerMira('{lixo')`, `lerMira(42)` devolvem `MIRA_PADRAO`. `carreira.test.ts`: `lerCarreira(null)` e `lerCarreira('{lixo')` devolvem `novaCarreira()`. `ambiente.test.ts`: com `matchMedia('(pointer: coarse)')` verdadeiro e `(pointer: fine)` falso, `iniciar` renderiza o texto `Disponível apenas no computador` e devolve instância cujos métodos não fazem nada; com `canvas.getContext` devolvendo `null`, mostra a mensagem de WebGL já existente.
- [ ] **Step 2: Rodar** — `npx vitest run packages/client`; Expected: FAIL.
- [ ] **Step 3: Portar** os módulos (`soToque()` e a checagem de WebGL de `index.js:74-78,138-146` ficam como estão); remover toda referência a `conta` e o contrato `mount`/`pause`/`resume` do hub.
- [ ] **Step 4: Rodar** — `npx vitest run packages/client` PASS; `npx tsc --noEmit -p packages/client` limpo.
- [ ] **Step 5: Commit** — `refactor(client): port para TypeScript, three via npm e sem contrato do hub`

### Task 10C: Shell HTML e CSS standalone

**Files:**
- Create: `packages/client/index.html`, `packages/client/src/main.ts`, `packages/client/src/estilos/base.css`, `packages/client/public/fonts/` (cópia de `outfit` e `jetbrains-mono` woff2 do hub)
- Modify: `packages/client/src/estilos/blockstrike.css` se necessário

**Interfaces:**
- `index.html` contém `<div class="app-container"><div id="view-blockstrike" class="game-view active"></div></div>` e carrega `main.ts`. O CSS do jogo usa `#view-blockstrike`, `.game-view.active` e `.app-container:has(...)` (`blockstrike.css:26-28,45,460`), então o shell **precisa** desses ids e classes.
- `base.css` traz do hub só o que o jogo usa: as variáveis de tema e as classes montadas no JS (`glass-card`, `primary-btn`, `secondary-btn`, `action-btn`, `app-header`, `app-title`, `app-subtitle`, `header-badge`, `badge-dot`, `badge-text`) e os `@font-face` de Outfit e JetBrains Mono (`base.css:1,10` do hub).
- `main.ts`: cria `Portas` reais (`AudioContext` criado no primeiro gesto do usuário, `criarStorage('arcade:blockstrike:', localStorage)`, `confetti` simples) e chama `iniciar`.

- [ ] **Step 1: Verificação que falha** — `npm run build -w @blockstrike/client`; Expected: erro (entrada inexistente).
- [ ] **Step 2: Criar o shell, `main.ts` e `base.css`**; copiar as fontes; ajustar caminhos de `url()`.
- [ ] **Step 3: Build** — `npm run build -w @blockstrike/client`; Expected: `dist/` gerado, sem aviso de arquivo faltando.
- [ ] **Step 4: Commit** — `feat(client): shell standalone com CSS e fontes do jogo`

### Task 10D: Teste de fumaça no navegador

**Files:**
- Create: `tools/smoke.mjs`

**Interfaces:**
- `node tools/smoke.mjs <url>`: abre a página com `puppeteer-core` usando `executablePath: '/usr/bin/google-chrome'` e args `--use-angle=swiftshader --enable-unsafe-swiftshader` (WebGL por software, como em `~/arcade-tools/bs-shot.mjs:24`), com **stub de pointer lock** (copiar de `bs-shot.mjs`); aguarda o menu, clica em Jogar, espera 5 s; imprime `SMOKE OK` ou falha com código `1` se houver `console.error` ou exceção de página.

- [ ] **Step 1: Rodar contra um servidor que não existe** — `node tools/smoke.mjs http://localhost:4999`; Expected: falha com código `1` (o teste do próprio script).
- [ ] **Step 2: Implementar `smoke.mjs`**.
- [ ] **Step 3: Rodar** — `npx vite preview -w @blockstrike/client &` e `node tools/smoke.mjs http://localhost:4173`; Expected: `SMOKE OK`.
- [ ] **Step 4: Commit** — `test: fumaça do cliente no navegador`

### Task 11: Camada de entrada abstrata

**Files:**
- Modify: `packages/client/src/entrada.ts`, `packages/client/src/index.ts`
- Test: `packages/client/test/entrada.test.ts`

**Interfaces:**
- Produces: `interface FonteEntrada { comando(yawAtual: number, pitchAtual: number): Comandos; ligar(): void; desligar(): void }` (o `comando(yawAtual, pitchAtual)` de hoje, `entrada.js:121`, devolve yaw e pitch **absolutos**); `criarEntradaTecladoMouse(canvas: HTMLElement, opcoes?: OpcoesEntrada): FonteEntrada`. `index.ts` depende só de `FonteEntrada`. Toque e gamepad entram depois implementando a mesma interface (não neste plano).
- Consumes: `Comandos` de `@blockstrike/sim`.

- [ ] **Step 1: Teste que falha** — com `canvas` falso e `document.pointerLockElement` simulado como o próprio canvas (o `mousemove` é ignorado sem isso, `entrada.js:54`): disparar `keydown` `KeyW` e um `mousemove` com `movementX = 10` (definir a propriedade no evento, o jsdom não a preenche); `comando(0, 0)` devolve avanço positivo e yaw **menor** que `0` (`entrada.js:55` subtrai); depois de `desligar()`, os mesmos eventos não alteram o resultado.
- [ ] **Step 2: Rodar** — Expected: FAIL (`criarEntradaTecladoMouse` inexistente).
- [ ] **Step 3: Extrair** a lógica de `criarEntrada` para a interface acima sem mudar teclas nem sensibilidade.
- [ ] **Step 4: Rodar** — Expected: PASS; `tools/smoke.mjs` ainda `SMOKE OK`.
- [ ] **Step 5: Commit** — `refactor(client): entrada atrás da interface FonteEntrada`

### Task 12: Passo fixo de simulação (arquitetura, Fable)

**Files:**
- Create: `packages/sim/src/relogio.ts`, `packages/sim/test/relogio.test.ts`, `tools/baseline/ts-dt-variavel.json`, `tools/baseline/ts-relogio.json`, `tools/baseline-compara.mjs`
- Modify: `packages/sim/src/config.ts` (`TICK_HZ = 60`, `DT_SIM = 1 / TICK_HZ`, `MAX_PASSOS_POR_QUADRO = 5`), `packages/sim/src/index.ts`, `packages/client/src/index.ts` (loop usa o relógio), `tools/baseline.mjs` (novo modo `--dt=relogio`: alimenta `criarRelogio` com a mesma sequência de `dt` reais sorteados do modo `variavel` e roda `passo(…, DT_SIM)` por passo devolvido)

**Interfaces:**
- Produces: `criarRelogio(hz: number, maxPassos: number): { avancar(dtReal: number): number; alfa(): number }`. `avancar` acumula `dtReal` (segundos), devolve quantos passos fixos rodar (`0..maxPassos`) e **descarta** o excedente acima de `maxPassos`. `alfa()` devolve a fração `[0, 1)` do passo corrente para interpolação de render.
- `tools/baseline-compara.mjs <novo.json> <ref.json>`: imprime `DENTRO DA TOLERANCIA` ou a lista de métricas fora; sai com código `1` se houver. Métricas: média de rounds por partida, vitórias T×CT, headshot%, bots presos, por dificuldade, em **30 seeds** por dificuldade. Tolerância: variação relativa `<= 10%` ou `<= 3` pontos percentuais.

- [ ] **Step 1: Testes que falham** — `relogio.test.ts`: (a) `criarRelogio(60, 5)`: `avancar(1/60)` → `1`; `avancar(1/30)` → `2`; (b) `avancar(0)` → `0`; (c) **dt enorme**: `avancar(5)` → `5` (teto) e a chamada seguinte `avancar(1/60)` → `1`, sem acumular dívida; (d) `alfa()` após `avancar(1/120)` ≈ `0.5`.
- [ ] **Step 2: Rodar** — `npx vitest run packages/sim/test/relogio.test.ts`; Expected: FAIL.
- [ ] **Step 3: Implementar `criarRelogio`** e trocar o loop do cliente: por quadro, `n = relogio.avancar(Math.min(dtReal, 0.25))`; roda `passo(mundo, DT_SIM, ...)` `n` vezes; render usa `alfa()`. O loop do jogo deixa de usar `DT_MAX = 0.05`.
- [ ] **Step 4: Gravar e comparar** — referência: `npx tsx tools/baseline.mjs --dt=variavel --seeds=1..30 --out=tools/baseline/ts-dt-variavel.json` (dt variável com teto 0,05, o loop antigo). Novo: `--dt=relogio --seeds=1..30 --out=tools/baseline/ts-relogio.json` (mesma sequência de dt reais, passo fixo). Rodar `node tools/baseline-compara.mjs tools/baseline/ts-relogio.json tools/baseline/ts-dt-variavel.json`; Expected: `DENTRO DA TOLERANCIA`. Se falhar, **parar e reportar ao dono** com as métricas; não ajustar tolerância sozinho. (As mesmas seeds geram a mesma sequência de dt nos dois modos, então a comparação isola o efeito do passo fixo.)
- [ ] **Step 5: Rodar tudo** — `npm test`, `npm run typecheck`, `node tools/smoke.mjs <url local>`; Expected: tudo verde. `baseline:check` passa a comparar `--dt=relogio` com `ts-relogio.json` (o de `js-dt60.json` fica como registro histórico).
- [ ] **Step 6: Commit** — `feat(sim): passo fixo de simulação a 60 Hz com relógio e teto de passos`

### Task 13: Publicar o cliente no Vercel

**Files:**
- Create: `vercel.json` **na raiz do repo** (o link do projeto é feito na raiz): `buildCommand` `npm run build -w @blockstrike/client`, `outputDirectory` `packages/client/dist`, `installCommand` `npm ci`

**Interfaces:**
- Produces: URL pública do cliente (alias do projeto Vercel `blockstrike`), usada na Task 14.

- [ ] **Step 1: Criar o projeto** — `vercel link --yes --project blockstrike` na raiz do repo novo; se a CLI exigir login ou escopo, usar o navegador (Brave do dono, com aprovação dele).
- [ ] **Step 2: Deploy de produção** — `vercel deploy --prod`; Expected: URL impressa e estado `READY`.
- [ ] **Step 3: Fumaça contra a produção** — `node tools/smoke.mjs <URL>`; Expected: `SMOKE OK`. O Vercel é outra origem: o `localStorage` do dono começa vazio (as preferências antigas do hub não vêm junto).
- [ ] **Step 4: Conectar o repo do GitHub ao projeto** (deploy automático em `main`) e push do estado atual: `git push origin main`; `gh run watch` do CI; Expected: workflow verde.
- [ ] **Step 5: Commit** — `chore: configuração de deploy no Vercel`

### Task 14: Remover o Block Strike do hub (PR separado)

**Files (repo `flow-games`, branch `chore/remove-blockstrike`):**
- Delete: `js/games/blockstrike/`, `css/games/blockstrike.css`, `js/vendor/three.module.min.js` (e a licença do Three.js se houver na pasta)
- Modify: `js/main.js:19,31` (import e `registrar`), `index.html:22` (link do CSS e texto de meta que cita o jogo), `README.md` (tabela de jogos, "sete jogos" → seis, dependências vendorizadas), `js/core/nav.js` (card, drawer e rota do jogo saem do registro, `nav.js:69,124,150`; o card do Block Strike vira **link externo** para a URL da Task 13, o que exige um tipo de item "externo" no `nav.js`), `~/arcade-tools/conta/placar.mjs:428` (a asserção "Sete jogos" passa a "Seis jogos"; esse arquivo é do repo `arcade-tools`, não do hub)

**Interfaces:**
- Consumes: URL da Task 13.
- Não altera: `supabase/schema.sql`, `js/core/conta/*`, `js/games/placar.js` (dados e RPC ficam intactos, decisão do spec).

- [ ] **Step 1: Teste/checagem que falha primeiro** — rodar o `check.sh` do hub (`~/arcade-tools/check.sh`, sintaxe e globais) e o teste da página Placar (`tests`/script em `~/arcade-tools/conta/` que cobre `placar.js`); anotar o resultado base. `placar.js:17` lista o jogo por constante e não itera o registro, então remover o jogo do registro **não** deve quebrar o Placar. Atualizar primeiro a asserção "Sete jogos" em `~/arcade-tools/conta/placar.mjs:428` para "Seis jogos" e rodar o teste; Expected: FAIL (o hub ainda tem sete). Esse é o teste que vira verde no Step 2.
- [ ] **Step 2: Remover e ajustar** conforme a lista. Manter a aba Block Strike do Placar como está (dados antigos), salvo se quebrar a página; registrar a escolha no PR. O teste do Step 1 passa.
- [ ] **Step 3: Verificar** — `check.sh` limpo; testes do hub verdes; `agent-browser` (sessão `prints`, Brave do dono) abre a home e os outros seis jogos, sem erro de console; o card externo abre a URL nova.
- [ ] **Step 4: Commit e PR** — `chore: Block Strike passa a viver em lmaciel0/blockstrike`; `gh pr create` com corpo curto (o que saiu, o que ficou intacto, link do repo novo). **Não fazer merge:** esperar o ok do dono.

### Task 15: Revisão, verificação e fechamento

**Files:**
- Create: `~/Documentos/Cofre Pessoal/Projetos/blockstrike/blockstrike.md` (hub), `blockstrike-historico.md`
- Modify: `~/Documentos/Cofre Pessoal/Projetos/flow-games/flow-games.md` (status e link), `Projetos.md` (índice)

- [ ] **Step 1: Revisão** — `code-reviewer` (uma vez) no diff final de `main` do repo novo; `security-auditor` não se aplica (sem entrada externa neste plano).
- [ ] **Step 2: Verificação com saída real** — `npm test`, `npm run typecheck`, `npm run build -w @blockstrike/client`, `tools/smoke.mjs <URL de produção>`, `gh run list --limit 1` (CI verde). Mostrar o resumo.
- [ ] **Step 3: Registro no cofre** — entrada datada no histórico (1 a 3 linhas, link do PR), hub com `status` e `proximo` (`plano 2: bots e balanceamento`). Só nomes de variáveis, nunca segredos. Sugerir `/iniciar-projeto` no repo novo (AGENTS.md e `docs/` do kit).
- [ ] **Step 3b: Fechamento** — `superpowers:finishing-a-development-branch`; `rtk gain` e informar a economia; recomendar `/clear`.

---

## Self-review (feito)

- **Cobertura do spec, passos 0 e 1:** repo com histórico (T1), testes e CI (T2), baseline (T3), monorepo e TS (T4–T9), adaptadores e entrada (T10–T11), passo fixo (T12), deploy (T13), remoção do hub (T14), fechamento (T15). Passos 2, 3 e 4 ficam nos Planos 2 a 4, de propósito.
- **Fica fora deste plano e vai para o Plano 3:** `packages/server`, protocolo, salas.
- **Tipos consistentes:** `Rng`, `Mundo`, `Comandos`, `Evento`, `Partida`, `Portas`, `FonteEntrada` definidos antes de usados.
- **Revisão (Opus 5.5, 2026-11-13):** 14 achados, todos aplicados: migração com `@ts-nocheck` e `tsx --test` (T4), baseline sobre `bs-sim-partida` com campos reais e dt variável (T3, T12), assinaturas corrigidas (T6–T9), Task 10 dividida em 10A–10D, CSS/HTML do hub listados (10C), fumaça com swiftshader (10D), teste de entrada com a API real (T11), `nav.js` e `placar.mjs` na T14, `vercel.json` na raiz (T13).
- **Premissa a confirmar na execução:** valores de `modo` em `criarMundo` (`mundo.js:42`).
