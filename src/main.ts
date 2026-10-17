import './styles/tokens.css';
import './styles/base.css';
import './styles/shell.css';
import './styles/panels.css';
import './styles/viewport.css';
import './styles/plan.css';
import './styles/settings.css';
import './styles/touch.css';

import { CATEGORIES, COURSES, type CatId, type FlowId } from './data/catalog';
import { BUILTIN_ECTS, CONFIDENCE_TEXT, confidenceOf, ectsOf, ectsOrigin, fmtEcts, sumEcts } from './data/ects';
import { ELEC_DRAWING } from './data/rules';
import {
  COMBOS, COMBO_BY_KEY, filterCombos, flowStats, matches, setEctsLookup, type Combo, type FlowState,
} from './domain/combos';
import { COURSE_IDS, courseStates, IN_PLAN, STATE_TEXT } from './domain/courses';
import { ectsMidSpread, ectsSpread, ectsTable, planEcts, type ComboEcts } from './domain/ectsRange';
import { allocate, checks, rejectPick } from './domain/plan';
import { datedName, prepareSaving, saveFile, type SaveOutcome } from './io/save';
import { planLink, readPlanHash, shareBase } from './io/share';
import { ectsTemplateCsv, exportJson, parseImport } from './io/transfer';
import { ComboGlobe } from './render/ComboGlobe';
import { CourseGlobe } from './render/CourseGlobe';
import type { CardAction } from './render/SphereView';
import { appStore as store, type View } from './state/app-state';
import { settingsStore as settings, type Settings } from './state/settings';
import { applyTheme, printColors, watchScheme } from './ui/applyTheme';
import { $, esc, on } from './ui/dom';
import { FileMenu, type FileAction } from './ui/FileMenu';
import { FiltersPanel } from './ui/FiltersPanel';
import { comboTip, setEctsInfo } from './ui/format';
import { Inspector } from './ui/Inspector';
import { PlanView } from './ui/PlanView';
import { SettingsPanel } from './ui/SettingsPanel';
import { SpherePager } from './ui/SpherePager';
import { courseStrip, selStrip } from './ui/Strips';
import { Toast } from './ui/Toast';
import { MODE_HELP, MODE_TEXT, TouchDock } from './ui/TouchDock';
import { ViewportChrome } from './ui/ViewportChrome';

// theme first: the spheres read their colours from the page when they start
applyTheme(settings.state);
watchScheme(() => settings.state);

const app = $('#app');
const toast = new Toast($('#toast'));

/* ------------------------------------------------------------------ shared plan link (#s=…&p=…&c=…) */
const shared = readPlanHash(location.hash);
if (shared) {
  store.update(['sel', 'picks', 'core', 'example', 'view'], s => {
    s.sel = shared.sel;
    s.picks[shared.sel] = shared.picks;
    if (shared.core) s.core = shared.core;
    s.example = false;
    s.view = 'map';
  });
  try { history.replaceState(null, '', location.pathname + location.search); } catch { /* sandboxed */ }
}

/* ------------------------------------------------------------------ ECTS per combination */
let ectsT: ReadonlyMap<string, ComboEcts | null> = new Map();
let spread: [number, number] = [0, 0];
/** colour scale of the ECTS mode: the spread of the middles of the ranges */
let scale: [number, number] = [0, 0];
const rangeOf = (key: string) => { const e = ectsT.get(key); return e ? { min: e.min.total, max: e.max.total } : null; };
function recomputeEcts() {
  ectsT = ectsTable(store.state.ects, store.state.core);
  spread = ectsSpread(ectsT);
  scale = ectsMidSpread(ectsT);
  setEctsLookup(rangeOf);
  setEctsInfo({ of: rangeOf, spread: scale });
}
recomputeEcts();

let remaining: Combo[] = filterCombos(store.state.filters);
let globe: ComboGlobe | null = null;
let courses: CourseGlobe | null = null;
/** combination under the pointer / on an open card of sphere 1 (previewed on sphere 2 and in the strip) */
let globeHoverKey: string | null = null;
/** course states currently shown on sphere 2 (for its tooltips) */
let lastStates = courseStates(null, null, [], store.state.core);
let lastPreview: Combo | null = null;

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
  canShare: () => shareBase() !== null,
  async share() {
    const c = selectedCombo();
    if (!c) return;
    const url = planLink({ sel: c.key, picks: store.state.picks[c.key] ?? [], core: store.state.core });
    if (!url) { toast.show('Η κοινοποίηση με σύνδεσμο δουλεύει στη δημοσιευμένη σελίδα της εφαρμογής.'); return; }
    const title = `Πλάνο ${c.label} · Χάρτης Ροών ΣΗΜΜΥ`;
    try {
      if (navigator.share && matchMedia('(pointer: coarse)').matches) { await navigator.share({ title, url }); return; }
    } catch (err) { if ((err as Error)?.name === 'AbortError') return; }
    try { await navigator.clipboard.writeText(url); toast.show('Ο σύνδεσμος του πλάνου αντιγράφηκε. Όποιος τον ανοίξει βλέπει το ίδιο πλάνο.'); }
    catch { toast.show(url, 9000); }
  },
};

