/**
 * Plan view: the 23 courses of the selected combination.
 * Mandatory courses are fixed, "k of n" groups are picked by the user, the rest are electives or free.
 */
import { CATEGORIES, COURSES, type CatId } from '../data/catalog';
import { CORE8, DIR, ELEC_DRAWING, FLOW_ORDER, PRAKTIKI, SHAPES, type CoreChoice } from '../data/rules';
import { COMBO_BY_KEY, matches, type Combo } from '../domain/combos';
import { DIPLOMA_ECTS, ectsOf, fmtEcts, sumEcts } from '../data/ects';
import { allocate, checks, isCoreMandatory, planText, semesterLoad, type Allocation, type FlowAllocation } from '../domain/plan';
import type { AppState } from '../state/app-state';
import type { Store } from '../state/store';
import { esc, on, render } from './dom';
import { dirVar, freeText } from './format';
import type { Toast } from './Toast';

type RowState = 'req' | 'on' | 'on grp' | 'grp' | 'free' | 'na' | '';

/** ECTS values in effect for the current render */
let ectsMap: Readonly<Record<string, number>> = {};

function row(id: string, st: RowState, tag: string): string {
  const c = COURSES[id];
  const e = ectsOf(id, ectsMap);
  const pressed = st === 'req' || st.startsWith('on') || st === 'free';
  const locked = st === 'req' || st === 'na';
  return `<button type="button" class="crs ${st}" data-id="${id}" data-focus-key="crs-${id}" aria-pressed="${pressed}" ${locked ? 'aria-disabled="true"' : ''}>
    <span class="box" aria-hidden="true"></span><span class="tx"><span class="cn">${esc(c.name)}</span><span class="cc">${esc(c.code)}${e === null ? '' : ` · ${fmtEcts(e)} ECTS`}</span></span>${tag ? `<span class="ct">${esc(tag)}</span>` : ''}</button>`;
}

function bySem(ids: readonly string[]): [number, string[]][] {
  const m = new Map<number, string[]>();
  for (const id of ids) { const s = COURSES[id].sem; m.set(s, [...(m.get(s) ?? []), id]); }
  return [...m.entries()].sort((a, b) => a[0] - b[0]);
}

/** 23 cells grouped per flow plus the free slots; shared with the inspector. */
export function slotMeter(c: Combo, a: Allocation, compact = false): string {
  const groups = c.order.map(f => {
    const x = a.flows[f]!;
    const name = `${c.flows[f] === 'H' ? '½' : ''}${f}`;
    return { lab: compact ? name : `${name} ${x.n}/${x.size}`, size: x.size, n: x.n, cls: '' };
  });
  const nf = Math.min(a.free.length, a.freeTarget);
  groups.push({ lab: compact || a.freeTarget < 3 ? 'ελ' : `ελ ${nf}/${a.freeTarget}`, size: a.freeTarget, n: nf, cls: 'fr' });
  return `<div class="slots ${compact ? 'compact' : ''}" role="img" aria-label="${a.total} από 23 θέσεις καλυμμένες">${groups.map(g =>
    `<div class="sg ${g.cls}" style="flex:${g.size} 1 0"><span class="sgl">${esc(g.lab)}</span><div class="cells">${
      Array.from({ length: g.size }, (_, i) => `<i class="${i < g.n ? 'on' : ''}"></i>`).join('')}</div></div>`).join('')}</div>`;
}

export class PlanView {
  private openCats = new Set<string>();

  constructor(private root: HTMLElement, private store: Store<AppState>, private toast: Toast,
              actions: { backToMap(): void; togglePick(id: string): void; file(a: 'pdf' | 'import' | 'ects-template'): void }) {
    on(root, 'click', '.crs[data-id], .chosen [data-id]', el => actions.togglePick(el.dataset.id!));
    on(root, 'click', '[data-file]', el => actions.file(el.dataset.file as 'pdf' | 'import' | 'ects-template'));
    on(root, 'click', '[data-core]', el => {
      const core = el.dataset.core as CoreChoice;
      store.update(['core', 'picks', 'example'], s => {
        s.core = core; s.example = false;
        for (const k of Object.keys(s.picks)) s.picks[k] = s.picks[k].filter(id => id !== core);
      });
    });
    on(root, 'click', '[data-action="clear-picks"]', () => {
      const k = store.state.sel; if (!k) return;
      store.update(['picks', 'example'], s => { s.picks[k] = []; s.example = false; });
      toast.show('Οι επιλογές καθαρίστηκαν. Τα σταθερά υποχρεωτικά μένουν.');
    });
    on(root, 'click', '[data-action="copy"]', () => this.copy());
    on(root, 'click', '[data-action="map"]', () => actions.backToMap());
    root.addEventListener('toggle', ev => {
      const d = ev.target as HTMLDetailsElement;
      if (d.dataset?.cat) d.open ? this.openCats.add(d.dataset.cat) : this.openCats.delete(d.dataset.cat);
    }, true);
  }

