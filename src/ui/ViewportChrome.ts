/**
 * HTML drawn over the two canvases (legends, title blocks, view tools, performance readouts)
 * and the status bar at the bottom of the window.
 */
import { fmtEcts } from '../data/ects';
import { DIR, DIRECTIONS, SHAPES, SHAPE_ORDER, type DirId } from '../data/rules';
import { COMBOS, type Combo } from '../domain/combos';
import type { RenderStats } from '../render/SphereView';
import type { AppState } from '../state/app-state';
import type { Settings } from '../state/settings';
import type { Store } from '../state/store';
import { esc, on } from './dom';

const fmtRatio = (r: number) => `${r.toFixed(2).replace(/\.?0+$/, '')}×`;

export interface ViewportEls { legend: HTMLElement; tblock: HTMLElement; tools: HTMLElement; stats: HTMLElement }

const ICON = {
  reset: '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="6.5" fill="none" stroke="currentColor" stroke-width="1.5"/><ellipse cx="10" cy="10" rx="2.6" ry="6.5" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M3.5 10h13" stroke="currentColor" stroke-width="1.2"/></svg>',
  play: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3.2 8.2a7 7 0 0 1 12.5-2.6" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M16.3 2.6v3.6h-3.6" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M16.8 11.8a7 7 0 0 1-12.5 2.6" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M3.7 17.4v-3.6h3.6" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>',
  pause: '<svg viewBox="0 0 20 20" aria-hidden="true"><rect x="5" y="4" width="3.4" height="12" rx="0.6" fill="currentColor"/><rect x="11.6" y="4" width="3.4" height="12" rx="0.6" fill="currentColor"/></svg>',
  gear: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 6.6a3.4 3.4 0 1 0 0 6.8 3.4 3.4 0 0 0 0-6.8Z" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M8.6 2.5h2.8l.4 2 1.6.9 1.9-.7 1.4 2.4-1.5 1.3v1.8l1.5 1.3-1.4 2.4-1.9-.7-1.6.9-.4 2H8.6l-.4-2-1.6-.9-1.9.7-1.4-2.4 1.5-1.3V8.4L3.3 7.1l1.4-2.4 1.9.7 1.6-.9Z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>',
};

function tools(st: Settings, withRotate: boolean): string {
  return `<button type="button" class="tool" data-tool="reset" title="Επαναφορά κάμερας" aria-label="Επαναφορά κάμερας">${ICON.reset}</button>
    ${withRotate ? `<button type="button" class="tool" data-tool="rotate" title="Αυτόματη περιστροφή" aria-label="Αυτόματη περιστροφή" aria-pressed="${st.autoRotate}">${st.autoRotate ? ICON.pause : ICON.play}</button>` : ''}
    <button type="button" class="tool" data-tool="settings" title="Ρυθμίσεις" aria-label="Ρυθμίσεις">${ICON.gear}</button>`;
}

const stateText = (r: RenderStats) => (r.paused ? 'σε παύση' : r.idle ? 'αδράνεια' : `${r.fps} fps`);

function statsHtml(r: RenderStats): string {
  return `<dl>
    <dt>Κατάσταση</dt><dd>${esc(stateText(r))}</dd>
    <dt>Καρέ συνολικά</dt><dd>${r.frames}</dd>
    <dt>Draw calls</dt><dd>${r.calls}</dd>
    <dt>Τρίγωνα</dt><dd>${r.triangles.toLocaleString('el-GR')}</dd>
    <dt>Σημεία</dt><dd>${r.points}</dd>
    <dt>Buffer</dt><dd>${r.buffer[0]}×${r.buffer[1]}</dd>
    <dt>Πυκνότητα</dt><dd>${fmtRatio(r.pixelRatio)}</dd>
    ${r.gpu ? `<dt>GPU</dt><dd class="gpu">${esc(r.gpu)}</dd>` : ''}
  </dl>`;
}

export class ViewportChrome {
  constructor(
    private els: ViewportEls,
    private courseEls: ViewportEls,
    private status: HTMLElement,
    private store: Store<AppState>,
    private settings: Store<Settings>,
    actions: { resetView(which: 1 | 2): void; toggleRotate(): void; openSettings(): void },
  ) {
    on(els.legend, 'click', '[data-dir]', el => {
      const id = el.dataset.dir as DirId;
      store.update(['filters'], s => { s.filters.dir = s.filters.dir === id ? null : id; });
    });
    els.legend.addEventListener('pointerover', ev => {
      const d = (ev.target as Element).closest<HTMLElement>('[data-dir]')?.dataset.dir ?? null;
      if (store.state.hover.dir !== d) store.update(['hover'], s => { s.hover = { ...s.hover, dir: d }; });
    });
    els.legend.addEventListener('pointerleave', () => store.update(['hover'], s => { s.hover = { ...s.hover, dir: null }; }));
    const toolHandler = (which: 1 | 2) => (el: HTMLElement) => {
      const t = el.dataset.tool;
      if (t === 'reset') actions.resetView(which);
      if (t === 'rotate') actions.toggleRotate();
      if (t === 'settings') actions.openSettings();
    };
    on(els.tools, 'click', '[data-tool]', toolHandler(1));
    on(courseEls.tools, 'click', '[data-tool]', toolHandler(2));
  }

