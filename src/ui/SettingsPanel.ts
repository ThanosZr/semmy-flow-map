/**
 * Settings sheet. Every change applies immediately and is remembered on this device.
 */
import { COLOR_GROUPS, PRESETS, THEME_IDS, resolveTheme, type BaseKey, type ThemeId } from '../data/themes';
import { DEFAULT_SETTINGS, RANGES, pixelRatioFor, type SchemePref, type Settings } from '../state/settings';
import type { Store } from '../state/store';
import { currentScheme, swatches } from './applyTheme';
import { esc, on, render } from './dom';

type Opt<V> = { value: V; label: string };
type Field =
  | { kind: 'select'; key: keyof Settings; label: string; help?: string; options: Opt<Settings[keyof Settings]>[] }
  | { kind: 'switch'; key: keyof Settings; label: string; help?: string }
  | { kind: 'range'; key: keyof typeof RANGES; label: string; help?: string; format: (v: number) => string };

const dprNow = () => (typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1);

const GROUPS: { title: string; note?: () => string; fields: Field[] }[] = [
  {
    title: 'Αφή και κινητό',
    note: () => 'Σε οθόνες αφής, ένα πλωτό μενού δίπλα στις σφαίρες αλλάζει τι κάνει το δάχτυλο: περιστροφή, κύλιση σελίδας ή εξερεύνηση.',
    fields: [
      {
        kind: 'select', key: 'touchDock', label: 'Πλωτό μενού σφαιρών',
        options: [{ value: 'auto', label: 'Αυτόματα σε οθόνες αφής' }, { value: 'on', label: 'Πάντα' }, { value: 'off', label: 'Ποτέ' }],
      },
      {
        kind: 'select', key: 'dockSide', label: 'Πλευρά μενού',
        options: [{ value: 'right', label: 'Δεξιά' }, { value: 'left', label: 'Αριστερά' }],
      },
      {
        kind: 'select', key: 'phoneLayout', label: 'Σφαίρες σε στενή οθόνη', help: 'Δίπλα-δίπλα: η δεύτερη σφαίρα είναι δεξιά, τη φέρνεις με σύρσιμο στη λωρίδα κάτω από τη σφαίρα, με τις καρτέλες ή με το βελάκι.',
        options: [{ value: 'side', label: 'Δίπλα-δίπλα (σύρσιμο)' }, { value: 'stack', label: 'Η μία κάτω από την άλλη' }],
      },
    ],
  },
  {
    title: 'Απόδοση γραφικών',
    note: () => `Η οθόνη σου έχει πυκνότητα ${dprNow().toFixed(2).replace(/\.?0+$/, '')}×. Η σφαίρα σχεδιάζεται μόνο όταν κάτι αλλάζει, οπότε σε ηρεμία η GPU δεν δουλεύει.`,
    fields: [
      {
        kind: 'select', key: 'resolution', label: 'Ανάλυση απόδοσης', help: 'Pixel ανά pixel οθόνης. Χαμηλότερη = λιγότερη δουλειά για την GPU.',
        options: [
          { value: 'auto', label: `Αυτόματη (έως 2×, τώρα ${pixelRatioFor('auto').toFixed(2).replace(/\.?0+$/, '')}×)` },
          { value: 'native', label: `Εγγενής (${dprNow().toFixed(2).replace(/\.?0+$/, '')}×)` },
          { value: 0.5, label: '0,5× (ελάχιστη)' }, { value: 0.75, label: '0,75×' }, { value: 1, label: '1×' },
          { value: 1.5, label: '1,5×' }, { value: 2, label: '2×' },
        ],
      },
      { kind: 'switch', key: 'msaa', label: 'Εξομάλυνση ακμών (MSAA)', help: 'Πιο καθαρές γραμμές. Η αλλαγή ξαναστήνει τον renderer.' },
      {
        kind: 'select', key: 'fpsCap', label: 'Όριο καρέ', help: 'Ισχύει μόνο όταν κάτι κινείται.',
        options: [{ value: 30, label: '30 fps' }, { value: 60, label: '60 fps' }, { value: 0, label: 'Χωρίς όριο' }],
      },
      {
        kind: 'select', key: 'gpu', label: 'Προτίμηση GPU', help: 'Σε laptop με δύο GPU, η «εξοικονόμηση» κρατά την ενσωματωμένη.',
        options: [{ value: 'low-power', label: 'Εξοικονόμηση ενέργειας' }, { value: 'default', label: 'Προεπιλογή browser' }, { value: 'high-performance', label: 'Υψηλή απόδοση' }],
      },
      {
        kind: 'select', key: 'detail', label: 'Λεπτομέρεια γεωμετρίας', help: 'Τμήματα σφαίρας, πλέγματος και τόξων.',
        options: [{ value: 'low', label: 'Χαμηλή' }, { value: 'medium', label: 'Μέση' }, { value: 'high', label: 'Υψηλή' }],
      },
      { kind: 'switch', key: 'showStats', label: 'Ένδειξη επιδόσεων', help: 'fps, draw calls και μέγεθος buffer πάνω στη σφαίρα.' },
    ],
  },
  {
    title: 'Σφαίρα',
    fields: [
      { kind: 'switch', key: 'courseGlobe', label: 'Δεύτερη σφαίρα: μαθήματα', help: 'Δίπλα στους συνδυασμούς, τα μαθήματα του επιλεγμένου συνδυασμού. Κλειστή = δεν σχεδιάζεται καθόλου.' },
      { kind: 'switch', key: 'autoRotate', label: 'Αυτόματη περιστροφή', help: 'Σταματά όταν ο δείκτης είναι πάνω στη σφαίρα.' },
      { kind: 'range', key: 'rotateSpeed', label: 'Ταχύτητα περιστροφής', format: v => `${Math.round(60 / v)} δ/γύρο` },
      { kind: 'switch', key: 'autoFocus', label: 'Στροφή προς τα αποτελέσματα', help: 'Μετά από κάθε φίλτρο η κάμερα γυρίζει προς τους συνδυασμούς που απομένουν.' },
      { kind: 'switch', key: 'transitions', label: 'Κινούμενες μεταβάσεις' },
      { kind: 'range', key: 'pointSize', label: 'Μέγεθος σημείων', format: v => `${v.toFixed(1)} px` },
      { kind: 'range', key: 'offOpacity', label: 'Ορατότητα απορριφθέντων', format: v => `${Math.round(v * 100)}%` },
      { kind: 'range', key: 'backOpacity', label: 'Ορατότητα πίσω όψης', format: v => `${Math.round(v * 100)}%` },
      {
        kind: 'select', key: 'colorMode', label: 'Χρωματισμός σημείων',
        options: [{ value: 'direction', label: 'Κατά κατεύθυνση' }, { value: 'shape', label: 'Κατά σχήμα συνδυασμού' }, { value: 'ects', label: 'Κατά ECTS εμβάθυνσης' }],
      },
      { kind: 'switch', key: 'showGrid', label: 'Πλέγμα μεσημβρινών' },
      { kind: 'switch', key: 'showLinks', label: 'Γραμμές προς τις ροές' },
      { kind: 'switch', key: 'showLabels', label: 'Ετικέτες ροών' },
    ],
  },
  {
    title: 'Διάταξη',
    note: () => 'Κάθε συνδυασμός τοποθετείται στο κέντρο βάρους των ροών του. Οι αλλαγές ξανατρέχουν τη διάταξη.',
    fields: [
      { kind: 'range', key: 'halfWeight', label: 'Βάρος μισής ροής', help: 'Πόσο τραβά μια μισή ροή σε σχέση με μια πλήρη.', format: v => v.toFixed(2) },
      { kind: 'range', key: 'polePull', label: 'Έλξη πόλων Ο / Ι', help: 'Οι Ο και Ι μπαίνουν σε κάθε κατεύθυνση μόνο ως συμπληρωματικές ροές και βρίσκονται στους πόλους. Με 1× οι συνδυασμοί τους μένουν κοντά στον ισημερινό.', format: v => `${v.toFixed(2).replace(/\.?0+$/, '')}×` },
      { kind: 'range', key: 'spacing', label: 'Ελάχιστη απόσταση σημείων', format: v => `${(Math.asin(v / 2) * 2 * 180 / Math.PI).toFixed(1)}°` },
    ],
  },
];