  private copy(): void {
    const s = this.store.state;
    const c = s.sel ? COMBO_BY_KEY.get(s.sel) : undefined;
    if (!c) return;
    const text = planText(c, allocate(c, s.picks[c.key] ?? []), s.core);
    const fallback = () => {
      const ta = document.createElement('textarea');
      ta.value = text; ta.setAttribute('readonly', ''); ta.className = 'offscreen';
      document.body.appendChild(ta); ta.select();
      let ok = false; try { ok = document.execCommand('copy'); } catch { ok = false; }
      ta.remove();
      this.toast.show(ok ? 'Το πλάνο αντιγράφηκε ως κείμενο.' : 'Η αντιγραφή δεν επιτρέπεται εδώ.');
    };
    try { navigator.clipboard.writeText(text).then(() => this.toast.show('Το πλάνο αντιγράφηκε ως κείμενο.'), fallback); }
    catch { fallback(); }
  }

  render(): void {
    const s = this.store.state;
    const c = s.sel ? COMBO_BY_KEY.get(s.sel) : undefined;
    if (!c) {
      render(this.root, `<div class="plan-empty"><p class="label">Πλάνο 23 μαθημάτων</p><h2>Δεν έχεις επιλέξει συνδυασμό</h2>
        <p>Διάλεξε έναν στον χάρτη: κλικ σε σημείο της σφαίρας ή σε μια γραμμή της λίστας «Απομένουν».</p>
        <button type="button" class="btn primary" data-action="map">Πίσω στον χάρτη</button></div>`);
      return;
    }
    const picks = s.picks[c.key] ?? [];
    ectsMap = s.ects;
    const a = allocate(c, picks);
    const list = checks(c, a);
    const planIds = Object.values(a.flows).flatMap(x => x!.counted).concat(a.free.slice(0, a.freeTarget), [ELEC_DRAWING, s.core]);
    const e = sumEcts(planIds, s.ects);
    const ectsBlock = e.known
      ? `<div class="ects-total"><b>${fmtEcts(e.total)}</b><span>ECTS στα ${e.known} από τα ${planIds.length} μαθήματα του 6ου–9ου</span></div>${e.unknown ? `<p class="hnote">Λείπει τιμή για ${e.unknown} μαθήματα.</p>` : ''}`
      : `<p class="hnote">Ο οδηγός σπουδών δεν δίνει ECTS ανά μάθημα, μόνο το σύνολο του διπλώματος. Κατέβασε το πρότυπο, συμπλήρωσε τη στήλη ects από τις σελίδες των μαθημάτων και φόρτωσέ το.</p>`;
    const bad = list.filter(x => !x.ok).length;
    const d = DIR[c.dir];

    const load = semesterLoad(a, s.core);
    const maxN = Math.max(9, ...Object.values(load.bySem));
    const H = 92;
    const hist = (Object.entries(load.bySem) as [string, number][]).map(([sem, n]) =>
      `<div class="hcol"><span class="hv">${n}</span><i class="hb" style="height:${(n / maxN) * H}px"></i><span class="hs">${sem}ο</span></div>`).join('');

    const chips = [
      s.example ? '<span class="chip">Παράδειγμα</span>' : '',
      bad ? `<span class="chip bad">${bad} εκκρεμότητες</span>` : '<span class="chip ok">Έγκυρο πλάνο</span>',
      matches(c, s.filters) ? '' : '<span class="chip">Εκτός φίλτρων</span>',
    ].join('');

    render(this.root, `
      <aside class="plan-side">
        <div class="chips">${chips}</div>
        <h2 class="plan-title" style="--c:${dirVar(c)}"><i aria-hidden="true"></i>${esc(c.label)}</h2>
        <p class="plan-meta">Κατεύθυνση ${esc(d.long)} · ${esc(SHAPES[c.shape].name)} + ${esc(freeText(c.free))}</p>
        <p class="plan-rule">${c.rules.map(r => `Κανόνας <span class="mono">${r}</span>: <code>${esc(d.ruleText[r])}</code>`).join('<br>')}</p>
        ${slotMeter(c, a)}
        <section><h3 class="label">Έλεγχος</h3>
          <ul class="checks">${list.map(x => `<li class="${x.ok ? 'ok' : 'bad'}"><span class="ic">${x.ok ? '✓' : '✕'}</span><span>${esc(x.text)}</span></li>`).join('')}</ul></section>
        <section><h3 class="label">Ανά εξάμηνο <small>με τα 2 του κορμού</small></h3>
          <div class="hist" style="--h:${H}px">${hist}<div class="ref" style="bottom:${(7 / maxN) * H + 24}px"><span>7</span></div></div>
          <p class="hnote">Η διακεκομμένη γραμμή είναι το όριο των 7 νέων μαθημάτων ανά εξάμηνο για μ.ο. ≤ 8,5 (§7.6).${load.earlier ? ` Επιπλέον ${load.earlier} μάθημα μικρότερου εξαμήνου.` : ''}</p></section>
        <section class="core"><h3 class="label">Κορμός 6ου–9ου</h3>
          <div class="fixed"><span>${esc(COURSES[ELEC_DRAWING].name)}</span><span class="mono">7ο · υποχρ.</span></div>
          <div class="pick" role="group" aria-label="Κατ’ επιλογήν υποχρεωτικό κορμού">
            ${(['3068', '3403'] as const).map(id => `<button type="button" data-core="${id}" data-focus-key="core-${id}" aria-pressed="${s.core === id}">${esc(COURSES[id].name)} <span>${COURSES[id].sem}ο</span></button>`).join('')}
          </div>
          <p class="hnote">Αν πάρεις και το δεύτερο, μετρά ως ελεύθερο.</p></section>
        <section class="ects"><h3 class="label">ECTS <small>δίπλωμα: ${DIPLOMA_ECTS}, §1.4</small></h3>
          ${ectsBlock}
          <div class="btnrow"><button type="button" class="btn" data-file="ects-template">Πρότυπο ECTS (.csv)</button><button type="button" class="btn" data-file="import">Φόρτωση αρχείου…</button></div></section>
        <div class="btnrow"><button type="button" class="btn primary" data-file="pdf">Αναφορά PDF</button><button type="button" class="btn" data-action="copy">Αντιγραφή ως κείμενο</button><button type="button" class="btn" data-action="clear-picks">Καθαρισμός επιλογών</button></div>
      </aside>
      <div class="plan-main">
        <div class="fcards">${c.order.map(f => this.flowCard(c, a.flows[f]!, picks)).join('')}</div>
        ${this.freeBox(c, a)}
      </div>`);
  }