  render(rem: readonly Combo[]): void {
    const s = this.store.state, st = this.settings.state;
    const title = '<p class="lg-title">Συνδυασμοί ροών</p>';
    if (st.colorMode === 'shape') {
      this.els.legend.innerHTML = title + SHAPE_ORDER.map(k => {
        const n = rem.filter(c => c.shape === k).length;
        return `<span class="lg-item" style="--c:var(${SHAPES[k].token})"><i></i>${esc(SHAPES[k].name)} <b>${n}</b></span>`;
      }).join('');
    } else {
      this.els.legend.innerHTML = title + DIRECTIONS.map(d => {
        const n = rem.filter(c => c.dir === d.id).length;
        return `<button type="button" class="lg-item" data-dir="${d.id}" style="--c:var(${d.token})" aria-pressed="${s.filters.dir === d.id}" ${n ? '' : 'data-empty'}><i></i>${esc(d.name)} <b>${n}</b></button>`;
      }).join('');
    }
    const F = s.filters;
    const parts: string[] = [];
    if (F.shape) parts.push(SHAPES[F.shape].name);
    for (const [f, v] of Object.entries(F.flows)) if (v) parts.push(({ F: '', H: '½', X: '✕' } as const)[v] + f);
    this.els.tblock.innerHTML = `
      <span>Συνδυασμοί</span><output><b>${rem.length}</b> / ${COMBOS.length}</output>
      <span class="opt">Κατεύθυνση</span><output class="opt">${esc(F.dir ? DIR[F.dir].name : 'όλες')}</output>
      <span>Δεσμεύσεις</span><output class="tb-flows">${esc(parts.length ? parts.join('  ') : 'καμία')}</output>`;
    this.els.tools.innerHTML = tools(st, true);
  }

  renderCourses(combo: Combo | null, preview: boolean, inPlan: number, total: number, ects: { total: number; known: number }): void {
    const st = this.settings.state;
    const dirToken = combo ? `var(${DIR[combo.dir].token})` : 'var(--ink-3)';
    const item = (cls: string, label: string) => `<span class="lg-item cs ${cls}" style="--c:${dirToken}"><i></i>${esc(label)}</span>`;
    this.courseEls.legend.innerHTML = `<p class="lg-title">Μαθήματα${preview ? ' · προεπισκόπηση' : ''}</p>`
      + item('st-plan', 'Στο πλάνο') + item('st-free', 'Ελεύθερο στο πλάνο') + item('st-opt', 'Επιλογή της ροής') + item('st-pool', 'Μπορεί να γίνει ελεύθερο');
    this.courseEls.tblock.innerHTML = `
      <span>Συνδυασμός</span><output class="tb-flows">${esc(combo ? combo.label : 'κανένας')}</output>
      <span>Στο πλάνο</span><output><b>${inPlan}</b> / ${total}</output>
      <span class="opt">ECTS</span><output class="opt">${ects.known ? `${fmtEcts(ects.total)}${ects.known < inPlan ? ` (${ects.known}/${inPlan})` : ''}` : '—'}</output>`;
    this.courseEls.tools.innerHTML = tools(st, false);
  }

  renderStats(r1: RenderStats | null, r2: RenderStats | null): void {
    const st = this.settings.state;
    const active = [r1, r2].some(r => r && !r.paused && !r.idle);
    const main = r1 ?? r2;
    this.status.innerHTML = `
      <span class="sb-item"><i class="led ${active ? 'on' : ''}"></i>${esc(main ? main.webgl : 'χωρίς WebGL')}</span>
      ${r1 ? `<span class="sb-item">ροές: ${esc(stateText(r1))}</span>` : ''}
      ${r2 ? `<span class="sb-item">μαθήματα: ${esc(stateText(r2))}</span>` : ''}
      ${main ? `<span class="sb-item hide-s">ανάλυση ${fmtRatio(main.pixelRatio)} · ${main.buffer[0]}×${main.buffer[1]} px</span>` : ''}
      <span class="sb-item hide-m">${st.msaa ? 'MSAA' : 'χωρίς MSAA'} · όριο ${st.fpsCap ? st.fpsCap + ' fps' : 'κανένα'}</span>
      <span class="sb-spacer"></span>
      <span class="sb-item hide-m">Οδηγός Σπουδών ΣΗΜΜΥ 2024-25 · ανεπίσημο εργαλείο</span>`;
    for (const [el, r] of [[this.els.stats, r1], [this.courseEls.stats, r2]] as const) {
      el.hidden = !st.showStats || !r;
      if (st.showStats && r) el.innerHTML = statsHtml(r);
    }
  }
}
