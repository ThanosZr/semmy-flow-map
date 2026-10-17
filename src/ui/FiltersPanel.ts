/**
 * Left panel: direction, combination shape and per-flow constraints.
 * Every option shows how many combinations would remain, and options that would leave none are disabled.
 */
import { CATEGORIES, type FlowId } from '../data/catalog';
import { DIRECTIONS, FLOW_ORDER, SHAPES, SHAPE_ORDER, type DirId, type ShapeId } from '../data/rules';
import { countWith, flowStats, type Combo, type Filters, type FlowState } from '../domain/combos';
import type { AppState } from '../state/app-state';
import type { Store } from '../state/store';
import { esc, on, render } from './dom';

const STATE_LABEL: Record<FlowState, [string, string]> = { F: ['Πλήρης', 'πλήρης'], H: ['Μισή', 'μισή'], X: ['Όχι', 'χωρίς'] };

export class FiltersPanel {
  /** overall ECTS spread of the 23 specialisation courses, set by the app */
  spread: [number, number] = [0, 0];
  private pendingEcts: [number, number] | null = null;

  constructor(private root: HTMLElement, private store: Store<AppState>, actions: { setFlow(f: FlowId, s: FlowState | null): void }) {
    on(root, 'click', '[data-dir]', el => {
      const id = el.dataset.dir as DirId;
      store.update(['filters'], s => { s.filters.dir = s.filters.dir === id ? null : id; });
    });
    on(root, 'click', '[data-shape]', el => {
      const id = el.dataset.shape as ShapeId;
      store.update(['filters'], s => { s.filters.shape = s.filters.shape === id ? null : id; });
    });
    on(root, 'click', 'button[data-flow]', el => {
      if ((el as HTMLButtonElement).disabled) return;
      const f = el.dataset.flow as FlowId, st = el.dataset.s as FlowState;
      actions.setFlow(f, store.state.filters.flows[f] === st ? null : st);
    });
    on(root, 'click', '[data-action="clear"]', () => store.update(['filters'], s => { s.filters = { dir: null, shape: null, flows: {}, ects: null }; }));
    on(root, 'input', 'input[data-ects]', el => {
      const [lo, hi] = this.spread;
      const inputs = root.querySelectorAll<HTMLInputElement>('input[data-ects]');
      let a = Number(inputs[0].value), b = Number(inputs[1].value);
      if (a > b) { if (el.dataset.ects === 'lo') b = a; else a = b; inputs[0].value = String(a); inputs[1].value = String(b); }
      const out = root.querySelector('#ectsOut');
      if (out) out.textContent = `${a}–${b}`;
      this.pendingEcts = a <= lo && b >= hi ? null : [a, b];
    });
    on(root, 'change', 'input[data-ects]', () => {
      const v = this.pendingEcts;
      store.update(['filters'], s => { s.filters.ects = v; });
    });
    on(root, 'click', '[data-action="ects-clear"]', () => store.update(['filters'], s => { s.filters.ects = null; }));
    root.addEventListener('pointerover', ev => {
      const t = ev.target as Element;
      const row = t.closest<HTMLElement>('[data-frow]'), dir = t.closest<HTMLElement>('.dir');
      this.hover({ flow: row?.dataset.frow ?? null, dir: dir?.dataset.dir ?? null });
    });
    root.addEventListener('pointerleave', () => this.hover({ flow: null, dir: null }));
  }

  private hover(h: { flow: string | null; dir: string | null }) {
    const cur = this.store.state.hover;
    if (cur.flow === h.flow && cur.dir === h.dir) return;
    this.store.update(['hover'], s => { s.hover = { ...s.hover, ...h }; });
  }

