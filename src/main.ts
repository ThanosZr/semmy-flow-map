import './styles/tokens.css';
import './styles/base.css';
import './styles/shell.css';
import './styles/panels.css';
import './styles/viewport.css';
import './styles/plan.css';
import './styles/settings.css';

import { CATEGORIES, COURSES, type CatId, type FlowId } from './data/catalog';
import { ectsOf, fmtEcts, sumEcts } from './data/ects';
import { ELEC_DRAWING } from './data/rules';
import { COMBOS, COMBO_BY_KEY, filterCombos, flowStats, matches, type Combo, type FlowState } from './domain/combos';
import { COURSE_IDS, courseStates, IN_PLAN, STATE_TEXT } from './domain/courses';
import { allocate, checks, rejectPick } from './domain/plan';
import { datedName, prepareSaving, saveFile, type SaveOutcome } from './io/save';
import { ectsTemplateCsv, exportJson, parseImport } from './io/transfer';
import { ComboGlobe } from './render/ComboGlobe';
import { CourseGlobe } from './render/CourseGlobe';
import { appStore as store, type View } from './state/app-state';
import { settingsStore as settings, type Settings } from './state/settings';
import { $, esc, on } from './ui/dom';
import { FileMenu, type FileAction } from './ui/FileMenu';
import { FiltersPanel } from './ui/FiltersPanel';
import { comboTip } from './ui/format';
import { Inspector } from './ui/Inspector';
import { PlanView } from './ui/PlanView';
import { SettingsPanel } from './ui/SettingsPanel';
import { Toast } from './ui/Toast';
import { ViewportChrome } from './ui/ViewportChrome';

const app = $('#app');
const toast = new Toast($('#toast'));
let remaining: Combo[] = filterCombos(store.state.filters);
let globe: ComboGlobe | null = null;
let courses: CourseGlobe | null = null;
/** combination under the pointer on sphere 1 (previewed on sphere 2) */
let globeHoverKey: string | null = null;
/** course states currently shown on sphere 2 (for its tooltips) */
let lastStates = courseStates(null, null, [], store.state.core);

const selectedCombo = (): Combo | null => (store.state.sel ? COMBO_BY_KEY.get(store.state.sel) ?? null : null);

const actions = {
  select(key: string, focus = true) {
    if (!COMBO_BY_KEY.has(key)) return;
    store.update(['sel', 'picks', 'example'], s => {
      if (s.sel !== key) s.example = false;
      s.sel = key;
      if (!s.picks[key]) s.picks[key] = [];
    });
    if (focus) globe?.focus(key);
  },
  setFlow(f: FlowId, st: FlowState | null) {
    store.update(['filters'], s => { if (st) s.filters.flows[f] = st; else delete s.filters.flows[f]; });
  },
  /** click on a flow anchor in sphere 1: none → full → half → excluded → none, skipping empty options */
  cycleFlow(f: FlowId) {
    const seq: (FlowState | null)[] = [null, 'F', 'H', 'X'];
    const cur = store.state.filters.flows[f] ?? null;
    for (let step = 1; step <= 4; step++) {
      const next = seq[(seq.indexOf(cur) + step) % 4];
      if (!next || filterCombos({ ...store.state.filters, flows: { ...store.state.filters.flows, [f]: next } }).length) {
        actions.setFlow(f, next);
        return;
      }
    }
  },
  setView(v: View) { store.update(['view'], s => { s.view = v; }); },
  /** add or remove a course from the plan of the selected combination */
  togglePick(id: string) {
    const c = selectedCombo();
    if (!c) { toast.show('Διάλεξε πρώτα έναν συνδυασμό στη σφαίρα ροών ή στη λίστα.'); return; }
    if (id === ELEC_DRAWING) { toast.show('Το Ηλεκτρολογικό Σχέδιο είναι υποχρεωτικό μάθημα κορμού.'); return; }
    if (id === store.state.core) { toast.show('Είναι το κατ’ επιλογήν μάθημα κορμού σου. Το αλλάζεις από το πλάνο μαθημάτων.'); return; }
    const picks = store.state.picks[c.key] ?? [];
    if (picks.includes(id)) {
      store.update(['picks', 'example'], d => { d.picks[c.key] = picks.filter(x => x !== id); d.example = false; });
      return;
    }
    const why = rejectPick(c, picks, id);
    if (why) { toast.show(why); return; }
    store.update(['picks', 'example'], d => { d.picks[c.key] = picks.concat(id); d.example = false; });
  },
  file(a: FileAction) { fileMenu.trigger(a); },
};

