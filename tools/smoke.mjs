// Teste de fumaça do cliente no navegador.
// uso: node tools/smoke.mjs <url>   (ex.: http://localhost:4173, com `vite preview` rodando)
// Abre a página, espera o menu, clica em Jogar, espera 5 s. Falha (código 1) em console.error,
// exceção de página, requisição que falhou ou menu ausente.
import puppeteer from 'puppeteer-core';

const url = process.argv[2];
if (!url) {
  console.error('uso: node tools/smoke.mjs <url>');
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const erros = [];
let browser;

try {
  browser = await puppeteer.launch({
    executablePath: '/usr/bin/google-chrome',
    headless: true,
    args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });

  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    // Único filtro: o cliente não tem favicon, e o navegador pede /favicon.ico sozinho (404).
    if (new URL(m.location().url ?? 'http://x/').pathname === '/favicon.ico') return;
    erros.push(`console.error: ${m.text()} (${m.location().url ?? '?'})`);
  });
  page.on('pageerror', (e) => erros.push(`pageerror: ${e}`));
  page.on('requestfailed', (r) => erros.push(`requestfailed: ${r.url()}`));

  // Stub de pointer lock: o headless não trava o mouse de verdade.
  await page.evaluateOnNewDocument(() => {
    let travado = null;
    Object.defineProperty(document, 'pointerLockElement', { get: () => travado, configurable: true });
    Element.prototype.requestPointerLock = function () {
      travado = this;
      queueMicrotask(() => document.dispatchEvent(new Event('pointerlockchange')));
    };
    document.exitPointerLock = () => {
      travado = null;
      queueMicrotask(() => document.dispatchEvent(new Event('pointerlockchange')));
    };
  });

  const resp = await page.goto(url, { waitUntil: 'load', timeout: 15000 });
  if (!resp || !resp.ok()) throw new Error(`página respondeu ${resp ? resp.status() : 'sem resposta'}`);

  await page.waitForSelector('#bs-jogar', { visible: true, timeout: 10000 });
  await page.click('#bs-jogar');
  await sleep(5000);
} catch (e) {
  erros.push(`falha: ${e instanceof Error ? e.message : e}`);
} finally {
  if (browser) await browser.close().catch(() => {});
}

if (erros.length > 0) {
  console.error('SMOKE FALHOU');
  for (const e of erros) console.error(' - ' + e);
  process.exit(1);
}
console.log('SMOKE OK');
