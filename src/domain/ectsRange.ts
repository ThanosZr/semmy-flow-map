/**
 * ECTS per combination: the fewest and the most ECTS a valid 23-course plan of that combination can collect,
 * with a plan that achieves each (so the bounds are checked against the same rules as the plan view).
 *
 * Search: every flow takes its mandatory courses, the cheapest/dearest options of its "k of n" groups and
 * then the cheapest/dearest electives; the free slots take the cheapest/dearest of everything left, with at
 * most one humanities and one "μη εντασσόμενο" course (Πρακτική on top). Rule iv (Ο/Ι) is handled exactly by
 * trying every course that can be the required mandatory-of-another-flow course.
 * Courses without a known value are left out of the choices (none of them is a fixed mandatory course).
 */
import { COURSES, type FlowId } from '../data/catalog';
import { ectsOf, sumEcts } from '../data/ects';
import { ELEC_DRAWING, FLOW_SIZE, PRAKTIKI, requirement, type CoreChoice } from '../data/rules';
import { COMBOS, type Combo } from './combos';
import { isCoreMandatory, type Allocation } from './plan';

export interface EctsBound {
  /** ECTS of the 23 specialisation courses */
  total: number;
  /** picks (excluding fixed mandatory courses) that reach it, in an order `allocate` understands */
  picks: string[];
  /** fixed courses without a known value (counted as 0) */
  unknown: number;
}
export interface ComboEcts { min: EctsBound; max: EctsBound }

type Ects = Readonly<Record<string, number>>;

const ALL_IDS = Object.keys(COURSES);

/** course ids sorted cheapest-first and dearest-first, overall and per category (only courses that can be taken) */
interface Sorted { all: string[]; cat: Map<string, string[]> }
function sortedLists(ects: Ects, sign: 1 | -1): Sorted {
  const val = (id: string) => ectsOf(id, ects)!;
  const ids = ALL_IDS.filter(id => !COURSES[id].na && ectsOf(id, ects) !== null)
    .sort((a, b) => sign * (val(b) - val(a)) || COURSES[a].code.localeCompare(COURSES[b].code));
  const cat = new Map<string, string[]>();
  for (const id of ids) { const k = COURSES[id].cat; cat.set(k, [...(cat.get(k) ?? []), id]); }
  return { all: ids, cat };
}

function bound(c: Combo, ects: Ects, core: CoreChoice, sign: 1 | -1, L: Sorted = sortedLists(ects, sign)): EctsBound | null {
  const val = (id: string) => ectsOf(id, ects);
  const rank = new Map(L.all.map((id, i) => [id, i]));
  const needsIv = Boolean(c.flows['Ο'] || c.flows['Ι']);
  const candidates: (string | null)[] = needsIv ? L.all.filter(id => isCoreMandatory(id, c)) : [null];

  let best: EctsBound | null = null;
  for (const r of candidates) {
    const used = new Set<string>([ELEC_DRAWING, core]);
    if (r) used.add(r);
    const picks: string[] = [];
    let total = 0, unknown = 0, ok = true;
    const take = (id: string) => { used.add(id); picks.push(id); total += val(id)!; };

    for (const f of c.order) {
      const kind = c.flows[f]!;
      const req = requirement(f, kind, c.dir);
      for (const id of req.fixed) { used.add(id); const v = val(id); if (v === null) unknown++; else total += v; }
      let k = 0;
      for (const g of req.groups) {
        const opts = g.of.filter(id => !used.has(id) && rank.has(id)).sort((a, b) => rank.get(a)! - rank.get(b)!);
        if (opts.length < g.k) { ok = false; break; }
        opts.slice(0, g.k).forEach(take);
        k += g.k;
      }
      if (!ok) break;
      let need = FLOW_SIZE[kind] - req.fixed.length - k;
      for (const id of L.cat.get(f as FlowId) ?? []) { if (!need) break; if (!used.has(id)) { take(id); need--; } }
      if (need) { ok = false; break; }
    }
    if (!ok) continue;

    let free = c.free;
    if (r) { picks.push(r); total += val(r)!; free--; }
    let hum = 0, unaff = 0;
    for (const id of L.all) {
      if (!free) break;
      if (used.has(id)) continue;
      const cat = COURSES[id].cat;
      if (cat === 'Α') { if (hum) continue; hum++; }
      if (cat === 'Ρ' && id !== PRAKTIKI) { if (unaff) continue; unaff++; }
      take(id);
      free--;
    }
    if (free) continue;
    if (!best || sign * (total - best.total) > 0) best = { total, picks, unknown };
  }
  return best;
}

export function comboEcts(c: Combo, ects: Ects, core: CoreChoice, lists?: { lo: Sorted; hi: Sorted }): ComboEcts | null {
  const min = bound(c, ects, core, -1, lists?.lo), max = bound(c, ects, core, 1, lists?.hi);
  return min && max ? { min, max } : null;
}

let cache: { sig: string; table: Map<string, ComboEcts | null> } | null = null;

/** ECTS bounds of every combination, recomputed only when the ECTS values or the core choice change */
export function ectsTable(ects: Ects, core: CoreChoice): ReadonlyMap<string, ComboEcts | null> {
  const sig = core + JSON.stringify(ects);
  if (cache?.sig !== sig) {
    const lists = { lo: sortedLists(ects, -1), hi: sortedLists(ects, 1) };
    cache = { sig, table: new Map(COMBOS.map(c => [c.key, comboEcts(c, ects, core, lists)])) };
  }
  return cache.table;
}

/** the overall spread, for colour scales and the filter */
export function ectsSpread(table: ReadonlyMap<string, ComboEcts | null>): [number, number] {
  let lo = Infinity, hi = -Infinity;
  for (const e of table.values()) if (e) { lo = Math.min(lo, e.min.total); hi = Math.max(hi, e.max.total); }
  return Number.isFinite(lo) ? [lo, hi] : [0, 0];
}

/** spread of the middles of the ranges: the colour scale uses it, so neighbouring combinations stay apart */
export function ectsMidSpread(table: ReadonlyMap<string, ComboEcts | null>): [number, number] {
  let lo = Infinity, hi = -Infinity;
  for (const e of table.values()) if (e) { const m = (e.min.total + e.max.total) / 2; lo = Math.min(lo, m); hi = Math.max(hi, m); }
  return Number.isFinite(lo) ? [lo, hi] : [0, 0];
}

/** ECTS of a plan: the counted courses, the free ones and the two core courses of semesters 6–9 */
export function planEcts(a: Allocation, core: CoreChoice, ects: Ects) {
  const spec = Object.values(a.flows).flatMap(x => x!.counted).concat(a.free.slice(0, a.freeTarget));
  return { spec: sumEcts(spec, ects), core: sumEcts([ELEC_DRAWING, core], ects), ids: spec };
}