/* ------------------------------------------------------------------ panels */
const filters = new FiltersPanel($('#filters'), store, actions);
const inspector = new Inspector($('#inspector'), store, settings, {
  select: k => actions.select(k),
  openPlan: () => actions.setView('plan'),
  focus: k => globe?.focus(k),
});
const plan = new PlanView($('#viewPlan'), store, toast, {
  backToMap: () => actions.setView('map'),
  togglePick: id => actions.togglePick(id),
  file: a => actions.file(a),
});
const settingsPanel = new SettingsPanel($('#settings'), settings);
const chrome = new ViewportChrome(
  { legend: $('#vpLegend'), tblock: $('#vpTblock'), tools: $('#vpTools'), stats: $('#vpStats') },
  { legend: $('#vpLegend2'), tblock: $('#vpTblock2'), tools: $('#vpTools2'), stats: $('#vpStats2') },
  $('#statusbar'), store, settings,
  {
    resetView: which => (which === 1 ? globe : courses)?.resetView(),
    toggleRotate: () => settings.update(['autoRotate'], s => { s.autoRotate = !s.autoRotate; }),
    openSettings: () => settingsPanel.open(),
  },
);

/* ------------------------------------------------------------------ files */
async function reportSave(promise: Promise<SaveOutcome>, done: string) {
  const r = await promise;
  if (r === 'saved') toast.show(done);
  else if (r === 'declined') toast.show('Η αποθήκευση ακυρώθηκε.');
  else toast.show('Υπάρχει ήδη ανοιχτό παράθυρο αποθήκευσης. Δοκίμασε ξανά σε λίγο.');
}

function paperRgb(): [number, number, number] {
  const probe = document.createElement('i');
  probe.style.color = 'var(--paper)';
  document.body.appendChild(probe);
  const m = getComputedStyle(probe).color.match(/\d+/g) ?? ['255', '255', '255'];
  probe.remove();
  return [Number(m[0]), Number(m[1]), Number(m[2])];
}

async function makePdf() {
  const c = selectedCombo();
  if (!c) { toast.show('Διάλεξε πρώτα έναν συνδυασμό για να βγει αναφορά.'); return; }
  toast.show('Ετοιμάζεται η αναφορά PDF…', 8000);
  try {
    const { buildReport } = await import('./io/report');
    const a = allocate(c, store.state.picks[c.key] ?? []);
    const usable = (s: ReturnType<ComboGlobe['snapshot']>) => (s && s.width > 80 && s.height > 80 ? s : null);
    const blob = await buildReport({
      combo: c, alloc: a, checks: checks(c, a), core: store.state.core, ects: store.state.ects,
      combosImage: usable(globe?.snapshot() ?? null),
      coursesImage: settings.state.courseGlobe ? usable(courses?.snapshot() ?? null) : null,
      imageBackground: paperRgb(),
    });
    const name = `plano-${c.label.replace(/[^\p{L}\p{N}]+/gu, '')}-${datedName('', 'pdf').slice(1)}`;
    await reportSave(saveFile(name, blob), 'Η αναφορά PDF αποθηκεύτηκε.');
  } catch (err) {
    console.error(err);
    toast.show('Η αναφορά PDF δεν μπόρεσε να δημιουργηθεί σε αυτόν τον browser.');
  }
}

const fileMenu = new FileMenu($<HTMLButtonElement>('#fileBtn'), $<HTMLInputElement>('#fileInput'), a => {
  if (a === 'export') {
    const blob = new Blob([exportJson(store.state, settings.state)], { type: 'application/json' });
    void reportSave(saveFile(datedName('xartis-roon', 'json'), blob), 'Οι ρυθμίσεις και οι επιλογές αποθηκεύτηκαν σε αρχείο.');
  } else if (a === 'ects-template') {
    const blob = new Blob([ectsTemplateCsv(store.state.ects)], { type: 'text/csv' });
    void reportSave(saveFile('ects-protypo.csv', blob), 'Το πρότυπο ECTS αποθηκεύτηκε. Συμπλήρωσε τη στήλη ects και φόρτωσέ το.');
  } else if (a === 'pdf') {
    void makePdf();
  }
}, async file => {
  try {
    const r = parseImport(await file.text(), file.name);
    if (r.kind === 'full') {
      settings.update(Object.keys(r.settings) as (keyof Settings)[], s => { Object.assign(s, r.settings); });
      store.update(['filters', 'sel', 'picks', 'core', 'example', 'view', 'ects'], s => { Object.assign(s, { ...r.state, hover: s.hover }); });
      const label = r.state.sel ? COMBO_BY_KEY.get(r.state.sel)!.label : 'χωρίς επιλεγμένο συνδυασμό';
      toast.show(`Φορτώθηκε το «${file.name}»: ${label}, ${r.picks} επιλογές μαθημάτων${r.ects ? `, ECTS για ${r.ects} μαθήματα` : ''}.`, 5000);
      if (r.state.sel) setTimeout(() => globe?.focus(r.state.sel!), 50);
    } else {
      store.update(['ects'], s => { s.ects = { ...s.ects, ...r.ects }; });
      toast.show(`Φορτώθηκαν ECTS για ${r.count} μαθήματα${r.skipped ? `· ${r.skipped} γραμμές αγνοήθηκαν` : ''}.`, 5000);
    }
  } catch (err) {
    toast.show(err instanceof Error ? err.message : 'Το αρχείο δεν μπόρεσε να διαβαστεί.', 5000);
  }
});