export class SettingsPanel {
  private lastFocus: HTMLElement | null = null;
  private colorsOpen = false;

  constructor(private root: HTMLElement, private store: Store<Settings>) {
    on(root, 'change', 'select[data-key]', el => {
      const key = el.dataset.key as keyof Settings;
      const raw = (el as HTMLSelectElement).value;
      const value = /^-?\d+(\.\d+)?$/.test(raw) ? Number(raw) : raw;
      store.update([key], s => { (s as unknown as Record<string, unknown>)[key] = value; });
    });
    on(root, 'click', 'button[role="switch"]', el => {
      const key = el.dataset.key as keyof Settings;
      store.update([key], s => { (s as unknown as Record<string, boolean>)[key] = !s[key]; });
    });
    on(root, 'input', 'input[type="range"]', el => {
      const key = el.dataset.key as keyof Settings;
      const v = Number((el as HTMLInputElement).value);
      store.update([key], s => { (s as unknown as Record<string, number>)[key] = v; });
      const out = root.querySelector<HTMLOutputElement>(`output[data-for="${key}"]`);
      const f = GROUPS.flatMap(g => g.fields).find(x => x.key === key);
      if (out && f?.kind === 'range') out.textContent = f.format(v);
    });
    on(root, 'click', '[data-theme-id]', el => store.update(['theme'], d => { d.theme = el.dataset.themeId as ThemeId; }));
    on(root, 'click', '[data-scheme]', el => store.update(['scheme'], d => { d.scheme = el.dataset.scheme as SchemePref; }));
    on(root, 'input', 'input[data-color]', el => this.setColor(el.dataset.color as BaseKey, (el as HTMLInputElement).value));
    on(root, 'change', 'input[data-color]', () => this.render());
    on(root, 'click', '[data-color-reset]', el => this.setColor(el.dataset.colorReset as BaseKey, null, true));
    on(root, 'click', '[data-action="colors-reset"]', () => {
      const key = currentScheme(store.state) === 'dark' ? 'colorsDark' : 'colorsLight';
      store.update([key], d => { d[key] = {}; });
    });
    root.addEventListener('toggle', ev => { if ((ev.target as HTMLElement).classList?.contains('colors')) this.colorsOpen = (ev.target as HTMLDetailsElement).open; }, true);
    on(root, 'click', '[data-action="defaults"]', () => {
      store.update(Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[], s => Object.assign(s, DEFAULT_SETTINGS, { colorsLight: {}, colorsDark: {} }));
      this.render();
    });
    on(root, 'click', '[data-action="close"]', () => this.close());
    root.addEventListener('keydown', e => { if (e.key === 'Escape') this.close(); });
    root.addEventListener('click', e => { if (e.target === root) this.close(); });
    // ranges and colour pickers update their own output while dragging; re-rendering would close the picker
    store.subscribe((_, changed) => {
      if (this.root.hidden) return;
      if ([...changed].some(k => !(k in RANGES) && k !== 'colorsLight' && k !== 'colorsDark')) this.render();
    });
  }