/* ------------------------------------------------------------------ panels */
const filters = new FiltersPanel($('#filters'), store, actions);
const inspector = new Inspector($('#inspector'), store, settings, {
  select: k => actions.select(k),
  openPlan: () => actions.setView('plan'),
  focus: k => globe?.focus(k),
  share: () => void actions.share(),
  canShare: actions.canShare,
}, rangeOf);
const plan = new PlanView($('#viewPlan'), store, toast, {
  backToMap: () => actions.setView('map'),
  togglePick: id => actions.togglePick(id),
  file: a => actions.file(a),
  share: () => void actions.share(),
  canShare: actions.canShare,
  ectsOf: rangeOf,
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
  () => scale,
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

const paperCss = () => { const [r, g, b] = paperRgb(); return `rgb(${r}, ${g}, ${b})`; };

async function makePdf() {
  const c = selectedCombo();
  if (!c) { toast.show('Διάλεξε πρώτα έναν συνδυασμό για να βγει αναφορά.'); return; }
  toast.show('Ετοιμάζεται η αναφορά PDF…', 8000);
  try {
    const { buildReport } = await import('./io/report');
    const picks = store.state.picks[c.key] ?? [];
    const a = allocate(c, picks);
    const usable = (s: ReturnType<ComboGlobe['snapshot']>) => (s && s.width > 80 && s.height > 80 ? s : null);
    const blob = await buildReport({
      combo: c, alloc: a, checks: checks(c, a), core: store.state.core, ects: store.state.ects,
      range: rangeOf(c.key),
      link: planLink({ sel: c.key, picks, core: store.state.core }),
      colors: printColors(settings.state),
      combosImage: usable(globe?.snapshot(paperCss()) ?? null),
      coursesImage: settings.state.courseGlobe ? usable(courses?.snapshot(paperCss()) ?? null) : null,
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
    void reportSave(saveFile('ects-protypo.csv', blob), 'Το πρότυπο ECTS αποθηκεύτηκε. Άλλαξε τη στήλη ects όπου χρειάζεται και φόρτωσέ το.');
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
      toast.show(`Φορτώθηκε το «${file.name}»: ${label}, ${r.picks} επιλογές μαθημάτων${r.ects ? `, ${r.ects} δικές σου τιμές ECTS` : ''}.`, 5000);
      if (r.state.sel) setTimeout(() => globe?.focus(r.state.sel!), 50);
    } else {
      // keep only values that differ from the shipped ones, so an unchanged template changes nothing
      const next = { ...store.state.ects };
      let changedN = 0;
      for (const [id, v] of Object.entries(r.ects)) {
        if (BUILTIN_ECTS[id] === v) { if (id in next) { delete next[id]; changedN++; } continue; }
        if (next[id] !== v) changedN++;
        next[id] = v;
      }
      store.update(['ects'], s => { s.ects = next; });
      toast.show(`Διαβάστηκαν ECTS για ${r.count} μαθήματα· ${changedN ? `${changedN} αλλαγές σε σχέση με πριν` : 'καμία αλλαγή'}${r.skipped ? `, ${r.skipped} γραμμές αγνοήθηκαν` : ''}.`, 5000);
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

const FLOW_ACTS: [FlowState | 'clear', string][] = [['F', 'Πλήρης'], ['H', 'Μισή'], ['X', 'Όχι'], ['clear', 'Χωρίς φίλτρο']];

try {
  globe = new ComboGlobe(
    { host: $('#stage1'), glLayer: $('#glLayer'), labelsLayer: $('#labelsLayer'), tip: $('#tip'), msg: $('#vpMsg') },
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
        return `<b>Ροή ${f}</b>${esc(CATEGORIES[f].name)}${pole}<span class="tip-rule">Στους ${remaining.length} που απομένουν: πλήρης σε ${full}, μισή σε ${half}.</span><em>Κλικ: πλήρης → μισή → όχι.</em>`;
      },
      pointActions: key => (key === store.state.sel
        ? [{ id: 'plan', label: 'Πλάνο μαθημάτων', primary: true }, { id: 'courses', label: 'Μαθήματα' }]
        : [{ id: 'select', label: 'Επιλογή', primary: true }]),
      onPointAction: (key, act) => {
        if (act === 'select') { actions.select(key, false); return true; }
        if (act === 'plan') { actions.setView('plan'); return false; }
        if (act === 'courses') { showSphere(1); return false; }
        return false;
      },
      anchorActions: f => {
        const cur = store.state.filters.flows[f] ?? null;
        return FLOW_ACTS.map(([st, label]): CardAction => ({ id: st, label, pressed: st === 'clear' ? undefined : cur === st }));
      },
      onAnchorAction: (f, act) => {
        actions.setFlow(f, act === 'clear' ? null : act as FlowState);
        return true;
      },
      ects: rangeOf,
      ectsSpread: () => scale,
    },
  );
} catch (err) { console.error(err); failMsg($('#vpMsg')); }

try {
  courses = new CourseGlobe(
    { host: $('#stage2'), glLayer: $('#glLayer2'), labelsLayer: $('#labelsLayer2'), tip: $('#tip2'), msg: $('#vpMsg2') },
    settings.state,
    {
      onPick: id => actions.togglePick(id),
      onAnchorClick: () => { /* the tooltip says what the group is */ },
      describe: id => {
        const co = COURSES[id];
        const st = lastStates.get(id) ?? 'idle';
        const e = ectsOf(id, store.state.ects);
        const origin = ectsOrigin(id, store.state.ects);
        const conf = origin === 'user' ? 'δική σου τιμή' : CONFIDENCE_TEXT[confidenceOf(id)];
        const action = !selectedCombo() ? '' : IN_PLAN.has(st) ? (st === 'req' || st === 'core' ? '' : 'Κλικ: αφαίρεση από το πλάνο') : st === 'na' ? '' : 'Κλικ: προσθήκη στο πλάνο';
        return `<b>${esc(co.name)}</b>${esc(co.code)} · ${co.sem}ο εξάμηνο · ${esc(co.cat)} ${esc(CATEGORIES[co.cat].name)}`
          + `<span class="tip-rule">${esc(STATE_TEXT[st])}</span>`
          + `<span class="tip-rule">${e === null ? 'ECTS: χωρίς τιμή' : `${fmtEcts(e)} ECTS`} · ${esc(conf)}</span>${action ? `<em>${action}</em>` : ''}`;
      },
      describeAnchor: (cat: CatId) => {
        const ids = CATEGORIES[cat].ids;
        const inPlan = ids.filter(id => IN_PLAN.has(lastStates.get(id) ?? 'idle')).length;
        return `<b>${esc(cat)} · ${esc(CATEGORIES[cat].name)}</b>${ids.length} μαθήματα, ${inPlan} στο πλάνο<em>Μέσα το 6ο εξάμηνο, έξω το 9ο.</em>`;
      },
      pointActions: id => {
        const st = lastStates.get(id) ?? 'idle';
        if (!selectedCombo() || lastPreview || st === 'req' || st === 'core' || st === 'na') return [];
        return IN_PLAN.has(st) ? [{ id: 'toggle', label: 'Αφαίρεση από το πλάνο' }] : [{ id: 'toggle', label: 'Προσθήκη στο πλάνο', primary: true }];
      },
      onPointAction: (id, act) => { if (act === 'toggle') actions.togglePick(id); return true; },
    },
  );
} catch (err) { console.error(err); failMsg($('#vpMsg2')); }

/** sphere 2 and the strips follow the combination under the pointer / on a card (preview), or the selected one */
function updateCourses() {
  const previewKey = globeHoverKey ?? store.state.hover.key;
  const preview = previewKey && previewKey !== store.state.sel ? COMBO_BY_KEY.get(previewKey) ?? null : null;
  lastPreview = preview;
  const c = preview ?? selectedCombo();
  const picks = c ? store.state.picks[c.key] ?? [] : [];
  const a = c ? allocate(c, picks) : null;
  lastStates = courseStates(c, a, picks, store.state.core);
  courses?.setPlan(c, lastStates);
  const inPlan = COURSE_IDS.filter(id => IN_PLAN.has(lastStates.get(id)!));
  const e = sumEcts(inPlan, store.state.ects);
  chrome.renderCourses(c, Boolean(preview), inPlan.length, 25, e);
  renderStrips(c, a, Boolean(preview), inPlan.length, e);
}

function renderStrips(c: Combo | null, a: ReturnType<typeof allocate> | null, preview: boolean, inPlan: number, e: { total: number; unknown: number }) {
  const pe = c && a ? planEcts(a, store.state.core, store.state.ects).spec : null;
  $('#selStrip').innerHTML = selStrip({
    combo: c, preview, total: a?.total ?? 0, valid: Boolean(c && a && checks(c, a).every(x => x.ok)),
    ects: c ? rangeOf(c.key) : null, planEcts: pe, canShare: actions.canShare(), mode: settings.state.colorMode,
  });
  $('#courseStrip').innerHTML = courseStrip(c, preview, inPlan, e);
}

on($('#spheres'), 'click', '[data-strip]', el => {
  const what = el.dataset.strip;
  const c = lastPreview ?? selectedCombo();
  if (what === 'plan') actions.setView('plan');
  else if (what === 'focus' && c) { globe?.focus(c.key); courses?.focusOnFlows(c); }
  else if (what === 'select' && c) { actions.select(c.key); globe?.closeCard(); }
  else if (what === 'share') void actions.share();
  else if (what === 'next') showSphere(1);
  else if (what === 'prev') showSphere(0);
});

/* ------------------------------------------------------------------ phone layout: pager, touch dock */
const narrowMq = matchMedia('(max-width: 980px)');
const coarseMq = matchMedia('(pointer: coarse)');
const pagerOn = () => narrowMq.matches && settings.state.phoneLayout === 'side' && settings.state.courseGlobe;
const pager = new SpherePager($('#spheres'), $('#sphereTrack'), $('#sphereTabs'), $('#pagerHint'), pagerOn, () => {
  globe?.closeCard(); courses?.closeCard(); renderDockTitle();
});

/** bring sphere `n` (0 = combinations, 1 = courses) into view */
function showSphere(n: 0 | 1) {
  if (n === 1 && !settings.state.courseGlobe) return;
  if (pager.active) { pager.go(n); return; }
  $(n === 0 ? '#viewport' : '#viewport2').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  currentSphere = n;
}

/** which sphere the dock acts on: the pager page, or the one most on screen */
let currentSphere: 0 | 1 = 0;
const vis = { 0: 0, 1: 0 };
const sphereObserver = new IntersectionObserver(es => {
  for (const e of es) vis[e.target.id === 'viewport' ? 0 : 1] = e.isIntersecting ? e.intersectionRatio : 0;
  if (!pager.active) currentSphere = vis[1] > vis[0] ? 1 : 0;
  syncDock();
}, { threshold: [0, 0.15, 0.3, 0.5, 0.75, 1] });
sphereObserver.observe($('#viewport'));
sphereObserver.observe($('#viewport2'));

let lastFocus = { at: 0, which: -1 };
const dock = new TouchDock($('#dock'), $<HTMLButtonElement>('#dockHandle'), settings, {
  switchSphere: () => showSphere(activeSphere() === 0 ? 1 : 0),
  switchLabel: () => (activeSphere() === 0 ? 'Πήγαινε στη σφαίρα μαθημάτων' : 'Πήγαινε στη σφαίρα συνδυασμών'),
  focus: () => {
    const which = activeSphere();
    const c = selectedCombo();
    const again = lastFocus.which === which && performance.now() - lastFocus.at < 5000;
    lastFocus = { at: performance.now(), which };
    if (!c || again) { (which === 0 ? globe : courses)?.resetView(); lastFocus.which = -1; return; }
    if (which === 0) globe?.focus(c.key); else courses?.focusOnFlows(c);
  },
});
const activeSphere = (): 0 | 1 => (pager.active ? (pager.page as 0 | 1) : currentSphere);
const renderDockTitle = () => dock.render();

const touchOn = () => settings.state.touchDock === 'on' || (settings.state.touchDock === 'auto' && coarseMq.matches);

function syncDock() {
  const anyVisible = vis[0] > 0.15 || (settings.state.courseGlobe && vis[1] > 0.15);
  const show = touchOn() && store.state.view === 'map' && anyVisible;
  dock.setShown(show);
  app.dataset.dock = show && !settings.state.dockHidden ? settings.state.dockSide : 'off';
  if (show) placeDock();
}

/** keep the dock over the spheres: on wide layouts they sit between the side panels */
function placeDock() {
  const els = [$('#viewport'), ...(settings.state.courseGlobe ? [$('#viewport2')] : [])];
  let l = Infinity, r = -Infinity;
  for (const el of els) { const b = el.getBoundingClientRect(); if (b.width) { l = Math.min(l, b.left); r = Math.max(r, b.right); } }
  if (!Number.isFinite(l)) return;
  const inset = 8;
  for (const el of [$('#dock'), $('#dockHandle')]) {
    const pad = el.id === 'dock' ? inset : 0;
    el.style.right = settings.state.dockSide === 'right' ? `max(${Math.max(0, innerWidth - r) + pad}px, env(safe-area-inset-right, 0px))` : '';
    el.style.left = settings.state.dockSide === 'left' ? `max(${Math.max(0, l) + pad}px, env(safe-area-inset-left, 0px))` : '';
  }
}
addEventListener('resize', () => { if (!$('#dock').hidden || !$('#dockHandle').hidden) placeDock(); });

function applyTouch() {
  const t = touchOn();
  app.dataset.touch = t ? 'on' : 'off';
  const mode = t ? settings.state.touchMode : 'rotate';
  globe?.setTouchMode(mode);
  courses?.setTouchMode(mode);
  for (const vp of [$('#viewport'), $('#viewport2')]) {
    const badge = vp.querySelector<HTMLElement>('.vp-mode')!;
    if (t && mode !== 'rotate') { vp.dataset.mode = mode; badge.hidden = false; badge.textContent = `${MODE_TEXT[mode]} · ${mode === 'scroll' ? 'η σφαίρα δεν γυρίζει' : 'σύρε το δάχτυλο'}`; }
    else { delete vp.dataset.mode; badge.hidden = true; }
  }
  dock.render();
  syncDock();
}

function applyLayout() {
  app.dataset.pager = pagerOn() ? 'on' : 'off';
  app.dataset.phone = settings.state.phoneLayout;
  pager.refresh();
  if (pagerOn() && store.state.view === 'map') pager.maybeShowHint();
}
narrowMq.addEventListener('change', applyLayout);
coarseMq.addEventListener('change', applyTouch);

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
  $('#coursePage').hidden = !settings.state.courseGlobe;
  globe?.setViewVisible(v === 'map');
  courses?.setViewVisible(v === 'map' && settings.state.courseGlobe);
  if (v === 'plan') { plan.render(); $('#viewPlan').scrollTop = 0; }
  applyLayout();
  syncDock();
}

/* ------------------------------------------------------------------ wiring */
function refreshFilters(fromUser = false) {
  filters.spread = spread;
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
  if (changed.has('ects') || changed.has('core')) {
    recomputeEcts();
    if (settings.state.colorMode === 'ects') globe?.refreshColors();
    refreshFilters();
  }
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
  if (['theme', 'scheme', 'colorsLight', 'colorsDark'].some(k => changed.has(k as keyof Settings))) applyTheme(s);
  globe?.applySettings(s, changed);
  courses?.applySettings(s, changed);
  if (changed.has('courseGlobe')) applyView();
  if (changed.has('phoneLayout')) applyLayout();
  if (['touchDock', 'touchMode', 'dockSide', 'dockHidden'].some(k => changed.has(k as keyof Settings))) {
    applyTouch();
    if (changed.has('touchMode') && touchOn()) toast.show(`${MODE_TEXT[s.touchMode]}: ${MODE_HELP[s.touchMode]}`, 2600);
  }
  if (changed.has('colorMode')) { inspector.renderList(remaining, COMBOS.length); inspector.renderSelection(); }
  if (changed.has('colorMode') || changed.has('autoRotate')) { chrome.render(remaining); updateCourses(); }
  if (changed.has('showStats')) tickStats();
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && settingsPanel.isOpen) settingsPanel.close();
  if (e.key === 'Escape') { globe?.closeCard(); courses?.closeCard(); }
});

// first paint
prepareSaving();
refreshFilters();
inspector.renderSelection();
renderTopbar();
applyView();
applyTouch();
globe?.setSelected(store.state.sel);
updateCourses();
if (store.state.sel && store.state.view === 'map') {
  globe?.focus(store.state.sel);
  const c = selectedCombo();
  if (c) courses?.focusOnFlows(c);
}
if (shared) toast.show(`Άνοιξε το πλάνο από σύνδεσμο: ${COMBO_BY_KEY.get(shared.sel)!.label}, ${shared.picks.length} επιλογές μαθημάτων.`, 5000);

// status bar: cheap DOM refresh twice a second, no GPU work
function tickStats() {
  chrome.renderStats(globe?.stats() ?? null, settings.state.courseGlobe ? courses?.stats() ?? null : null);
}
tickStats();
setInterval(tickStats, 500);
