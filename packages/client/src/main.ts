/**
 * Ponto de entrada standalone: monta as portas reais (áudio, storage, confete)
 * e inicia o jogo no `#view-blockstrike` do `index.html`.
 */

import './estilos/base.css';
import './estilos/blockstrike.css';
import { iniciar } from './index';
import { criarStorage } from './portas';
import type { AudioPort, Portas } from './portas';

/** `AudioContext` só nasce num gesto do usuário (política de autoplay); antes disso o jogo recebe `null`. */
function criarAudio(): AudioPort {
  let ctx: AudioContext | null = null;

  function liberar(): void {
    if (!ctx) {
      const Ctor = globalThis.AudioContext;
      if (!Ctor) return;
      ctx = new Ctor();
    }
    if (ctx.state === 'suspended') void ctx.resume();
  }

  for (const evento of ['pointerdown', 'keydown'] as const) {
    window.addEventListener(evento, liberar, { capture: true });
  }
  return { contexto: () => ctx };
}

/** Confete curto num canvas de tela cheia, removido sozinho. Respeita `prefers-reduced-motion`. */
function confete(): void {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  canvas.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:999';
  const c2d = canvas.getContext('2d');
  if (!c2d) return;
  document.body.appendChild(canvas);

  const cores = ['#00f2fe', '#ff2a6d', '#f6d365', '#fb923c', '#4ade80'];
  const pecas = Array.from({ length: 120 }, (_, i) => ({
    x: canvas.width / 2,
    y: canvas.height * 0.4,
    vx: (Math.random() - 0.5) * 16,
    vy: -Math.random() * 14 - 4,
    tam: 4 + Math.random() * 5,
    cor: cores[i % cores.length] as string,
  }));
  const inicio = performance.now();

  function quadro(agora: number): void {
    const t = agora - inicio;
    if (!c2d || t > 2200) {
      canvas.remove();
      return;
    }
    c2d.clearRect(0, 0, canvas.width, canvas.height);
    c2d.globalAlpha = Math.max(0, 1 - t / 2200);
    for (const p of pecas) {
      p.vy += 0.35;
      p.x += p.vx;
      p.y += p.vy;
      c2d.fillStyle = p.cor;
      c2d.fillRect(p.x, p.y, p.tam, p.tam);
    }
    requestAnimationFrame(quadro);
  }
  requestAnimationFrame(quadro);
}

const raiz = document.getElementById('view-blockstrike');
if (!raiz) throw new Error('#view-blockstrike ausente no index.html');

const portas: Portas = {
  audio: criarAudio(),
  storage: criarStorage('arcade:blockstrike:'),
  confetti: confete,
};

const jogo = iniciar(raiz, portas);

// Aba em segundo plano pausa (sai de tela cheia, desliga o fundo 3D); ao voltar, reexibe o menu/pausa.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) jogo.pausar();
  else jogo.retomar();
});
// Sem `destruir()` no pagehide: o jogo já salva a carreira nesse evento e a página pode voltar do bfcache.
