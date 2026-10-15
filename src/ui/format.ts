import { DIR, SHAPES } from '../data/rules';
import type { Combo } from '../domain/combos';
import type { ColorMode } from '../state/settings';
import { esc, plural } from './dom';

export const dirVar = (c: Combo | { dir: Combo['dir'] }) => `var(${DIR[c.dir].token})`;
export const colorVar = (c: Combo, mode: ColorMode) => (mode === 'shape' ? `var(${SHAPES[c.shape].token})` : dirVar(c));
export const freeText = (n: number) => plural(n, 'ελεύθερο', 'ελεύθερα');

export function comboTip(c: Combo, active: boolean): string {
  return `<b>${esc(c.label)}</b>${esc(DIR[c.dir].name)} · ${esc(SHAPES[c.shape].name)} · ${esc(freeText(c.free))}`
    + `<span class="tip-rule">κανόνας ${c.rules.map(r => `${r}: ${esc(DIR[c.dir].ruleText[r])}`).join(' · ')}</span>`
    + `<em>${active ? 'Κλικ: επιλογή και πλάνο μαθημάτων' : 'Εκτός των τρεχόντων φίλτρων'}</em>`;
}

