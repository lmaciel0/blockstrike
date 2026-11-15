# Plano 2 — Mira humana, métricas e balanceamento (implementação)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** bots que miram como gente (médio = jogador comum, difícil = humano bom), sem informação que um humano não teria, e lados/armas equilibrados, tudo medido por simulação.

**Architecture:** duas peças novas e puras em `packages/sim/src`: `percepcao.ts` (o bot mira onde viu o alvo há `atraso` s) e `mao.ts` (yaw/pitch movidos por mola-amortecedor com aceleração limitada e tremor). `bots.ts` passa a mirar por elas. Métricas novas saem de `tools/metricas.mjs` e de uma varredura `tools/bs-varredura.mjs`; a calibração e o balanceamento são feitos olhando a tabela da varredura.

**Tech Stack:** TypeScript estrito, npm workspaces, Vitest (`packages/sim/test`), `node:test` via `tsx` (`tests/*.test.mjs`), scripts Node em `tools/`.

**Spec:** `docs/superpowers/specs/2026-11-14-plano-2-mira-humana-e-balanceamento-design.md` (ler antes de qualquer tarefa).

## Global Constraints

- `packages/sim` sem DOM e sem Three.js (`packages/sim/test/pureza.test.ts` continua verde).
- Determinismo: todo sorteio novo usa o `rng` recebido pelo bot (`pensar(..., rng)`); nada de `Math.random`, `Date.now` ou relógio real no sim.
- Nada usa a posição de um inimigo que o bot não está vendo (nem para mirar, nem para escolher cobertura).
- Faixas por dificuldade (headshot = % das kills): fácil 15–25%, médio 30–40%, difícil 40–50%. Primeiro acerto (mediana, desde que viu): ~1,2 s / ~0,8 s / ~0,5 s. Começa a mirar após ver: ~0,55 s / ~0,4 s / ~0,25 s; nunca abaixo de 0,2 s.
- Vitória T entre 45% e 55% em cada dificuldade; nenhuma arma acima de ~35% das kills sem justificativa escrita.
- Prioridade em conflito: mira humana > lados 45–55% > limite por arma. Meta fora da faixa vai para o PR com a diferença, não é forçada.
- Alavancas do balanceamento: `ARMAS`, `ECONOMIA`, `ROUND`, `BOMBA` (config.ts), `espera`/`mira` dos bombsites (mapa.ts) e o comportamento de posto. Geometria do mapa e spawns não mudam.
- Dano de quem não vê: só direção, erro uniforme ±15°, ponto da ameaça a 15 m. Ruído: direção ±15° e distância ±30%.
- Só desktop. Sem mudança na UI do cliente.
- Branch `feat/plano-2-mira-humana`; um commit por tarefa; push e PR só com ok do dono; merge nunca sem ok.
- Código escrito pelo agent `typescript-pro` (Sonnet); Tarefas 6, 7, 9 e 10 com `Agent(model: "opus")`.
- Teste de comportamento antigo que quebrar por mudança intencional é **reescrito** para o comportamento novo, com comentário do porquê; nunca apagado sem substituto.

## Review Focus

1. **Alvo que some e volta rápido** (sai da visada atrás de caixa por 0,3 s): o bot não pode "lembrar" a posição atual; mira a última percebida. Teste na Tarefa 7 (`mira: alvo escondido não atualiza a mira`).
2. **Troca de alvo no meio do giro** (dois inimigos): a velocidade da mão continua (sem teleporte de mira) e o atraso vale para o novo alvo. Teste na Tarefa 7 (`mira: troca de alvo respeita o atraso do novo alvo`).
3. **Bot que volta da rota para o combate com a mão parada há muito tempo**: velocidade zerada, sem "chicotada". Teste na Tarefa 7 (`mão: velocidade zera depois de um tempo sem uso`).
4. **`dt` grande** (simuladores rodam a 0,05 s): a mão não explode nem oscila sem fim. Teste na Tarefa 6 (`mão: estável com dt de 0,05`).
5. **Dano de HE/tiro vindo de trás através de fumaça**: só direção, nenhuma posição. Teste na Tarefa 3 (`dano: distância do atirador não muda a decisão`).

---

### Task 1: Métricas da partida (sem mudar comportamento)

**Files:**
- Create: `tools/metricas.mjs`
- Modify: `tools/baseline.mjs` (`resumoPartida`, laço `umPasso`)
- Modify: `packages/sim/src/tipos.ts` (`Cerebro`), `packages/sim/src/bots.ts` (`criarCerebro`, `seguirRota`)
- Test: `tests/metricas.test.mjs`, `packages/sim/test/bots-presos.test.ts`

