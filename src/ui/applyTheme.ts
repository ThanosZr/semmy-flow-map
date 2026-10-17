/**
 * Puts the chosen theme on the page as CSS custom properties on <html>. The stylesheet keeps the
 * original palette as a fallback; inline properties win. The spheres re-read the palette whenever
 * the root's style changes (render/theme.ts), so they follow automatically.
 */
import { PRESETS, resolveTheme, rgbOf, themeVars, type BaseColors, type Scheme } from '../data/themes';
import type { Settings } from '../state/settings';

export function currentScheme(s: Pick<Settings, 'scheme'>): Scheme {
  if (s.scheme !== 'auto') return s.scheme;
  const host = document.documentElement.getAttribute('data-theme');
  if (host === 'dark' || host === 'light') return host;
  return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function applyTheme(s: Settings): Scheme {
  const scheme = currentScheme(s);
  const t = resolveTheme(s.theme, scheme, scheme === 'dark' ? s.colorsDark : s.colorsLight);
  const root = document.documentElement;
  for (const [k, v] of Object.entries(themeVars(t))) {
    if (root.style.getPropertyValue(k) !== v) root.style.setProperty(k, v);
  }
  root.style.colorScheme = scheme;
  root.dataset.scheme = scheme;
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (meta) meta.content = t.base.panel;
  return scheme;
}

/** re-apply when the OS or the host page switches between light and dark (only matters for "auto") */
export function watchScheme(get: () => Settings): void {
  const re = () => { if (get().scheme === 'auto') applyTheme(get()); };
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', re);
  new MutationObserver(re).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
}

export type RGB = [number, number, number];
export interface PrintColors {
  ink: RGB; ink2: RGB; rule: RGB; ok: RGB; bad: RGB; accent: RGB; head: RGB; alt: RGB;
  dir: Record<'ES' | 'PL' | 'TL' | 'EN', RGB>;
}

/** colours for the PDF: always the light variant of the chosen theme (it is printed on white) */
export function printColors(s: Settings): PrintColors {
  const t = resolveTheme(s.theme, 'light', s.colorsLight);
  const b: BaseColors = t.base;
  return {
    ink: rgbOf(b.ink), ink2: rgbOf(b.ink2), rule: rgbOf(t.derived.rule), ok: rgbOf(b.ok), bad: rgbOf(b.bad),
    accent: rgbOf(b.accent), head: rgbOf(b.ink), alt: rgbOf(t.derived.panel2),
    dir: { ES: rgbOf(b.dirES), PL: rgbOf(b.dirPL), TL: rgbOf(b.dirTL), EN: rgbOf(b.dirEN) },
  };
}

/** swatches of a preset for the theme picker */
export function swatches(id: keyof typeof PRESETS, scheme: Scheme): string[] {
  const c = PRESETS[id][scheme];
  return [c.paper, c.ink, c.dirES, c.dirPL, c.dirTL, c.dirEN, c.accent];
}
