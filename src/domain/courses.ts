/**
 * The course sphere: every course of semesters 6–9 as a point, grouped around the anchor of its flow
 * (same anchors as the combination sphere) or of its category (Φ, Μ, Ρ, Α, Κ).
 * Inside a group courses spiral out by semester: 6ο near the anchor, 9ο on the outside.
 */
import { CATEGORIES, COURSES, type CatId, type FlowId } from '../data/catalog';
import { ELEC_DRAWING, FLOW_ORDER, type CoreChoice } from '../data/rules';
import type { Combo } from './combos';
import { ANCHORS, fromLatLon, normalize, type Vec3 } from './layout';
import type { Allocation } from './plan';

export const COURSE_CATS: readonly CatId[] = [...FLOW_ORDER, 'Φ', 'Μ', 'Ρ', 'Α', 'Κ'];

/** Category anchors: the 10 flows where they are on the combination sphere, the rest in the gaps. */
export const CAT_ANCHORS: Readonly<Record<CatId, Vec3>> = {
  ...ANCHORS,
  'Φ': fromLatLon(46, 112), 'Μ': fromLatLon(46, 292), 'Κ': fromLatLon(46, 202),
  'Ρ': fromLatLon(-46, 68), 'Α': fromLatLon(-46, 248),
};

/** All course ids in a stable order: by category, then semester, then as listed in the guide. */
export const COURSE_IDS: readonly string[] = COURSE_CATS.flatMap(cat =>
  CATEGORIES[cat].ids.slice().sort((a, b) => COURSES[a].sem - COURSES[b].sem));
export const COURSE_INDEX: ReadonlyMap<string, number> = new Map(COURSE_IDS.map((id, i) => [id, i]));

const GOLDEN = Math.PI * (3 - Math.sqrt(5));

export function layoutCourses(spread = 0.056): Float32Array {
  const out = new Float32Array(COURSE_IDS.length * 3);
  const up: Vec3 = [0, 1, 0];
  const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  for (const cat of COURSE_CATS) {
    const a = CAT_ANCHORS[cat];
    let e1 = cross(up, a);
    if (Math.hypot(...e1) < 1e-3) e1 = cross([0, 0, 1], a); // poles
    e1 = normalize(e1);
    const e2 = normalize(cross(a, e1));
    const ids = CATEGORIES[cat].ids.slice().sort((x, y) => COURSES[x].sem - COURSES[y].sem);
    ids.forEach((id, k) => {
      const r = spread * Math.sqrt(k + 2.4); // the +2.4 leaves room for the anchor label
      const th = k * GOLDEN;
      const p = normalize([
        a[0] + r * (Math.cos(th) * e1[0] + Math.sin(th) * e2[0]),
        a[1] + r * (Math.cos(th) * e1[1] + Math.sin(th) * e2[1]),
        a[2] + r * (Math.cos(th) * e1[2] + Math.sin(th) * e2[2]),
      ]);
      out.set(p, COURSE_INDEX.get(id)! * 3);
    });
  }
  return out;
}

/**
 * - req   fixed mandatory course of a chosen flow
 * - on    picked and counted for its flow (incl. a "k of n" choice)
 * - free  picked and counted as a free course
 * - core  Ηλεκτρολογικό Σχέδιο or the chosen core elective
 * - grp   an unpicked option of a "k of n" mandatory group
 * - opt   an unpicked elective of a chosen flow
 * - pool  could be taken as a free course
 * - na    not taught in the guide's year
 * - idle  no combination selected
 */
export type CourseState = 'req' | 'on' | 'free' | 'core' | 'grp' | 'opt' | 'pool' | 'na' | 'idle';

export function courseStates(c: Combo | null, a: Allocation | null, picks: readonly string[], core: CoreChoice): Map<string, CourseState> {
  const out = new Map<string, CourseState>();
  const counted = new Set<string>(), groupMembers = new Set<string>(), fixed = new Set<string>();
  const free = new Set(a?.free ?? []);
  if (c && a) {
    for (const f of c.order) {
      const x = a.flows[f]!;
      x.counted.forEach(id => counted.add(id));
      x.req.fixed.forEach(id => fixed.add(id));
      x.groups.forEach(g => g.of.forEach(id => groupMembers.add(id)));
    }
  }
  for (const id of COURSE_IDS) {
    const co = COURSES[id];
    if (co.cat === 'Κ' && (id === ELEC_DRAWING || id === core)) { out.set(id, 'core'); continue; }
    if (!c) { out.set(id, co.na ? 'na' : 'idle'); continue; }
    const inFlow = (co.cat as FlowId) in c.flows;
    if (fixed.has(id)) out.set(id, 'req');
    else if (free.has(id)) out.set(id, 'free');
    else if (counted.has(id) && picks.includes(id)) out.set(id, 'on');
    else if (co.na) out.set(id, 'na');
    else if (inFlow && groupMembers.has(id)) out.set(id, 'grp');
    else if (inFlow) out.set(id, 'opt');
    else out.set(id, 'pool');
  }
  return out;
}

export const STATE_TEXT: Record<CourseState, string> = {
  req: 'Υποχρεωτικό της ροής', on: 'Στο πλάνο (ροή)', free: 'Στο πλάνο (ελεύθερο)', core: 'Κορμός',
  grp: 'Επιλογή υποχρεωτικού', opt: 'Διαθέσιμο στη ροή', pool: 'Διαθέσιμο ως ελεύθερο', na: 'Δεν διδάχθηκε', idle: 'Μάθημα',
};

export const IN_PLAN: ReadonlySet<CourseState> = new Set<CourseState>(['req', 'on', 'free', 'core']);