**Interfaces:**
- Produces: `Cerebro.desencalhes: number` (começa 0; +1 cada vez que `PRESO_TEMPO` dispara em `seguirRota`).
- Produces: `criarColetor(): Coletor` em `tools/metricas.mjs`, com `coletor.passo({ n, t, round, entidades, eventos })` chamado a cada passo jogado e `coletor.fimRound(entidades)` antes de recriar os cérebros; `coletor.resultado(): Metricas`.
- Produces: `Metricas = { killsPorArma: Record<string, number>, primeirosAcertos: number[] /* s, por encontro com acerto */, encontros: number, encontrosSemAcerto: number, desencalhes: number, botsMudos: number }`.
- Produces: `resumoPartida(carregar, dificuldade, seed, opcoesDt, { metricas = false } = {})` — com `metricas: true` devolve o resumo atual **mais** `metricas: Metricas`; sem a opção, o objeto é byte a byte o de hoje.
- Definições: **encontro** = intervalo em que `cerebro.alvoId` de um bot fica igual a um mesmo id não nulo; começa no passo em que `alvoId` passa a esse id. **Primeiro acerto** = tempo do início do encontro até o primeiro evento `acerto` com `atirador` = bot e `alvo` = esse id. Encontro que acaba sem acerto conta em `encontrosSemAcerto`. **Bot mudo** = bot que, num round, somou ≥ 3 s com `alvoId` não nulo e 0 eventos `tiro` emitidos por `passo` com o id dele como atirador.

- [ ] **Step 1:** criar a branch `feat/plano-2-mira-humana` a partir de `main`.
- [ ] **Step 2: Teste falhando** em `tests/metricas.test.mjs`:
  - `coletor: encontro com acerto mede o tempo desde que viu` — alimentar 3 passos sintéticos (dt 0,1): passo 0 `alvoId=null`, passo 1 `alvoId=7`, passo 3 evento `{tipo:'acerto', atirador:1, alvo:7}` → `primeirosAcertos` = `[0.2]` (±1e-9), `encontros` = 1, `encontrosSemAcerto` = 0.
  - `coletor: encontro que termina sem acerto é contado à parte` — `alvoId` 7 por 2 passos e volta a `null` → `encontrosSemAcerto` = 1, `primeirosAcertos` = `[]`.
  - `coletor: kills por arma` — dois eventos `morte` com `arma:'rifle'` e um com `'smg'` → `{ rifle: 2, smg: 1 }`.
  - `resumoPartida sem metricas não muda` — `resumoPartida(carregar,'medio',3,{modo:'fixo',dt:1/60})` não tem a chave `metricas`; com `{metricas:true}` tem, e os demais campos são iguais (`deepEqual` sem a chave).
- [ ] **Step 3:** rodar `npx tsx --test tests/metricas.test.mjs` → FAIL (módulo não existe).
- [ ] **Step 4: Teste falhando** em `packages/sim/test/bots-presos.test.ts`: `desencalhe conta em cerebro.desencalhes` — bot com rota atrás de uma caixa, `queriaAndar` e parado por > `PRESO_TEMPO` → `desencalhes` = 1.
- [ ] **Step 5:** implementar `tools/metricas.mjs`, o contador em `bots.ts`/`tipos.ts` e a opção em `resumoPartida`.
- [ ] **Step 6:** `npx tsx --test tests/metricas.test.mjs && npx vitest run packages/sim/test/bots-presos.test.ts` → PASS.
- [ ] **Step 7:** `npm run baseline:check` → PASS (prova de que nada mudou no comportamento). `npm test && npm run typecheck` → PASS.
- [ ] **Step 8: Commit** `feat(tools): métricas de encontro, kills por arma e desencalhes`.

### Task 2: Varredura e tabela "antes"

**Files:**
- Create: `tools/bs-varredura.mjs`, `tools/baseline/varredura-antes.json`
- Test: `tests/varredura.test.mjs`

