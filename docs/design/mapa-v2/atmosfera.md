# Atmosfera do mapa v2

Fim de tarde no deserto: céu azul limpo em cima, bruma cor de areia no horizonte, sol quente e baixo vindo de
+x. Os números estão em `atmosfera.ts` (`ATMOSFERA`); as prévias em `previa/` já usam todos eles. Nada aqui pede
textura nem sombra em tempo real.

## Céu e neblina

| Item | Hoje | Proposto | Por quê |
| --- | --- | --- | --- |
| `MAPA.ceu` | `0x87ceeb` | `0xf0dfb8` (horizonte) | a neblina funde o muro distante na bruma de areia, não em azul |
| `MAPA.neblina` | `[30, 90]` | `[38, 150]` | a Longa tem 34 m e a diagonal do mapa 100 m: com 90 o horizonte some |
| Degradê | não há | zênite `0x4f97d6`, meio `0x9cc7e4`, horizonte `0xf0dfb8` | céu chapado é o que mais denuncia "protótipo" |

**O teste muda.** `packages/sim/test/mapa.test.ts` cobra `ceu = 0x87ceeb` e `neblina = [30, 90]`. O `mapa.ts`
daqui ainda traz os valores antigos para o drop-in passar; ao adotar, troque os dois campos pelos de
`ATMOSFERA.ceuMapa` e `ATMOSFERA.neblina` e atualize o teste.

Degradê sem textura: uma `SphereGeometry(180, 24, 12)` virada para dentro, cor por vértice em três paradas
(horizonte até 18% da altura, depois meio, depois zênite), `MeshBasicMaterial({ vertexColors, side: BackSide,
fog: false, depthWrite: false })`, `renderOrder = -1`, centrada na câmera a cada quadro. Uma draw call, 325
vértices. `scene.background` fica com a cor do horizonte para o que sobrar abaixo do domo.

## Luz

| Luz | Hoje | Proposto |
| --- | --- | --- |
| Hemisfério | `0xffffff` / `0x8a7a5a`, 0,9 | `0xdcebf7` / `0xd9c39a`, 2,1 |
| Sol | `0xffffff`, 0,8, posição (20, 40, 10) | `0xffe2b0`, 2,5, posição (30, 40, 14) |

No three 0.169 a luz não é mais multiplicada por π: com 0,9 e 0,8 a areia sai a cerca de metade do brilho e o
mapa fica marrom (a primeira prévia saiu assim). Com 2,1 e 2,5 o chão ao sol fecha perto de 1,0, a parede ao sol
em 0,75 e a parede na sombra em 0,45: é o contraste chão claro, parede média, cobertura escura que deixa o
boneco azul ou laranja legível de longe. O chão do hemisfério é areia clara de propósito: é a luz rebatida que
não deixa a face na sombra virar lama.

A posição do sol tem de manter x/y = 0,75: as sombras do piso foram projetadas com essa razão
(`ATMOSFERA.kSombra`). O z só colore as faces norte e sul; pode variar.

## Sombras sem shadow map

- **Do cenário:** já estão em `decoracao`. Cada caixa de colisão e cada toldo ganha uma chapa escura no piso
  (`sombra()` em `mapa.ts`), deslocada 0,75 m por metro de altura para -x. Como o sol vem alinhado com x, a
  sombra de uma caixa é um retângulo exato: zero custo no render, 74 caixas no total.
- **Blob dos bonecos e objetos soltos (C4, arma no chão, granada):** um disco escuro por objeto
  (`CircleGeometry(raio, 12)` deitado, `MeshBasicMaterial({ color: 0x3a2f1c, transparent, opacity: 0,32,
  depthWrite: false })`), em y = 0,045, seguindo x e z do dono. Raio 0,42 m para boneco, 0,2 m para objeto;
  some quando o dono morre. Dez bonecos são dez draw calls baratas; se pesar, vira um `InstancedMesh`.
- Os adereços fixos não precisam de blob: a chapa de sombra já os assenta no chão.

## Luz ambiente por zona

Sem luz extra: é cor de vértice. O túnel é forrado com painéis de pedra escurecida (`TUNEL`), teto mais escuro
ainda e piso na sombra; sob cada lâmpada há uma poça clara de 2,6 m pintada no piso. O lado do site da mesma
parede é rebocado em areia, então a janela do B separa claro de escuro. A Longa fica meio a meio: a parede
interna joga 3 m de sombra no corredor.

## Poeira (só no render)

Um `InstancedMesh` de 56 caixinhas de 2,2 cm, `MeshBasicMaterial` cor `0xfff1cf`, opacidade 0,55, sem neblina e
sem escrever profundidade. Uma draw call.

- Vivem num volume de 14 × 5 × 14 m em volta da câmera; a posição é `base_i + vento * t + balanco *
  sin(t * 0,6 + fase_i)` e cada eixo dá a volta por módulo no volume, então nunca se cria nem se destrói nada.
- Vento (-0,22; 0,03; 0,08) m/s, balanço 0,18 m. Esconda as que caírem a menos de 0,6 m da câmera: de perto
  viram flocos brancos (aconteceu na primeira prévia, com 3,5 cm).
- Dentro do túnel (câmera sob o teto) baixe a opacidade para 0,25.

## Panos que balançam (só no render)

`ATMOSFERA.bandeiras` lista seis panos: dois mastros das bases, duas flâmulas nas placas A e B, a faixa da Longa
e a bandeira do minarete. O mastro ou o fio já está em `decoracao`; o pano é do render porque se mexe.

- Cada pano são 2 ou 3 caixas de `larg × alt × 0,02`, em cadeia: o segmento i é filho do i-1, com o pivô na
  borda.
- A cada quadro, `seg[i].rotation.y = amplitude * sin(t * freq + fase - i * atraso)` com amplitude 0,42 rad,
  frequência 2,3 rad/s e atraso 0,9 rad. O atraso faz a onda correr do mastro para a ponta.
- Custo: 16 malhas de 12 triângulos, um material por cor. Sem colisão, todas acima de 2,6 m.

As bandeirinhas do varal do meio e as roupas da Longa ficam paradas em `decoracao`; se sobrar fôlego, entram na
mesma lista com um segmento só.

## O que não fazer

- Shadow map, bloom e SSAO: fora do orçamento de GPU integrada.
- Neblina mais densa que `[38, 150]`: apaga o horizonte, que é metade da identidade.
- Sol branco: é o tom quente que une as areias; com branco as paredes ficam cinza.
