// Gera os PNGs da prévia. Uso (na raiz do repo):
//   node --import tsx docs/design/mapa-v2/previa/exportar.mjs
//   python3 -m http.server 8765 &   (na raiz do repo)
//   node docs/design/mapa-v2/previa/capturar.cjs [cena ...]
const path = require('node:path');
let playwright;
try { playwright = require('playwright'); } catch { playwright = require('/opt/node22/lib/node_modules/playwright'); }
const cenas = process.argv.slice(2).length ? process.argv.slice(2) : ['cima', 'base', 'longa', 'meio', 'tunel', 'siteA', 'siteB', 'baseB', 'longaB', 'aereaA', 'aereaB'];
const NOMES = { cima: 'a-vista-de-cima', base: 'b1-saindo-da-base', longa: 'b2-longa-para-o-site-a', meio: 'b3-meio-portas', tunel: 'b4-tunel-janela-do-b',
  siteA: 'c1-site-a', siteB: 'c2-site-b', baseB: 'c3-base-lado-b', longaB: 'c4-longa-lado-b', aereaA: 'c5-aerea-lado-a', aereaB: 'c6-aerea-lado-b' };
(async () => {
  const nav = await playwright.chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const pag = await nav.newPage({ viewport: { width: 1280, height: 720 } });
  pag.on('console', (m) => { if (m.type() === 'error') console.log('console:', m.text()); });
  pag.on('pageerror', (e) => console.log('erro:', e.message));
  const sufixo = process.env.SUFIXO ?? '';
  for (const cena of cenas) {
    await pag.goto(`http://localhost:8765/docs/design/mapa-v2/previa/preview.html?cena=${cena}${process.env.SEMDECO ? '&semdeco' : ''}`);
    await pag.waitForFunction('window.pronto === true', null, { timeout: 60000 });
    await pag.screenshot({ path: path.join(__dirname, `${NOMES[cena] ?? cena}${sufixo}.png`) });
    console.log('ok', cena);
  }
  await nav.close();
})();