**Interfaces:**
- Consumes: `resumoPartida(..., { metricas: true })` e `Metricas` (Task 1).
- Produces: `agregar(partidas: Array<{dificuldade, ...resumo}>): Record<NomeDificuldade, Linha>` exportada, com `Linha = { partidas, vitoriaT /*0..1*/, headshot /*cabecas/mortes*/, primeiroAcertoMediana /* s | null */, semAcerto /*encontrosSemAcerto/encontros*/, desencalhesPorPartida, botsMudos, killsPorArma /* frações */, armaTopo: { arma, fracao } }`.
- Produces: `mediana(xs: number[]): number | null`.
- CLI: `node tools/bs-varredura.mjs [--seeds=1..30] [--dificuldades=facil,medio,dificil] [--rapido] [--out=arquivo.json] [--verificar]`. `--rapido` = seeds 1..8. Sempre `{ modo: 'relogio', seed }` (o mesmo do baseline). Imprime uma linha por dificuldade com as colunas de `Linha` (percentuais com 1 casa). `--verificar` sai com código 1 se alguma meta das Global Constraints estiver fora (headshot, primeiro acerto ±25% do alvo, vitória T, arma topo > 0,35, botsMudos > 0) e lista quais.

- [ ] **Step 1: Teste falhando** em `tests/varredura.test.mjs`: `mediana([])` = `null`; `mediana([3,1,2])` = 2; `mediana([1,2,3,4])` = 2,5; `agregar` com duas partidas sintéticas do médio (vitoriasT 5/20 e 15/20, cabecas 30/100 e 40/100, killsPorArma `{rifle:60, smg:40}` e `{rifle:20, smg:80}`) → `vitoriaT` 0,5, `headshot` 0,35, `armaTopo` `{ arma:'smg', fracao: 0.6 }`.
- [ ] **Step 2:** `npx tsx --test tests/varredura.test.mjs` → FAIL.
- [ ] **Step 3:** implementar `tools/bs-varredura.mjs`.
- [ ] **Step 4:** `npx tsx --test tests/varredura.test.mjs` → PASS.
- [ ] **Step 5:** gravar a tabela "antes": `node tools/bs-varredura.mjs --seeds=1..30 --out=tools/baseline/varredura-antes.json`; colar a tabela impressa no corpo do commit.
- [ ] **Step 6: Commit** `feat(tools): varredura de métricas por dificuldade e tabela antes`.

### Task 3: Dano só com direção + baseline novo

**Files:**
- Modify: `packages/sim/src/mundo.ts:276`, `packages/sim/src/tipos.ts` (`Cerebro`), `packages/sim/src/bots.ts:543-549`
- Modify: `tools/baseline-check.mjs`, `tests/baseline.test.mjs` (referência → `tools/baseline/ts-plano2.json`)
- Create: `tools/baseline/ts-plano2.json`
- Test: `packages/sim/test/bots.test.ts` (linhas 98, 197–218), `packages/sim/test/bots-posto.test.ts:117`, novo `packages/sim/test/bots-dano.test.ts`

**Interfaces:**
- Produces: `Cerebro.ultimoDano: { angulo: number; em: number } | null` no lugar de `ultimoDanoDe`. `angulo` = yaw exato que olha da vítima para o atirador (mesma convenção de `yawPara`: yaw 0 olha para -z), gravado por `aplicarDano` (exceto molotov, como hoje).
- Produces em `bots.ts`: constantes `ERRO_DIRECAO_DANO = 15 * Math.PI / 180`, `DIST_AMEACA_DANO = 15`; função `ameacaPorDirecao(ent: Entidade, angulo: number, rng: Rng): PontoXZ` (ângulo + erro uniforme em ±`ERRO_DIRECAO_DANO`, ponto a `DIST_AMEACA_DANO` m). O bot que não vê o atirador vai para a cobertura contra esse ponto e vira o olhar para ele por `OLHAR_RUIDO` s (reusa `ouvidoPos`/`ouvidoAte`).
- Note: o bot que **vê** quem atirou segue em combate como hoje (a checagem "visto" passa a ser: algum inimigo visível dentro de ±`ERRO_DIRECAO_DANO` da direção).

- [ ] **Step 1: Testes falhando** em `bots-dano.test.ts`:
  - `dano: distância do atirador não muda a decisão` — mesmo mundo, atirador atrás de parede na mesma direção a 10 m e a 40 m; depois de `aplicarDano` e um `pensar` com a mesma seed, `cerebro.rota` e `cerebro.ouvidoPos` são iguais nos dois.
  - `dano: direção percebida fica a até 15° da real` — 200 seeds: `|angulo(yawPara(bot, ouvidoPos) - angReal)| <= 15°+1e-9`, e ao menos um caso com erro > 5° (o erro existe).
  - `dano: atirador visível continua em combate` — atirador na frente e visível: `estado` vira `combate`, não `cobertura`.
