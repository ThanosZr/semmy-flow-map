import { Color } from 'three';

/** CSS tokens the renderer needs. The page owns the palette; the renderer only reads it. */
const TOKENS = [
  '--panel', '--globe', '--ink', '--ink-2', '--ink-3', '--off', '--accent',
  '--dir-es', '--dir-pl', '--dir-tl', '--dir-en', '--shape-f3', '--shape-f2h1', '--shape-f2h2',
] as const;
export type Token = typeof TOKENS[number];
export type Palette = Record<Token, Color>;

export function readPalette(): Palette {
  const cs = getComputedStyle(document.documentElement);
  const out = {} as Palette;
  for (const t of TOKENS) {
    const c = new Color();
    const raw = cs.getPropertyValue(t).trim();
    try { c.setStyle(raw || '#888888'); } catch { c.set('#888888'); }
    out[t] = c;
  }
  return out;
}

/** Calls `cb` whenever the viewer's theme can have changed (OS scheme or the host's data-theme). */
export function onThemeChange(cb: () => void): () => void {
  const mq = matchMedia('(prefers-color-scheme: dark)');
  const run = () => requestAnimationFrame(cb);
  mq.addEventListener('change', run);
  const mo = new MutationObserver(run);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class', 'style'] });
  return () => { mq.removeEventListener('change', run); mo.disconnect(); };
}
