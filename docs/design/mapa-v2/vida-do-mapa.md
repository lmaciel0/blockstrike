# Vida do mapa v2

O pedido: o mapa "não encaixa"; tem de lembrar Dust II e ter vida. A colisão (`caixas`) já estava validada e
não foi tocada. Tudo aqui é a camada `decoracao` (caixas só visuais) e a atmosfera (`atmosfera.md`).

## Direção de arte

- **Uma cidade, não um cercado.** O muro externo de pedra virou térreo de casas: reboco sobre a base de pedra,
  andar de cima atrás do muro, janelas, e mais longe mesquita, minarete, prédios, antena e paredão de rocha.
  É o que mais muda a sensação (ver `previa/c5-aerea-lado-a.png`).
- **Três leituras de valor.** Chão claro, parede média, cobertura escura. Cor viva só em pano, porta e sinal.
- **Cada site tem uma cor.** A é amarelo, B é azul-claro: placa alta em cima do arco, letrão na parede, faixa
  no alto do muro, moldura no piso e a letra pichada nas portas do meio, do lado do site.
- **Dois lados que não são espelho.** A colisão continua espelhada; a roupa não. Lado A (z > 0) é acampamento e
  mercado, panos terracota e amarelo; lado B (z < 0) é posto e oficina, panos verdes. Fachadas, horizonte e
  manchas também são sorteados por lado.
- **Sol fixo de +x.** Sombras em chapa no piso dão volume e direção sem custo.

## O que entra em cada zona

| Zona | Lado A (z > 0) | Lado B (z < 0) |
| --- | --- | --- |
| Base | toldo listrado terracota, sacos de areia, mesa com mapa, barris, munição, mastro | toldo verde fora de centro, paletes, barris, antena de rádio, porta fechada na fachada |
| Longa A | portão com duas folhas azuis, janelas e vigas, faixa de pano, ruína com entulho e tijolo à mostra, barris | uma folha e um tapume, varal de roupa, banca de frutas, container ferrugem, cartazes |
| Site A | carro vermelho com rodas e vidros, banca amarela com munição, barris pintados, letrão A | carro sucateado sobre tijolos, pilha de pneus, faixa amarela |
| Meio | portas azuis abertas contra a parede, varal de bandeirinhas, lixeira, caixote no xbox, vaso | uma folha para o centro e tapume, fio de lâmpadas, lona no xbox, cartazes |
| Túnel | cano enferrujado com descida, ralo | fio, caixa de luz, grade de ventilação |
| Site B | container verde com cintas, paletes, munição, letrão B | container branco de faixa vermelha, lona na pilha, banca verde, tambores, B menor |
| Laterais | banca de frutas, tralha no canto, lampiões | cartaz grande, pneus, sacos de areia, lampiões |
| Horizonte | mesquita, minarete, prédios, palmeiras; casario a oeste | apartamentos, caixas-d'água, antena; rocha a leste |

Comum aos dois lados: coroa e rodapé em toda parede alta, aro escuro nos caixotes, batentes e vergas de
madeira, lâmpadas penduradas (portas do meio, arcos, túnel), forro escuro e arcos de pedra no túnel, moldura
da janela do B, piso por zona e sombras.

## Orçamento

| Grupo | Caixas |
| --- | --- |
| Piso (zonas, sites, sombras, tinta) | 109 |
| Detalhe de parede (até 0,12 m) | 357 |
| Suspenso acima de 2,6 m (toldos, vigas, placas, andares de cima) | 219 |
| Adereço de chão em canto morto | 32 |
| Fora do mapa (horizonte) | 80 |
| **Decoração** | **797** |
| Colisão | 107 |
| **Vértices (uma draw call)** | **21 696 de 30 000** |

Passou da meta de ~700 em 97 caixas; o teto de vértices tem folga de 28%. Se for para fechar em 700, cortar
nesta ordem: aros dos caixotes (28), manchas de parede (cerca de 40), janelas do andar de cima (cerca de 35).

`previa/conferir.mjs` checa as regras físicas: nenhum adereço de chão a menos de 1 m de waypoint, 0,7 m de
aresta ou na faixa |z| < 0,5; todo o resto ou é detalhe de até 0,12 m ou está acima de 2,6 m. Saída limpa.

## O que muda no `render.ts`

1. Montar `geometriaDoMapa([...mapa.caixas, ...(mapa.decoracao ?? [])])` (e `decoracao?: Caixa[]` em `Mapa`).
   Só isto já entrega paredes, adereços, horizonte e sombras.
2. Luzes: hemisfério `0xdcebf7`/`0xd9c39a` a 2,1; sol `0xffe2b0` a 2,5 em (30, 40, 14).
3. Céu e neblina: `ceu = 0xf0dfb8`, `neblina = [38, 150]`, mais o domo em degradê. **O teste de `ceu` e
   `neblina` precisa mudar.**
4. `camera.far` de 200 para 400 (o domo tem raio 180 e o horizonte vai a 60 m do muro).
5. Marca do bombsite: subir de y = 0,02 para 0,05 (o piso do site agora ocupa 0,02) e tirar o contorno do
   canvas, que a moldura em blocos substitui.
6. Opcionais, só no render: poeira, bandeiras e blob (`atmosfera.md`).

## Prévias (`previa/`)

Geradas com three e Chromium (SwiftShader), mesma montagem do `render.ts`. `exportar.mjs` gera `dados.json`,
`capturar.cjs` tira os PNGs, `preview.html?cena=...` abre no navegador.

- `a-vista-de-cima.png`: planta com legenda.
- `b1` a `b4`: as quatro cenas pedidas, a 1,6 m, fov 80.
- `c1` a `c6`: sites, lado B e duas aéreas.

Três rodadas. A primeira saiu escura e marrom (luz sem o π) e com poeira em flocos: subi as luzes e encolhi a
poeira. Na segunda as setas pichadas pareciam cruzes e as portas sumiam na sombra: tirei as setas, clareei o
azul. Na terceira a parede do túnel virada para o site B era um paredão cinza e o B ficava atrás do container:
reboquei o lado do site e mudei as letras de lugar.

## O que ainda está fraco

- As praças atrás dos sites são grandes e lisas: o piso só tem manchas e sombras.
- Prédios do horizonte são caixas com uma fila de janelas; de perto do muro parecem simples.
- Caixotes são todos do mesmo marrom escuro e pesam na imagem.
- Faces viradas para -x ficam chapadas na sombra.

## Riscos

- **Adereço de chão sem colisão** (32 caixas: barris, sacos, lixeira, paletes, banca). Estão em cantos mortos
  e colados em parede, mas dá para atravessar. Se incomodar, promover os maiores a `caixas` e rodar o sim.
- **Container azul da Longa** (`0x3f6fb5`, cor de colisão) fica perto do azul do time (`0x2f6fde`). As portas
  já usam azul-petróleo; o container só muda mexendo em `caixas`, ou com uma casca de decoração.
- **Sombras amarradas ao sol.** Mudar x/y do sol sem mudar `K_SOMBRA` desalinha luz e sombra.
- **Chapas de piso** ficam de 1 a 4 cm acima do chão; em ângulo raso e muito longe pode haver cintilação.
  Não apareceu nas prévias.
- **`mapa.ts` roda no sim.** A decoração é montada na carga do módulo (inclusive no servidor); é leve, mas se
  quiser o sim enxuto, mover a decoração para um arquivo que só o cliente importa.