- [ ] **Step 2:** `npx vitest run packages/sim/test/bots-dano.test.ts` → FAIL.
- [ ] **Step 3:** implementar; reescrever os testes de `bots.test.ts` e `bots-posto.test.ts` que usam `ultimoDanoDe` para `ultimoDano` (o teste `mundo grava ultimoDanoDe` vira `mundo grava a direção do dano`, conferindo o ângulo).
- [ ] **Step 4:** `npx vitest run packages/sim/test` → PASS.
- [ ] **Step 5:** gerar o baseline novo `node tools/baseline.mjs --out=tools/baseline/ts-plano2.json --seeds=1..30 --dt=relogio`; apontar `tools/baseline-check.mjs` e `tests/baseline.test.mjs` para ele (o `ts-relogio.json` fica como histórico; comentário no topo de `baseline-check.mjs` explica). Regra para as próximas tarefas: toda tarefa que muda comportamento termina regenerando `ts-plano2.json` com este mesmo comando.
- [ ] **Step 6:** `npm test && npm run typecheck && npm run baseline:check` → PASS.
- [ ] **Step 7: Commit** `feat(bots): dano de quem não vê dá só a direção`.

### Task 4: Ruído com direção e distância aproximadas

**Files:**
- Modify: `packages/sim/src/bots.ts` (`olharRuido`, chamadas dela)
- Test: `packages/sim/test/ouvido.test.ts`

**Interfaces:**
- Produces: `perceberRuido(de: PontoXZ, r: Ruido, rng: Rng): PontoXZ` exportada de `bots.ts`: ângulo de `de` até o ruído + erro uniforme ±15°, distância × uniforme [0,7; 1,3]. `olharRuido(ent, c, mundo, dt, cmd, rng)` grava `c.ouvidoPos = perceberRuido(ent.pos, ruido, rng)`.

- [ ] **Step 1: Testes falhando** em `ouvido.test.ts`: `perceberRuido: erro de ângulo até 15° e distância até 30%` (500 seeds, ruído a 10 m: ângulo dentro de ±15°, distância em [7, 13], e nem todos iguais à posição exata); `perceberRuido: determinístico pela seed`. O teste existente da linha 63 continua valendo.
- [ ] **Step 2:** `npx vitest run packages/sim/test/ouvido.test.ts` → FAIL.
- [ ] **Step 3:** implementar.
- [ ] **Step 4:** `npx vitest run packages/sim/test` → PASS; regenerar `ts-plano2.json` (comando da Task 3); `npm test && npm run typecheck` → PASS.
- [ ] **Step 5: Commit** `feat(bots): ruído ouvido dá direção e distância aproximadas`.

### Task 5: Percepção atrasada (`percepcao.ts`)

**Files:**
- Create: `packages/sim/src/percepcao.ts`
- Modify: `packages/sim/src/index.ts` (exportar), `packages/sim/src/tipos.ts` (`Amostra`)
- Test: `packages/sim/test/percepcao.test.ts`

**Interfaces:**
- Produces: `interface Amostra { id: number; t: number; pos: Vec3; agachado: boolean }` em `tipos.ts`.
- Produces: `registrarVistos(amostras: Amostra[], vistos: readonly Pick<Entidade,'id'|'pos'|'agachado'>[], tempo: number, janela: number): void` — acrescenta uma amostra (cópia de `pos`) por visto e remove, in place, as de `t < tempo - janela`.
- Produces: `percebido(amostras: readonly Amostra[], id: number, tempo: number, atraso: number): Amostra | null` — a amostra mais recente desse `id` com `t <= tempo - atraso`; `null` se não houver.
- Produces: `JANELA_PERCEPCAO = 2` (s), exportada de `percepcao.ts`.
- Array simples (não `Map`): o cérebro precisa continuar serializável para o Plano 3.

- [ ] **Step 1: Testes falhando** (`percepcao.test.ts`, dt 1/60):
  - `percebido: null antes do atraso` — alvo visto desde t=0; em t=0,39 com atraso 0,4 → `null`; em t=0,41 → amostra com `t <= 0,01`.
  - `percebido: alvo andando fica atrás pelo atraso` — alvo a 5 m/s em x; em t=1 com atraso 0,4, `pos.x` ≈ posição de t=0,6 (±5 m/s × 1/60).
  - `percebido: alvo escondido mantém a última amostra` — visto até t=0,5, some; em t=1,2 com atraso 0,4 → amostra de t ≤ 0,5 (a última).
  - `registrarVistos: poda o que passou da janela` — amostras de t=0 somem em t=2,1 com janela 2.
  - `percebido: id nunca visto → null`.
