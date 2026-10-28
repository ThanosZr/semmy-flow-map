/**
 * Right panel: the selected combination and the list of combinations that remain.
 */
import { DIR, DIRECTIONS, SHAPES, SHAPE_ORDER, ruleLine } from '../data/rules';
import { COMBO_BY_KEY, matches, type Combo } from '../domain/combos';
import { fmtEcts } from '../data/ects';
import { planEcts } from '../domain/ectsRange';
import { allocate, checks } from '../domain/plan';
import type { AppState } from '../state/app-state';
import type { Settings } from '../state/settings';
import type { Store } from '../state/store';
import { esc, on, render } from './dom';
import { colorVar, freeText } from './format';
import { slotMeter } from './PlanView';

export class Inspector {
  private canShare: () => boolean;
  private selEl: HTMLElement;
  private listEl: HTMLElement;
  private countEl: HTMLElement;

  constructor(root: HTMLElement, private store: Store<AppState>, private settings: Store<Settings>,
              actions: { select(key: string): void; openPlan(): void; focus(key: string): void; share(): void; canShare(): boolean },
              private ectsOf: (key: string) => { min: number; max: number } | null) {
    root.innerHTML = `
      <div class="pane-head"><h2>Επιλογή</h2></div>
      <div class="sel-card" id="selCard"></div>
      <div class="pane-head sub"><h2>Απομένουν</h2><span class="mono" id="remCount"></span></div>
      <ul class="rem-list" id="remList" aria-label="Συνδυασμοί που απομένουν"></ul>`;
    this.selEl = root.querySelector('#selCard')!;
    this.listEl = root.querySelector('#remList')!;
    this.countEl = root.querySelector('#remCount')!;
    on(this.listEl, 'click', '[data-key]', el => actions.select(el.dataset.key!));
    on(this.selEl, 'click', '[data-action="plan"]', () => actions.openPlan());
    on(this.selEl, 'click', '[data-action="focus"]', () => { const k = store.state.sel; if (k) actions.focus(k); });
    on(this.selEl, 'click', '[data-action="share"]', () => actions.share());
    this.canShare = actions.canShare;
    this.listEl.addEventListener('pointerover', ev => {
      const k = (ev.target as Element).closest<HTMLElement>('[data-key]')?.dataset.key ?? null;
      if (store.state.hover.key !== k) store.update(['hover'], s => { s.hover = { ...s.hover, key: k }; });
    });
    this.listEl.addEventListener('pointerleave', () => store.update(['hover'], s => { s.hover = { ...s.hover, key: null }; }));
  }

  renderSelection(): void {
    const s = this.store.state;
    const c = s.sel ? COMBO_BY_KEY.get(s.sel) : undefined;
    if (!c) {
      render(this.selEl, `<p class="muted">Κανένας συνδυασμός. Κάνε κλικ σε ένα σημείο της σφαίρας ή σε μια γραμμή της λίστας.</p>`);
      return;
    }
    const mode = this.settings.state.colorMode;
    const a = allocate(c, s.picks[c.key] ?? []);
    const bad = checks(c, a).filter(x => !x.ok).length;
    const d = DIR[c.dir];
    const range = this.ectsOf(c.key);
    const pe = planEcts(a, s.core, s.ects).spec;
    const ectsRow = range ? `<dt>ECTS</dt><dd>εμβάθυνση <b class="mono">${range.min}–${range.max}</b>${pe.total ? ` · πλάνο <span class="mono">${fmtEcts(pe.total)}${pe.unknown ? '+' : ''}</span>` : ''}</dd>` : '';
    render(this.selEl, `
      <div class="sel-title" style="--c:${colorVar(c, mode)}"><i aria-hidden="true"></i><b>${esc(c.label)}</b></div>
      <dl class="kv">
        <dt>Κατεύθυνση</dt><dd>${esc(d.name)}</dd>
        <dt>Σχήμα</dt><dd>${esc(SHAPES[c.shape].name)} + ${esc(freeText(c.free))}</dd>
        <dt>Κανόνας</dt><dd>${c.rules.map(r => `<span class="mono">${r}</span> ${esc(ruleLine(c.dir, r, c.shape))}`).join('<br>')}</dd>
        ${ectsRow}
        <dt>Πλάνο</dt><dd><span class="chip ${bad ? 'bad' : 'ok'}">${bad ? `${bad} εκκρεμότητες` : 'Έγκυρο'}</span>
          ${matches(c, s.filters) ? '' : '<span class="chip">Εκτός φίλτρων</span>'}</dd>
      </dl>
      ${slotMeter(c, a, true)}
      <div class="btnrow">
        <button type="button" class="btn primary" data-action="plan" data-focus-key="open-plan">Πλάνο μαθημάτων</button>
        <button type="button" class="btn" data-action="focus" data-focus-key="focus-sel">Εστίαση</button>
        ${this.canShare() ? '<button type="button" class="btn" data-action="share" data-focus-key="share-sel">Κοινοποίηση</button>' : ''}
      </div>`);
  }

  private ectsText(key: string): string {
    const e = this.ectsOf(key);
    return e ? ` · ${e.min}–${e.max}` : '';
  }

  renderList(rem: readonly Combo[], total: number): void {
    const s = this.store.state;
    const mode = this.settings.state.colorMode;
    this.countEl.textContent = `${rem.length} / ${total}`;
    const out: string[] = [];
    for (const d of DIRECTIONS) {
      const list = rem.filter(c => c.dir === d.id)
        .sort((a, b) => SHAPE_ORDER.indexOf(a.shape) - SHAPE_ORDER.indexOf(b.shape) || a.label.localeCompare(b.label, 'el'));
      if (!list.length) continue;
      out.push(`<li class="grp"><span>${esc(d.name)}</span><b>${list.length}</b></li>`);
      for (const c of list) {
        out.push(`<li><button type="button" data-key="${esc(c.key)}" data-focus-key="row-${esc(c.key)}" style="--c:${colorVar(c, mode)}" ${s.sel === c.key ? 'aria-current="true"' : ''}>
          <i aria-hidden="true"></i><span class="cl">${esc(c.label)}</span><span class="cm">${c.rules.join('/')} · ${c.free} ελ.${this.ectsText(c.key)}</span></button></li>`);
      }
    }
    if (!out.length) out.push('<li class="empty">Κανένας συνδυασμός δεν ταιριάζει. Χαλάρωσε κάποιο φίλτρο.</li>');
    render(this.listEl, out.join(''));
  }
}
