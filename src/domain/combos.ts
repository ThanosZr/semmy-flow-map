/**
 * Enumerates every allowed (direction, flow set) pair from §7.5 vii and filters them.
 */
import type { FlowId } from '../data/catalog';
import { DIRECTIONS, FLOW_ORDER, SHAPES, type DirId, type Direction, type Kind, type RuleId, type ShapeId } from '../data/rules';

export type FlowState = Kind | 'X';

export interface Combo {
  key: string;
  index: number;
  dir: DirId;
  flows: Partial<Record<FlowId, Kind>>;
  rules: RuleId[];
  shape: ShapeId;
  free: number;
  /** flows in display order: full first, the direction's own flows leading */
  order: FlowId[];
  label: string;
}

export interface Filters {
  dir: DirId | null;
  shape: ShapeId | null;
  flows: Partial<Record<FlowId, FlowState>>;
  /** ECTS of the 23 specialisation courses: keep combinations that can land inside [lo, hi] */
  ects: [number, number] | null;
}

export const emptyFilters = (): Filters => ({ dir: null, shape: null, flows: {}, ects: null });

/** ECTS bounds per combination, supplied by the app (they depend on the ECTS values in effect) */
let ectsLookup: ((key: string) => { min: number; max: number } | null) | null = null;
export function setEctsLookup(fn: typeof ectsLookup): void { ectsLookup = fn; }

function shapeOf(fl: Combo['flows']): ShapeId {
  let nf = 0, nh = 0;
  for (const k of Object.values(fl)) k === 'F' ? nf++ : nh++;
  return nf === 3 ? 'F3' : nh === 1 ? 'F2H1' : 'F2H2';
}

function enumerate(): Combo[] {
  const list: Combo[] = [];
  const byKey = new Map<string, Combo>();

  const add = (d: Direction, fl: Combo['flows'], rule: RuleId) => {
    const canon = FLOW_ORDER.filter(f => fl[f]).map(f => (fl[f] === 'H' ? '½' : '') + f).join('');
    const key = `${d.id}-${canon}`;
    const existing = byKey.get(key);
    if (existing) { if (!existing.rules.includes(rule)) existing.rules.push(rule); return; }
    const rank = (f: FlowId) => { const i = d.lead.indexOf(f); return i >= 0 ? i : 10 + FLOW_ORDER.indexOf(f); };
    const ks = Object.keys(fl) as FlowId[];
    const order = ks.filter(f => fl[f] === 'F').sort((a, b) => rank(a) - rank(b))
      .concat(ks.filter(f => fl[f] === 'H').sort((a, b) => rank(a) - rank(b)));
    const shape = shapeOf(fl);
    const c: Combo = {
      key, index: list.length, dir: d.id, flows: fl, rules: [rule], shape, free: SHAPES[shape].free, order,
      label: order.map(f => (fl[f] === 'H' ? '½' : '') + f).join(' · '),
    };
    byKey.set(key, c);
    list.push(c);
  };

  for (const d of DIRECTIONS) {
    // (α) the pair as full flows + "at least ½ other flow":
    //     1 full + 2 free, or ½ + 5 free, or 2 × ½ + 1 free. Ο and Ι are allowed here (rule v).
    for (const pair of d.a) {
      const base = () => Object.fromEntries(pair.map(f => [f, 'F'])) as Combo['flows'];
      const others = FLOW_ORDER.filter(f => !pair.includes(f));
      for (const o of others) {
        add(d, { ...base(), [o]: 'F' }, 'α');
        add(d, { ...base(), [o]: 'H' }, 'α');
      }
      for (let i = 0; i < others.length; i++)
        for (let j = i + 1; j < others.length; j++)
          add(d, { ...base(), [others[i]]: 'H', [others[j]]: 'H' }, 'α');
    }
    // (β), (γ)
    for (const [rule, x] of [['β', d.b], ['γ', d.c]] as const)
      for (const t of x.third) add(d, { [x.F]: 'F', [x.H]: 'H', [t]: 'F' }, rule);
  }
  list.forEach(c => c.rules.sort());
  return list;
}

export const COMBOS: readonly Combo[] = enumerate();
export const COMBO_BY_KEY: ReadonlyMap<string, Combo> = new Map(COMBOS.map(c => [c.key, c]));

export function matches(c: Combo, F: Filters): boolean {
  if (F.dir && c.dir !== F.dir) return false;
  if (F.shape && c.shape !== F.shape) return false;
  if (F.ects && ectsLookup) {
    const e = ectsLookup(c.key);
    if (!e || e.max < F.ects[0] || e.min > F.ects[1]) return false;
  }
  for (const f of FLOW_ORDER) {
    const s = F.flows[f];
    if (!s) continue;
    const v = c.flows[f];
    if (s === 'X') { if (v) return false; }
    else if (v !== s) return false;
  }
  return true;
}

export function filterCombos(F: Filters): Combo[] {
  return COMBOS.filter(c => matches(c, F));
}

export function countWith(F: Filters, over: Partial<Filters>): number {
  const G: Filters = { ...F, ...over };
  let n = 0;
  for (const c of COMBOS) if (matches(c, G)) n++;
  return n;
}

export function flowStats(rem: readonly Combo[], f: FlowId) {
  let full = 0, half = 0;
  for (const c of rem) { const v = c.flows[f]; if (v === 'F') full++; else if (v === 'H') half++; }
  return { full, half, out: rem.length - full - half };
}