- [ ] **Step 2:** `npx vitest run packages/sim/test/percepcao.test.ts` → FAIL.
- [ ] **Step 3:** implementar.
- [ ] **Step 4:** `npx vitest run packages/sim/test/percepcao.test.ts packages/sim/test/pureza.test.ts` → PASS.
- [ ] **Step 5: Commit** `feat(sim): percepção atrasada dos inimigos vistos`.

### Task 6: Mão virtual (`mao.ts`) — Opus

**Files:**
- Create: `packages/sim/src/mao.ts`
- Modify: `packages/sim/src/tipos.ts` (`PerfilMao`, `EstadoMao`), `packages/sim/src/index.ts`
- Test: `packages/sim/test/mao.test.ts`

**Interfaces:**
- Produces: `interface PerfilMao { atraso: number /*s*/; firmeza: number /*ω, rad/s*/; amortecimento: number /*ζ*/; acelMax: number /*rad/s²*/; tremor: number /*rad, desvio*/ }`.
- Produces: `interface EstadoMao { vYaw: number; vPitch: number; tremor: { yaw: number; pitch: number }; tremorAte: number; usadaEm: number }` e `criarMao(): EstadoMao` (tudo 0, `usadaEm = -Infinity`).
- Produces: `moverMao(atual: { yaw: number; pitch: number }, alvo: { yaw: number; pitch: number }, m: EstadoMao, perfil: PerfilMao, tempo: number, dt: number, rng: Rng): { yaw: number; pitch: number }`.
- Algoritmo (o que a assinatura não determina):
  - Se `tempo - m.usadaEm > 0,1`, zera `vYaw`/`vPitch` antes de mover; no fim grava `m.usadaEm = tempo`.
  - Tremor: quando `tempo >= m.tremorAte`, sorteia `m.tremor` = gauss(rng) × `perfil.tremor` (pitch × 0,5) e `m.tremorAte = tempo + 0,1`. O alvo efetivo é `alvo + m.tremor`.
  - Integra em subpassos de no máximo 1/120 s (estabilidade com dt 0,05): erro `e` (yaw com `angulo()`, menor caminho), `a = ω²·e − 2ζω·v`, `|a| ≤ acelMax`, `v += a·h`, `ângulo += v·h` (Euler semi-implícito), separado para yaw e pitch.
- Valores iniciais (a Task 9 calibra), em `DIFICULDADE[nome].mao`:
  - fácil `{ atraso: 0.55, firmeza: 9, amortecimento: 0.55, acelMax: 60, tremor: 0.012 }`
  - médio `{ atraso: 0.4, firmeza: 12, amortecimento: 0.6, acelMax: 90, tremor: 0.008 }`
  - difícil `{ atraso: 0.25, firmeza: 16, amortecimento: 0.7, acelMax: 140, tremor: 0.005 }`
  (Só os tipos e a função entram aqui; o campo `mao` em `DIFICULDADE` entra na Task 7.)

- [ ] **Step 1: Testes falhando** (`mao.test.ts`, perfil médio com `tremor: 0` salvo onde dito):
  - `mão: converge para alvo parado` — de yaw 0 a alvo 1 rad, dt 1/60; após 1,5 s `|erro| < 0,01`.
  - `mão: passa do alvo e corrige com ζ < 1` — mesmo cenário; em algum passo yaw > 1 (overshoot), e no fim converge.
  - `mão: aceleração limitada` — `|Δv|/dt <= acelMax + 1e-6` em todo passo.
  - `mão: menor caminho no yaw` — de `-π+0,1` para `π-0,1`: o primeiro passo move yaw para baixo (atravessa ±π), nunca anda > 0,5 rad no sentido longo.
  - `mão: estável com dt de 0,05` — 5 s com dt 0,05 até alvo fixo: `|erro| < 0,01` no fim, sem `NaN`.
  - `mão: velocidade zera depois de um tempo sem uso` — move um passo (v > 0), chama de novo com `tempo` +0,5 s: o primeiro subpasso parte de v = 0 (o deslocamento é menor que o de chamar sem pausa).
  - `mão: tremor determinístico pela seed e com desvio da ordem de perfil.tremor` — alvo fixo, 10 s, tremor 0,008: desvio padrão do erro em regime entre 0,002 e 0,02; duas execuções com a mesma seed iguais.
