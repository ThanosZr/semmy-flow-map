import { COURSES } from '../data/catalog';
import { CORE_CHOICES, DIR, FLOW_ORDER, SHAPES, type CoreChoice, type DirId, type ShapeId } from '../data/rules';
import { COMBO_BY_KEY, emptyFilters, type Filters, type FlowState } from '../domain/combos';
import { debounce, storage, Store } from './store';

export type View = 'map' | 'plan';

export interface AppState {
  filters: Filters;
  /** selected combination key */
  sel: string | null;
  /** picked courses per combination key, in pick order */
  picks: Record<string, string[]>;
  core: CoreChoice;
  /** true while the shipped example plan is untouched */
  example: boolean;
  view: View;
  /** ECTS per course id loaded by the user from a file; they override the shipped values */
  ects: Record<string, number>;
  /** transient hover links between panels and the globes (not persisted) */
  hover: { key: string | null; flow: string | null; dir: string | null };
}

/** The part of the state that is saved and exported. */
export type SavedState = Omit<AppState, 'hover'>;

const KEY = 'semmy-flow-map/state/v2';
export const EXAMPLE_KEY = 'PL-ΥΛΣ';
const EXAMPLE_PICKS = [
  '3213', '3207', '3257', '3377',                            // Υ: group pick + 3 electives
  '3061', '3123', '3287', '3105', '3186', '3254', '3327',    // Λ: 4 of 5 + 3 electives
  '3333', '3372', '3208', '3279',                            // Σ: group pick + 3 electives
  '3294', '3298',                                            // free
];

const noHover = () => ({ key: null, flow: null, dir: null });

export function defaultState(): AppState {
  return {
    filters: emptyFilters(), sel: EXAMPLE_KEY, picks: { [EXAMPLE_KEY]: EXAMPLE_PICKS.slice() },
    core: '3403', example: true, view: 'map', ects: {}, hover: noHover(),
  };
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

export function sanitizeEcts(v: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!isObj(v)) return out;
  for (const [id, n] of Object.entries(v)) if (COURSES[id] && typeof n === 'number' && n > 0 && n <= 60) out[id] = n;
  return out;
}

/** Accepts anything (localStorage, an imported file) and returns a valid state. Unknown values fall back to defaults. */
export function sanitizeState(raw: unknown): AppState {
  const d = defaultState();
  if (!isObj(raw)) return d;
  const f = isObj(raw.filters) ? raw.filters : {};
  const flows: Filters['flows'] = {};
  if (isObj(f.flows)) {
    for (const [k, v] of Object.entries(f.flows)) {
      if ((FLOW_ORDER as readonly string[]).includes(k) && (v === 'F' || v === 'H' || v === 'X')) flows[k as keyof Filters['flows']] = v as FlowState;
    }
  }
  const range = Array.isArray(f.ects) && f.ects.length === 2 && f.ects.every(v => typeof v === 'number' && v >= 0 && v <= 400) && f.ects[0] <= f.ects[1]
    ? [f.ects[0], f.ects[1]] as [number, number] : null;
  const filters: Filters = {
    ...emptyFilters(),
    dir: typeof f.dir === 'string' && f.dir in DIR ? (f.dir as DirId) : null,
    shape: typeof f.shape === 'string' && f.shape in SHAPES ? (f.shape as ShapeId) : null,
    flows,
    ects: range,
  };
  const picks: Record<string, string[]> = {};
  if (isObj(raw.picks)) {
    for (const [k, v] of Object.entries(raw.picks)) {
      if (COMBO_BY_KEY.has(k) && Array.isArray(v)) picks[k] = [...new Set(v.filter((id): id is string => typeof id === 'string' && Boolean(COURSES[id])))];
    }
  }
  const sel = typeof raw.sel === 'string' && COMBO_BY_KEY.has(raw.sel) ? raw.sel : null;
  return {
    filters, sel, picks,
    core: CORE_CHOICES.includes(raw.core as CoreChoice) ? (raw.core as CoreChoice) : d.core,
    example: raw.example === true,
    view: raw.view === 'plan' ? 'plan' : 'map',
    ects: sanitizeEcts(raw.ects),
    hover: noHover(),
  };
}

export function savedState(s: AppState): SavedState {
  const { hover: _hover, ...rest } = s;
  return rest;
}

function load(): AppState {
  const s = storage.read<unknown>(KEY);
  return s ? sanitizeState(s) : defaultState();
}

const save = debounce((s: AppState) => storage.write(KEY, savedState(s)), 250);

export const appStore = new Store<AppState>(load(), save);