/* ------------------------------------------------------------------ spheres */
const failMsg = (el: HTMLElement) => {
  el.hidden = false;
  el.textContent = 'Η σφαίρα δεν μπόρεσε να ξεκινήσει σε αυτή τη συσκευή. Τα φίλτρα, η λίστα και το πλάνο λειτουργούν κανονικά.';
};

try {
  globe = new ComboGlobe(
    { host: $('#viewport'), glLayer: $('#glLayer'), labelsLayer: $('#labelsLayer'), tip: $('#tip'), msg: $('#vpMsg') },
    settings.state,
    {
      onPick: key => actions.select(key),
      onHover: key => { globeHoverKey = key; updateCourses(); },
      onAnchorClick: f => actions.cycleFlow(f),
      describe: key => { const c = COMBO_BY_KEY.get(key)!; return comboTip(c, matches(c, store.state.filters)); },
      describeAnchor: f => {
        const { full, half } = flowStats(remaining, f);
        const pole = f === 'Ο' || f === 'Ι'
          ? '<span class="tip-rule">Μπαίνει σε όλες τις κατευθύνσεις, μόνο ως συμπληρωματική ροή (κανόνας α). Οι συνδυασμοί της σχηματίζουν δακτύλιο γύρω από τον πόλο.</span>'
          : '';
        return `<b>Ροή ${f}</b>${esc(CATEGORIES[f].name)}${pole}<em>Στους ${remaining.length} που απομένουν: πλήρης σε ${full}, μισή σε ${half}. Κλικ: πλήρης → μισή → όχι.</em>`;
      },
    },
  );
} catch (err) { console.error(err); failMsg($('#vpMsg')); }

try {
  courses = new CourseGlobe(
    { host: $('#viewport2'), glLayer: $('#glLayer2'), labelsLayer: $('#labelsLayer2'), tip: $('#tip2'), msg: $('#vpMsg2') },
    settings.state,
    {
      onPick: id => actions.togglePick(id),
      onAnchorClick: () => { /* the tooltip says what the group is */ },
      describe: id => {
        const co = COURSES[id];
        const st = lastStates.get(id) ?? 'idle';
        const e = ectsOf(id, store.state.ects);
        const action = !selectedCombo() ? '' : IN_PLAN.has(st) ? (st === 'req' || st === 'core' ? '' : 'Κλικ: αφαίρεση από το πλάνο') : st === 'na' ? '' : 'Κλικ: προσθήκη στο πλάνο';
        return `<b>${esc(co.name)}</b>${esc(co.code)} · ${co.sem}ο εξάμηνο · ${esc(co.cat)} ${esc(CATEGORIES[co.cat].name)}`
          + `<span class="tip-rule">${esc(STATE_TEXT[st])}${e === null ? '' : ` · ${fmtEcts(e)} ECTS`}</span>${action ? `<em>${action}</em>` : ''}`;
      },
      describeAnchor: (cat: CatId) => {
        const ids = CATEGORIES[cat].ids;
        const inPlan = ids.filter(id => IN_PLAN.has(lastStates.get(id) ?? 'idle')).length;
        return `<b>${esc(cat)} · ${esc(CATEGORIES[cat].name)}</b>${ids.length} μαθήματα, ${inPlan} στο πλάνο<em>Μέσα το 6ο εξάμηνο, έξω το 9ο.</em>`;
      },
    },
  );
} catch (err) { console.error(err); failMsg($('#vpMsg2')); }