- [ ] **Step 2:** `npx vitest run packages/sim/test/mao.test.ts` → FAIL.
- [ ] **Step 3:** implementar.
- [ ] **Step 4:** `npx vitest run packages/sim/test/mao.test.ts packages/sim/test/pureza.test.ts` → PASS; `npm run typecheck` → PASS.
- [ ] **Step 5: Commit** `feat(sim): mão virtual com inércia e tremor`.

### Task 7: Bots miram pela percepção e pela mão — Opus

**Files:**
- Modify: `packages/sim/src/bots.ts` (`criarCerebro`, `pensar`, `atacar`, `olharRuido`), `packages/sim/src/config.ts` (`DIFICULDADE`), `packages/sim/src/tipos.ts` (`Dificuldade`, `Cerebro`)
- Modify: `tools/bs-sim.mjs`, `tools/bs-duelo.mjs` (seguem compilando com o `Dificuldade` novo)
- Test: novo `packages/sim/test/bots-mira.test.ts`; reescrever o que quebrar em `bots.test.ts` (linha 265 usa `erroMira`), `bots-cabeca.test.ts`

**Interfaces:**
- Consumes: `registrarVistos`, `percebido`, `JANELA_PERCEPCAO` (Task 5); `moverMao`, `criarMao`, `PerfilMao`, `EstadoMao` (Task 6); `perceberRuido` (Task 4).
- Produces: `Dificuldade = { reacao: number; chanceCabeca: number; alturaTronco?: number; toleranciaTiro: number /*rad*/; mao: PerfilMao }`. Sai `erroMira`. Valores de `mao` = os da Task 6; `toleranciaTiro` inicial 0,05/0,035/0,025 (fácil/médio/difícil); `reacao` inicial 0,75/0,5/0,3 (sempre ≥ `mao.atraso`).
- Produces: `Cerebro.percepcao: Amostra[]`, `Cerebro.mao: EstadoMao`. Saem `erro`, `erroAte`; somem `TROCA_ERRO` e `ERRO_PITCH`.
- Comportamento:
  - `pensar` chama `registrarVistos(c.percepcao, vistos.map(v => v.ent), agora, JANELA_PERCEPCAO)` todo passo, antes de escolher o alvo. A escolha do alvo e a entrada em combate continuam usando `vistos` (o bot nota na hora).
  - `atacar`: `p = percebido(c.percepcao, alvo.id, agora, dif.mao.atraso)`. Se `null`: a mão segura a mira atual (`moverMao` com alvo = yaw/pitch atuais) e não atira. Senão o ponto (cabeça/tronco, regra de visada de hoje) vem de `pontosDoCorpo(p, dif.alturaTronco)`; `pitchAlvo` desconta o recuo do próximo tiro como hoje (`compensa`); `cmd.yaw/pitch = moverMao(...)`.
  - Gatilho: `pronto = c.vistoHa >= dif.reacao && |angulo(yawAlvo − cmd.yaw)| < dif.toleranciaTiro && |pitchAlvo − cmd.pitch| < dif.toleranciaTiro && munição/recarga como hoje`. Sai `MIRA_OK`.
  - `olharRuido` e o olhar para a direção do dano (Task 3) giram pela mão (`moverMao`), não por `girar`. Rota, posto e `mirarEntrada` continuam com `girar`.

- [ ] **Step 1: Testes falhando** em `bots-mira.test.ts` (chão plano, bot em (0,0,0) yaw 0, alvo surge visível a 15 m a 30° do yaw; dt 1/60; por dificuldade):
  - `mira: não começa a girar antes do atraso` — para t < `mao.atraso − 1/60`, `|yaw − 0| < 1e-3`.
  - `mira: não atira antes da reação` — nenhum `cmd.atirar` com `vistoHa < reacao`; no médio o primeiro tiro sai em t ≥ 0,35 s; no difícil a mira começa a mexer em t ≥ 0,2 s.
  - `mira: rastreio atrasado em alvo correndo` — alvo correndo de lado a 5 m/s: erro angular médio entre a mira e a posição **real** (t de 1 s a 3 s) maior que com o alvo parado.
  - `mira: alvo escondido não atualiza a mira` — alvo visível 1 s, entra atrás de caixa e se move 5 m: nos 0,5 s seguintes o alvo da mão não muda de direção para a posição nova.
  - `mira: troca de alvo respeita o atraso do novo alvo` — com o alvo A morto, B (nunca visto) aparece: nenhum tiro em B antes de `reacao` desde que B foi visto, e o yaw não salta (|Δyaw| por passo ≤ `acelMax`·dt² + |v|·dt).
  - `mira: passa do ponto em giro de 90°` — no médio, em ao menos um de 20 seeds o yaw cruza o ângulo do alvo e volta.