  get isOpen(): boolean { return !this.root.hidden; }

  open(): void {
    this.lastFocus = document.activeElement as HTMLElement | null;
    this.render();
    this.root.hidden = false;
    this.root.querySelector<HTMLElement>('[data-action="close"]')?.focus();
  }

  close(): void {
    if (this.root.hidden) return;
    this.root.hidden = true;
    this.lastFocus?.focus?.();
  }

  toggle(): void { this.isOpen ? this.close() : this.open(); }

  /** override one base colour of the scheme in effect (null = back to the preset) */
  private setColor(key: BaseKey, value: string | null, rerender = false): void {
    const k = currentScheme(this.store.state) === 'dark' ? 'colorsDark' : 'colorsLight';
    this.store.update([k], d => {
      const next = { ...d[k] };
      if (value) next[key] = value.toUpperCase(); else delete next[key];
      d[k] = next;
    });
    if (rerender) queueMicrotask(() => this.render());
  }

  private appearance(): string {
    const s = this.store.state;
    const scheme = currentScheme(s);
    const overrides = scheme === 'dark' ? s.colorsDark : s.colorsLight;
    const t = resolveTheme(s.theme, scheme, overrides);
    const cards = THEME_IDS.map(id => {
      const p = PRESETS[id];
      const sw = swatches(id, scheme);
      return `<button type="button" class="theme-card" data-theme-id="${id}" data-focus-key="theme-${id}" aria-pressed="${s.theme === id}" style="--bg:${sw[0]};--fg:${sw[1]}">
        <span class="tc-sw" aria-hidden="true">${sw.slice(2).map(c => `<i style="background:${c}"></i>`).join('')}</span>
        <b>${esc(p.name)}</b><span class="tc-note">${esc(p.note)}</span></button>`;
    }).join('');
    const schemes: [SchemePref, string][] = [['auto', 'Αυτόματα'], ['light', 'Φωτεινό'], ['dark', 'Σκούρο']];
    const n = Object.keys(overrides).length;
    const groups = COLOR_GROUPS.map(g => `<p class="cg-title">${esc(g.title)}</p>${g.keys.map(({ key, label }) => {
      const id = `col-${key}`;
      return `<div class="crow"><input type="color" id="${id}" data-color="${key}" data-focus-key="${id}" value="${t.base[key].toLowerCase()}">
        <label for="${id}">${esc(label)}</label>${overrides[key] ? `<button type="button" class="linkbtn" data-color-reset="${key}" data-focus-key="${id}-r" title="Πίσω στο χρώμα του θέματος">επαναφορά</button>` : ''}</div>`;
    }).join('')}`).join('');
    return `<section class="sgroup"><h3 class="label">Εμφάνιση</h3>
      <p class="note">Τα χρώματα ισχύουν παντού: στην εφαρμογή, στις δύο σφαίρες και στην αναφορά PDF (στο PDF πάντα η φωτεινή εκδοχή).</p>
      <div class="theme-grid" role="group" aria-label="Θέμα">${cards}</div>
      <div class="field"><span class="flabel" id="schemeLabel">Φωτεινό ή σκούρο</span>
        <div class="seg seg-wide" role="group" aria-labelledby="schemeLabel">${schemes.map(([v, l]) => `<button type="button" data-scheme="${v}" data-focus-key="scheme-${v}" aria-pressed="${s.scheme === v}">${l}</button>`).join('')}</div>
        <p class="help">Τώρα: ${scheme === 'dark' ? 'σκούρο' : 'φωτεινό'}${s.scheme === 'auto' ? ', όπως η συσκευή' : ''}.</p></div>
      <details class="colors" ${this.colorsOpen ? 'open' : ''}><summary>Δικά σου χρώματα <span class="muted">για το ${scheme === 'dark' ? 'σκούρο' : 'φωτεινό'}${n ? ` · ${n} αλλαγμένα` : ''}</span></summary>
        <div class="cgrid">${groups}</div>
        <button type="button" class="btn" data-action="colors-reset" ${n ? '' : 'disabled'}>Επαναφορά χρωμάτων του θέματος</button>
      </details></section>`;
  }

