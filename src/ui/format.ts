import { DIR, SHAPES, ruleLine } from '../data/rules';
import type { Combo } from '../domain/combos';
import type { ColorMode } from '../state/settings';
import { esc, plural } from './dom';

/** ECTS bounds per combination and the overall spread, set by the app */
let ectsInfo: { of(key: string): { min: number; max: number } | null; spread: [number, number] } = { of: () => null, spread: [0, 0] };
export function setEctsInfo(info: typeof ectsInfo): void { ectsInfo = info; }

/** position of a combination on the ECTS colour scale (0 = fewest, 1 = most), by the middle of its range */
export function ectsPosition(key: string): number | null {
  const e = ectsInfo.of(key), [lo, hi] = ectsInfo.spread;
  return e && hi > lo ? ((e.min + e.max) / 2 - lo) / (hi - lo) : null;
}

/** CSS colour for a position on the ECTS scale (same three stops as the sphere) */
export function ectsCss(t: number): string {
  const u = Math.max(0, Math.min(1, t));
  return u < 0.5
    ? `color-mix(in srgb, var(--dir-en) ${Math.round(u * 200)}%, var(--shape-f3))`
    : `color-mix(in srgb, var(--dir-es) ${Math.round((u - 0.5) * 200)}%, var(--dir-en))`;
}

export const dirVar = (c: Combo | { dir: Combo['dir'] }) => `var(${DIR[c.dir].token})`;
export function colorVar(c: Combo, mode: ColorMode): string {
  if (mode === 'shape') return `var(${SHAPES[c.shape].token})`;
  if (mode === 'ects') { const t = ectsPosition(c.key); return t === null ? 'var(--ink-3)' : ectsCss(t); }
  return dirVar(c);
}
export const freeText = (n: number) => plural(n, 'ελεύθερο', 'ελεύθερα');

export function comboTip(c: Combo, active: boolean): string {
  const e = ectsInfo.of(c.key);
  return `<b>${esc(c.label)}</b>${esc(DIR[c.dir].name)} · ${esc(SHAPES[c.shape].name)} · ${esc(freeText(c.free))}`
    + `<span class="tip-rule">κανόνας ${c.rules.map(r => `${r}: ${esc(ruleLine(c.dir, r, c.shape))}`).join(' · ')}</span>`
    + (e ? `<span class="tip-rule">ECTS εμβάθυνσης: ${e.min}–${e.max}</span>` : '')
    + `<em>${active ? 'Κλικ: επιλογή και πλάνο μαθημάτων' : 'Εκτός των τρεχόντων φίλτρων'}</em>`;
}