- [ ] **Step 2:** `npx vitest run packages/sim/test/bots-mira.test.ts` → FAIL.
- [ ] **Step 3:** implementar; ajustar `tools/bs-sim.mjs` e `tools/bs-duelo.mjs` ao tipo novo; reescrever as asserções antigas de mira (ex.: `bots.test.ts:265` `ideal` vira `{ reacao: 0.2, chanceCabeca: 0, toleranciaTiro: 0.05, mao: {...} }`) com comentário do porquê.
- [ ] **Step 4:** `npx vitest run packages/sim/test` → PASS. Rodar `node tools/bs-varredura.mjs --rapido` e anotar a tabela no commit (ainda sem calibrar; nenhum bot mudo é o mínimo exigido aqui).
- [ ] **Step 5:** regenerar `ts-plano2.json`; `npm test && npm run typecheck && npm run build -w @blockstrike/client` → PASS.
- [ ] **Step 6: Commit** `feat(bots): mira por percepção atrasada e mão virtual`.

### Task 8: Duelo de entrada (`bs-duelo.mjs`)

**Files:**
- Modify: `tools/bs-duelo.mjs` (vira módulo com CLI; o cenário antigo continua em `--cenario=parado`)
- Test: `tests/duelo.test.mjs`

**Interfaces:**
- Produces: `dueloEntrada(carregar, dificuldade: NomeDificuldade, seed: number): { inicioMira: number | null; primeiroTiro: number | null; primeiroAcerto: number | null }` — s desde o primeiro passo em que o bot vê o alvo. Cenário: chão + uma caixa; o alvo sai de trás da caixa andando de lado a 4 m/s, a 15 m, cruzando o cone do bot; 6 s no máximo; dt 1/60. `inicioMira` = primeiro passo com `|Δyaw| > 1e-3`.
- CLI: `node tools/bs-duelo.mjs --cenario=entrada [--seeds=1..50]` imprime por dificuldade: mínimo e mediana de `inicioMira`, `primeiroTiro`, `primeiroAcerto`, e % sem acerto.

- [ ] **Step 1: Testes falhando** em `tests/duelo.test.mjs`: `dueloEntrada determinístico pela seed`; `médio: nenhum tiro antes de 0,35 s` (seeds 1..20, `min(primeiroTiro) >= 0.35`); `difícil: mira nunca começa antes de 0,2 s` (seeds 1..20).
- [ ] **Step 2:** `npx tsx --test tests/duelo.test.mjs` → FAIL.
- [ ] **Step 3:** implementar.
- [ ] **Step 4:** `npx tsx --test tests/duelo.test.mjs` → PASS; `npm test` → PASS.
- [ ] **Step 5: Commit** `feat(tools): duelo de entrada para medir reação e primeiro acerto`.

### Task 9: Calibração das dificuldades — Opus

**Files:**
- Modify: `packages/sim/src/config.ts` (`DIFICULDADE`: `reacao`, `chanceCabeca`, `alturaTronco`, `toleranciaTiro`, `mao.*`)
- Create: `tools/baseline/varredura-calibrada.json`
- Test: `tests/duelo.test.mjs` (acrescentar as faixas de mediana)

**Interfaces:**
- Consumes: `bs-duelo.mjs --cenario=entrada` (Task 8), `bs-varredura.mjs` (Task 2).
- Só números mudam aqui. Mudança de lógica descoberta na calibração volta para a Task 7 como commit próprio, com teste.

- [ ] **Step 1: Teste falhando** em `tests/duelo.test.mjs`: `medianas do duelo dentro das faixas` (seeds 1..50): `inicioMira` mediana fácil 0,45–0,65, médio 0,32–0,48, difícil 0,2–0,3; `primeiroAcerto` mediana fácil 0,9–1,5, médio 0,6–1,0, difícil 0,38–0,62.
- [ ] **Step 2:** `npx tsx --test tests/duelo.test.mjs` → FAIL (valores iniciais ainda não calibrados) ou PASS por sorte; registrar qual.
- [ ] **Step 3:** iterar em `DIFICULDADE` com `node tools/bs-duelo.mjs --cenario=entrada` e `node tools/bs-varredura.mjs --rapido` até: duelo nas faixas do Step 1; headshot fácil 15–25%, médio 30–40%, difícil 40–50%; `botsMudos` = 0; desencalhes por partida não maiores que na tabela "antes". Ordem sugerida: `atraso`/`reacao` → `firmeza`/`amortecimento` → `tremor`/`toleranciaTiro` → `chanceCabeca`.
- [ ] **Step 4:** confirmar com a varredura completa `node tools/bs-varredura.mjs --seeds=1..30 --out=tools/baseline/varredura-calibrada.json`. Vitória T e armas ainda podem estar fora (Task 10).
- [ ] **Step 5:** regenerar `ts-plano2.json`; `npm test && npm run typecheck` → PASS.
- [ ] **Step 6: Commit** `tune(bots): calibração de reação, mão e headshot por dificuldade` com as tabelas duelo e varredura no corpo.