  render(rem: readonly Combo[]): void {
    const F = this.store.state.filters;
    const anyFilter = Boolean(F.dir || F.shape || Object.keys(F.flows).length || F.ects);

    const dirs = DIRECTIONS.map(d => {
      const on = F.dir === d.id, n = countWith(F, { dir: d.id });
      return `<button type="button" class="dir" data-dir="${d.id}" data-focus-key="dir-${d.id}" style="--c:var(${d.token})" aria-pressed="${on}" ${n === 0 && !on ? 'disabled' : ''}>
        <span class="dot"></span><span class="dn">${esc(d.name)}</span><span class="dk">${esc(d.tag)}</span><span class="dc">${n}</span></button>`;
    }).join('');

    const shapes = SHAPE_ORDER.map(k => {
      const on = F.shape === k, n = countWith(F, { shape: k });
      return `<button type="button" class="shape" data-shape="${k}" data-focus-key="shape-${k}" aria-pressed="${on}" ${n === 0 && !on ? 'disabled' : ''}>
        <span class="sn">${esc(SHAPES[k].name)}</span><span class="sk">${esc(SHAPES[k].sub)}</span><span class="sc">${n}</span></button>`;
    }).join('');

    const tot = rem.length;
    const flows = FLOW_ORDER.map(f => {
      const st = F.flows[f] ?? '';
      const { full, half, out } = flowStats(rem, f);
      const opt = (s: FlowState) => {
        const on = st === s, n = countWith(F, { flows: { ...F.flows, [f]: s } });
        const [lab, word] = STATE_LABEL[s];
        return `<button type="button" data-flow="${f}" data-s="${s}" data-focus-key="flow-${f}-${s}" aria-pressed="${on}" ${n === 0 && !on ? 'disabled' : ''}
          title="${lab}: ${n} συνδυασμοί" aria-label="Ροή ${f} ${word}, ${n} συνδυασμοί">${lab}</button>`;
      };
      return `<div class="frow" data-frow="${f}">
        <span class="badge" data-state="${st}" aria-hidden="true">${f}</span>
        <div class="fn">${esc(CATEGORIES[f].name)}</div>
        <div class="fmeta" title="Από τους ${tot} που απομένουν: πλήρης σε ${full}, μισή σε ${half}, εκτός σε ${out}">
          <div class="bar" aria-hidden="true"><i class="bf" style="width:${tot ? (full / tot) * 100 : 0}%"></i><i class="bh" style="width:${tot ? (half / tot) * 100 : 0}%"></i></div>
          <div class="fstat">${full} πλήρης · ${half} μισή</div>
        </div>
        <div class="seg" role="group" aria-label="Ροή ${f}">${opt('F')}${opt('H')}${opt('X')}</div>
      </div>`;
    }).join('');

    const extra = (['Φ', 'Μ'] as const).map(f => `<div class="frow only"><span class="badge" data-state="free" aria-hidden="true">${f}</span>
      <div class="fn">${esc(CATEGORIES[f].name)}</div><div class="fmeta fonly">μόνο ως ελεύθερα μαθήματα</div></div>`).join('');

    render(this.root, `
      <div class="pane-head"><h2>Φίλτρα</h2><button type="button" class="linkbtn" data-action="clear" data-focus-key="clear" ${anyFilter ? '' : 'disabled'}>Καθαρισμός</button></div>
      <section class="group"><h3 class="label">Κατεύθυνση</h3><div class="dirs">${dirs}</div></section>
      <section class="group"><h3 class="label">Σχήμα <small>23 = ροές + ελεύθερα</small></h3><div class="shapes">${shapes}</div></section>
      <section class="group"><h3 class="label">Ροές <small>πλήρης 7 · μισή 4</small></h3><div class="flows">${flows}${extra}</div></section>
      ${this.ectsSection(F)}`);
  }

  private ectsSection(F: Filters): string {
    const [lo, hi] = this.spread;
    if (!(hi > lo)) return '';
    const [a, b] = F.ects ?? [lo, hi];
    this.pendingEcts = F.ects;
    return `<section class="group ects-filter"><h3 class="label">ECTS εμβάθυνσης <small>23 μαθήματα</small></h3>
      <p class="ef-help">Κρατά τους συνδυασμούς που μπορούν να βγάλουν ECTS μέσα στο εύρος <output id="ectsOut">${a}–${b}</output>.
        ${F.ects ? '<button type="button" class="linkbtn" data-action="ects-clear" data-focus-key="ects-clear">Όλα</button>' : ''}</p>
      <div class="ef-rows">
        <label>Από <input type="range" data-ects="lo" data-focus-key="ects-lo" min="${lo}" max="${hi}" step="2" value="${a}" aria-label="ECTS από"></label>
        <label>Έως <input type="range" data-ects="hi" data-focus-key="ects-hi" min="${lo}" max="${hi}" step="2" value="${b}" aria-label="ECTS έως"></label>
      </div></section>`;
  }
}