  private flowCard(c: Combo, x: FlowAllocation, picks: readonly string[]): string {
    const f = x.f;
    const over = new Set(x.overflow), counted = new Set(x.counted);
    const groupOf = new Map<string, { k: number; n: number }>();
    x.groups.forEach(g => g.of.forEach(id => groupOf.set(id, { k: g.k, n: g.of.length })));
    const reqText = [x.req.fixed.length ? `${x.req.fixed.length} σταθερά` : '', ...x.groups.map(g => `${g.k} από ${g.of.length}`)].filter(Boolean).join(' + ');
    const sems = bySem(CATEGORIES[f].ids).map(([sem, ids]) => `<div class="sem"><span class="sl">${sem}ο</span><div class="rows">${ids.map(id => {
      if (x.req.fixed.includes(id)) return row(id, 'req', 'υποχρ.');
      const g = groupOf.get(id), picked = picks.includes(id);
      if (picked && over.has(id)) return row(id, 'free', 'ελεύθερο');
      if (picked && counted.has(id)) return row(id, g ? 'on grp' : 'on', g ? `υποχρ. ${g.k}/${g.n}` : '');
      if (COURSES[id].na) return row(id, 'na', 'δεν διδάχθηκε');
      return row(id, g ? 'grp' : '', g ? `${g.k} από ${g.n}` : '');
    }).join('')}</div></div>`).join('');
    const needs = x.groups.filter(g => g.need > 0)
      .map(g => `Λείπουν ${g.need} από: ${g.of.filter(id => !g.take.includes(id)).map(id => COURSES[id].name).join(', ')}.`);
    if (x.n < x.size && !needs.length) needs.push(`Διάλεξε ακόμη ${x.size - x.n} ${x.size - x.n === 1 ? 'μάθημα' : 'μαθήματα'} της ροής.`);
    const ok = x.n === x.size && x.missing === 0;
    const fe = sumEcts(x.counted, ectsMap);
    const ectsNote = fe.known ? ` · ${fmtEcts(fe.total)} ECTS${fe.unknown ? '+' : ''}` : '';
    const dNote = f === 'Δ' && x.kind === 'H' ? (c.dir === 'PL' ? ' · εκδοχή Πληροφορικής' : ' · εκδοχή λοιπών κατευθύνσεων') : '';
    return `<article class="fcard">
      <header><span class="badge" data-state="${x.kind}" aria-hidden="true">${f}</span>
        <div><h3>${esc(CATEGORIES[f].name)}</h3><p>${x.kind === 'F' ? 'Πλήρης · 7 μαθήματα' : 'Μισή · 4 μαθήματα'} · υποχρεωτικά: ${esc(reqText)}${esc(dNote)}${esc(ectsNote)}</p></div>
        <span class="fcount ${ok ? 'ok' : ''}">${x.n}/${x.size}</span></header>
      ${needs.length ? `<p class="need">${esc(needs.join(' '))}</p>` : ''}
      ${sems}
    </article>`;
  }