/** sphere 2 follows the combination under the pointer (preview) or the selected one */
function updateCourses() {
  const previewKey = globeHoverKey ?? store.state.hover.key;
  const preview = previewKey && previewKey !== store.state.sel ? COMBO_BY_KEY.get(previewKey) ?? null : null;
  const c = preview ?? selectedCombo();
  const picks = c ? store.state.picks[c.key] ?? [] : [];
  const a = c ? allocate(c, picks) : null;
  lastStates = courseStates(c, a, picks, store.state.core);
  courses?.setPlan(c, lastStates);
  const inPlan = COURSE_IDS.filter(id => IN_PLAN.has(lastStates.get(id)!));
  const e = sumEcts(inPlan, store.state.ects);
  chrome.renderCourses(c, Boolean(preview), inPlan.length, 25, e);
}

/* ------------------------------------------------------------------ top bar */
const topbar = $('#topbar');
on(topbar, 'click', '[data-view]', el => actions.setView(el.dataset.view as View));
on(topbar, 'click', '[data-action="settings"]', () => settingsPanel.toggle());

function renderTopbar() {
  const s = store.state;
  const c = selectedCombo();
  const badge = $('#planBadge');
  if (c) {
    const a = allocate(c, s.picks[c.key] ?? []);
    badge.textContent = `${a.total}/23`;
    badge.dataset.ok = String(checks(c, a).every(x => x.ok));
  } else {
    badge.textContent = '—';
    badge.dataset.ok = 'false';
  }
  $('#topCount').innerHTML = `<b>${remaining.length}</b><span>/ ${COMBOS.length}</span>`;
  topbar.querySelectorAll<HTMLElement>('[data-view]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.view === s.view)));
}

function applyView() {
  const v = store.state.view;
  app.dataset.view = v;
  app.dataset.courses = settings.state.courseGlobe ? 'on' : 'off';
  $('#viewMap').hidden = v !== 'map';
  $('#viewPlan').hidden = v !== 'plan';
  $('#viewport2').hidden = !settings.state.courseGlobe;
  globe?.setViewVisible(v === 'map');
  courses?.setViewVisible(v === 'map' && settings.state.courseGlobe);
  if (v === 'plan') { plan.render(); $('#viewPlan').scrollTop = 0; }
}

/* ------------------------------------------------------------------ wiring */
function refreshFilters(fromUser = false) {
  remaining = filterCombos(store.state.filters);
  filters.render(remaining);
  inspector.renderList(remaining, COMBOS.length);
  chrome.render(remaining);
  globe?.setActive(new Set(remaining.map(c => c.key)));
  globe?.setFlowStates(store.state.filters.flows);
  if (remaining.length === 1 && store.state.sel !== remaining[0].key) { actions.select(remaining[0].key); return; }
  const selInside = remaining.some(c => c.key === store.state.sel);
  if (fromUser && settings.state.autoFocus && remaining.length < COMBOS.length && !selInside) {
    globe?.focusOnSet(new Set(remaining.map(c => c.key)));
  }
}

store.subscribe((s, changed) => {
  if (changed.has('filters')) refreshFilters(true);
  if (changed.has('sel')) {
    globe?.setSelected(s.sel);
    inspector.renderList(remaining, COMBOS.length);
    const c = selectedCombo();
    if (c) courses?.focusOnFlows(c);
  }
  if (['sel', 'picks', 'core', 'example', 'filters', 'ects'].some(k => changed.has(k as keyof typeof s))) {
    inspector.renderSelection();
    if (s.view === 'plan') plan.render();
  }
  if (['sel', 'picks', 'core', 'ects', 'hover'].some(k => changed.has(k as keyof typeof s))) updateCourses();
  if (changed.has('view')) applyView();
  if (changed.has('hover')) globe?.setExternalHover(s.hover);
  if (!(changed.size === 1 && changed.has('hover'))) renderTopbar();
});

settings.subscribe((s, changed) => {
  globe?.applySettings(s, changed);
  courses?.applySettings(s, changed);
  if (changed.has('courseGlobe')) applyView();
  if (changed.has('colorMode')) { inspector.renderList(remaining, COMBOS.length); inspector.renderSelection(); }
  if (changed.has('colorMode') || changed.has('autoRotate')) { chrome.render(remaining); updateCourses(); }
  if (changed.has('showStats')) tickStats();
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && settingsPanel.isOpen) settingsPanel.close();
});

// first paint
prepareSaving();
refreshFilters();
inspector.renderSelection();
renderTopbar();
applyView();
globe?.setSelected(store.state.sel);
updateCourses();
if (store.state.sel && store.state.view === 'map') {
  globe?.focus(store.state.sel);
  const c = selectedCombo();
  if (c) courses?.focusOnFlows(c);
}

// status bar: cheap DOM refresh twice a second, no GPU work
function tickStats() {
  chrome.renderStats(globe?.stats() ?? null, settings.state.courseGlobe ? courses?.stats() ?? null : null);
}
tickStats();
setInterval(tickStats, 500);
