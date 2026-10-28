/**
 * Narrow screens: a summary strip right under each sphere, with what the desktop shows in the side panel:
 * the combination, its direction, shape and rule, plan progress and ECTS.
 */
import { CATEGORIES } from '../data/catalog';
import { fmtEcts } from '../data/ects';
import { DIR, SHAPES, ruleLine } from '../data/rules';
import type { Combo } from '../domain/combos';
import type { ColorMode } from '../state/settings';
import { esc } from './dom';
import { colorVar, freeText } from './format';

export interface SelStripData {
  combo: Combo | null;
  /** a combination shown from a card or the list, not (yet) the selected one */
  preview: boolean;
  total: number;
  valid: boolean;
  ects: { min: number; max: number } | null;
  planEcts: { total: number; unknown: number } | null;
  canShare: boolean;
  mode: ColorMode;
}

export function selStrip(d: SelStripData): string {
  const c = d.combo;
  if (!c) {
    return `<p class="strip-empty">Κανένας συνδυασμός. Πάτα ένα σημείο της σφαίρας για να δεις τι είναι, ή διάλεξε από τη λίστα πιο κάτω.</p>`;
  }
  const dir = DIR[c.dir];
  const flows = c.order.map(f => `${c.flows[f] === 'H' ? '½' : ''}${f} ${CATEGORIES[f].name}`).join(' · ');
  const ects = d.ects ? `<span title="ECTS των 23 μαθημάτων εμβάθυνσης, ανάλογα με τις επιλογές">ECTS ${d.ects.min}–${d.ects.max}</span>` : '';
  const planE = !d.preview && d.planEcts && d.planEcts.total ? `<span>τώρα ${fmtEcts(d.planEcts.total)}${d.planEcts.unknown ? '+' : ''}</span>` : '';
  return `<div class="strip-head" style="--c:${colorVar(c, d.mode)}"><i aria-hidden="true"></i><b>${esc(c.label)}</b>
      ${d.preview ? '<span class="chip">Προεπισκόπηση</span>' : `<span class="chip ${d.valid ? 'ok' : 'bad'}">${d.valid ? 'Έγκυρο' : `${d.total}/23`}</span>`}</div>
    <p class="strip-dir">${esc(dir.name)} · ${esc(SHAPES[c.shape].name)} + ${esc(freeText(c.free))}</p>
    <p class="strip-rule">${c.rules.map(r => `Κανόνας <b>${r}</b>: ${esc(ruleLine(c.dir, r, c.shape))}`).join('<br>')}</p>
    <p class="strip-flows">${esc(flows)}</p>
    <div class="strip-meta">${ects}${planE}</div>
    <div class="strip-btns">
      ${d.preview
        ? '<button type="button" class="btn primary" data-strip="select">Επιλογή</button>'
        : '<button type="button" class="btn primary" data-strip="plan">Πλάνο μαθημάτων</button>'}
      <button type="button" class="btn" data-strip="focus">Εστίαση</button>
      ${!d.preview && d.canShare ? '<button type="button" class="btn" data-strip="share">Κοινοποίηση</button>' : ''}
      <button type="button" class="btn ghost" data-strip="next" aria-label="Σφαίρα μαθημάτων">Μαθήματα ›</button>
    </div>`;
}

export function courseStrip(combo: Combo | null, preview: boolean, inPlan: number, ects: { total: number; unknown: number }): string {
  if (!combo) return '<p class="strip-empty">Διάλεξε έναν συνδυασμό στην πρώτη σφαίρα για να δεις εδώ τα μαθήματά του.</p>';
  return `<div class="strip-head" style="--c:var(${DIR[combo.dir].token})"><i aria-hidden="true"></i><b>${esc(combo.label)}</b>
      ${preview ? '<span class="chip">Προεπισκόπηση</span>' : ''}</div>
    <div class="strip-meta"><span>Στο πλάνο <b>${inPlan}</b> / 25 μαθήματα 6ου–9ου</span><span>${ects.total ? `${fmtEcts(ects.total)} ECTS${ects.unknown ? ` (+${ects.unknown} χωρίς τιμή)` : ''}` : ''}</span></div>
    <p class="strip-rule">Πάτα ένα μάθημα για να δεις τι είναι και να το προσθέσεις ή να το αφαιρέσεις.</p>
    <div class="strip-btns">
      <button type="button" class="btn ghost" data-strip="prev" aria-label="Σφαίρα συνδυασμών">‹ Συνδυασμοί</button>
      <button type="button" class="btn primary" data-strip="plan">Πλάνο μαθημάτων</button>
    </div>`;
}