  private freeBox(c: Combo, a: Allocation): string {
    const s = this.store.state;
    const free = new Set(a.free);
    const cats: CatId[] = [...FLOW_ORDER.filter(f => !c.flows[f]), 'Φ', 'Μ', 'Ρ', 'Α', 'Κ'];
    const chosen = a.free.length
      ? a.free.map(id => `<button type="button" data-id="${id}" data-focus-key="chosen-${id}" title="Αφαίρεση"><b>${esc(COURSES[id].cat)}</b><span>${esc(COURSES[id].name)}</span><span aria-hidden="true">✕</span></button>`).join('')
      : '<span class="muted">Δεν έχεις διαλέξει ακόμη ελεύθερα μαθήματα.</span>';
    const body = cats.map(k => {
      let ids = CATEGORIES[k].ids;
      if (k === 'Κ') ids = ids.filter(id => id !== ELEC_DRAWING && id !== s.core);
      const nSel = ids.filter(id => free.has(id)).length;
      const rows = bySem(ids).map(([sem, list]) => `<div class="rowsem">${sem}ο εξάμηνο</div>` + list.map(id => {
        if (free.has(id)) return row(id, 'free', 'ελεύθερο');
        if (COURSES[id].na) return row(id, 'na', 'δεν διδάχθηκε');
        let tag = '';
        if (a.needsCoreMandatory && (CORE8 as readonly string[]).includes(k) && isCoreMandatory(id, c)) tag = 'υποχρ. ροής';
        if (id === PRAKTIKI) tag = 'εκτός ορίου';
        return row(id, '', tag);
      }).join('')).join('');
      const sub = k === 'Φ' || k === 'Μ' ? 'μόνο ελεύθερα' : k === 'Α' ? 'έως 1' : k === 'Ρ' ? 'έως 1 + Πρακτική' : k === 'Κ' ? 'το 2ο κατ’ επιλογήν' : `${ids.length} μαθήματα`;
      return `<details data-cat="${k}" ${this.openCats.has(k) ? 'open' : ''}><summary><span class="sb">${esc(k)}</span><span class="sn">${esc(CATEGORIES[k].name)}</span><span class="sx">${nSel ? `${nSel} επιλ. · ` : ''}${esc(sub)}</span></summary><div class="rows">${rows}</div></details>`;
    }).join('');
    const ok = a.free.length === a.freeTarget;
    const flowsOwn = c.order.length;
    return `<section class="freebox" aria-label="Ελεύθερα μαθήματα">
      <header><h3>Ελεύθερα μαθήματα</h3><span class="fcount ${ok ? 'ok' : ''}">${Math.min(a.free.length, a.freeTarget)}/${a.freeTarget}</span></header>
      <p class="fhelp">Ελεύθερο μπορεί να είναι μάθημα οποιασδήποτε ροής ή κατηγορίας εκτός των ${flowsOwn} ροών σου, καθώς και όσα παραπάνω διαλέξεις από τις ροές σου. Έως 1 ανθρωπιστικό και έως 1 μη εντασσόμενο, ενώ η Πρακτική Άσκηση μετρά επιπλέον.${a.needsCoreMandatory ? ' Επειδή έχεις ροή Ο ή Ι, ένα ελεύθερο πρέπει να είναι υποχρεωτικό μάθημα άλλης ροής (Υ, Λ, Η, Δ, Τ, Σ, Ζ, Ε) από το 6ο–8ο εξάμηνο.' : ''}</p>
      <div class="chosen">${chosen}</div>
      <div class="cats">${body}</div>
    </section>`;
  }
}