### Task 10: Balanceamento de lados e armas — Opus

**Files:**
- Modify: `packages/sim/src/config.ts` (`ARMAS`, `ECONOMIA`, `ROUND`, `BOMBA`), `packages/sim/src/mapa.ts:121-122` (`espera`, `mira`), `packages/sim/src/bots.ts` (só comportamento de posto, se preciso)
- Create: `docs/balanceamento.md`, `tools/baseline/varredura-depois.json`
- Test: testes existentes que fixam os valores mexidos (ex.: `economia.test.ts`, `armas.test.ts`, `bomba.test.ts`, `bots-posto.test.ts`), atualizados com comentário

**Interfaces:**
- Consumes: `bs-varredura.mjs --verificar` (Task 2).
- Produces: `docs/balanceamento.md` com: tabela antes (`varredura-antes.json`), depois da calibração e final; uma linha por mudança (valor antigo → novo, motivo, efeito medido); metas fora da faixa com a diferença e o porquê.

- [ ] **Step 1:** rodar `node tools/bs-varredura.mjs --seeds=1..30 --verificar` e listar as metas fora.
- [ ] **Step 2:** para cada mudança: (a) atualizar o teste que fixa o valor, ver FAIL; (b) mudar o valor; (c) `npx vitest run packages/sim/test` → PASS; (d) `node tools/bs-varredura.mjs --rapido` e anotar o efeito em `docs/balanceamento.md`. Respeitar a prioridade das Global Constraints: nunca piorar headshot/primeiro acerto para fechar lado ou arma (conferir a cada rodada).
- [ ] **Step 3:** quando `--rapido` estiver dentro, confirmar com `node tools/bs-varredura.mjs --seeds=1..30 --verificar --out=tools/baseline/varredura-depois.json` → código 0, ou o desvio restante justificado em `docs/balanceamento.md`.
- [ ] **Step 4:** `node tools/bs-duelo.mjs --cenario=entrada` continua nas faixas da Task 9; `npx tsx --test tests/duelo.test.mjs` → PASS.
- [ ] **Step 5:** regenerar `ts-plano2.json`; `npm test && npm run typecheck && npm run build -w @blockstrike/client` → PASS.
- [ ] **Step 6: Commit** `tune: balanceamento de lados e armas` (pode ser mais de um commit, um por alavanca).

### Task 11: Fechamento

**Files:**
- Modify: `docs/superpowers/specs/2026-11-14-plano-2-mira-humana-e-balanceamento-design.md` (status: implementado; metas finais)

- [ ] **Step 1:** verificação completa com saída real: `npm ci && npm run typecheck && npm run build -w @blockstrike/client && npm test && npm run baseline:check && node tools/bs-varredura.mjs --seeds=1..30 --verificar && node tools/bs-duelo.mjs --cenario=entrada`.
- [ ] **Step 2:** `grep -rn "atirador.pos\|ultimoDanoDe\|erroMira" packages/sim/src` → nenhum uso de posição de atirador não visto nem campo antigo.
- [ ] **Step 3:** playtest do dono no médio, no build local (`npm run dev -w @blockstrike/client`): critério "não parece mais aimbot". Ajuste pedido volta para a Task 9.
- [ ] **Step 4:** `code-reviewer` no diff final da branch (uma vez); aplicar o que for procedente.
- [ ] **Step 5:** com ok do dono: push e PR com as tabelas antes/depois, o duelo e `docs/balanceamento.md`. Merge só com ok.
- [ ] **Step 6:** cofre: entrada em `Projetos/blockstrike/blockstrike-historico.md` (1–3 linhas + link do PR) e hub `blockstrike.md` com `proximo: "plano 2b: tática de equipe"`; copiar spec e plano para a pasta do cofre como no Plano 1. `rtk gain` e informar a economia.