  private field(f: Field): string {
    const s = this.store.state;
    const id = `set-${f.key}`;
    const help = f.help ? `<p class="help">${esc(f.help)}</p>` : '';
    if (f.kind === 'select') {
      return `<div class="field"><label for="${id}">${esc(f.label)}</label>
        <select id="${id}" data-key="${f.key}" data-focus-key="${id}">${f.options.map(o => `<option value="${esc(String(o.value))}" ${o.value === s[f.key] ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}</select>${help}</div>`;
    }
    if (f.kind === 'switch') {
      const on = Boolean(s[f.key]);
      return `<div class="field row"><span class="flabel" id="${id}-l">${esc(f.label)}</span>
        <button type="button" role="switch" id="${id}" data-key="${f.key}" data-focus-key="${id}" aria-checked="${on}" aria-labelledby="${id}-l"><span></span></button>${help}</div>`;
    }
    const r = RANGES[f.key], v = s[f.key] as number;
    return `<div class="field"><div class="frange"><label for="${id}">${esc(f.label)}</label><output data-for="${f.key}">${esc(f.format(v))}</output></div>
      <input type="range" id="${id}" data-key="${f.key}" data-focus-key="${id}" min="${r.min}" max="${r.max}" step="${r.step}" value="${v}">${help}</div>`;
  }

  render(): void {
    render(this.root, `
      <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="settingsTitle">
        <header class="sheet-head"><h2 id="settingsTitle">Ρυθμίσεις</h2>
          <button type="button" class="iconbtn" data-action="close" aria-label="Κλείσιμο ρυθμίσεων">✕</button></header>
        <div class="sheet-body">
          ${this.appearance()}
          ${GROUPS.map(g => `<section class="sgroup"><h3 class="label">${esc(g.title)}</h3>${g.note ? `<p class="note">${esc(g.note())}</p>` : ''}${g.fields.map(f => this.field(f)).join('')}</section>`).join('')}
        </div>
        <footer class="sheet-foot"><button type="button" class="btn" data-action="defaults">Επαναφορά προεπιλογών</button>
          <span class="muted">Αποθηκεύονται σε αυτή τη συσκευή.</span></footer>
      </div>`);
  }
}
