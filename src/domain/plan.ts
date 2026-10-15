/**
 * The 23-course plan for one combination: which picked courses count for each flow,
 * which count as free, and what is still missing.
 */
import { CATEGORIES, COURSES, type FlowId } from '../data/catalog';
import {
  CORE8, DIR, ELEC_DRAWING, FLOW_SIZE, PRAKTIKI, SHAPES, TOTAL_COURSES, requirement,
  type CoreChoice, type Kind, type Requirement,
} from '../data/rules';
import type { Combo } from './combos';

export interface GroupState { of: string[]; k: number; take: string[]; need: number }

export interface FlowAllocation {
  f: FlowId;
  kind: Kind;
  size: number;
  req: Requirement;
  groups: GroupState[];
  /** courses that count for the flow, mandatory first */
  counted: string[];
  /** picked electives that did not fit the flow and count as free instead */
  overflow: string[];
  n: number;
  missing: number;
}

export interface Allocation {
  flows: Partial<Record<FlowId, FlowAllocation>>;
  free: string[];
  freeTarget: number;
  total: number;
  humanities: number;
  unaffiliated: number;
  /** rule iv: a combination with Ο or Ι needs one mandatory course of another core flow among the free ones */
  needsCoreMandatory: boolean;
  coreMandatory: string | null;
}

export function allocate(c: Combo, picks: readonly string[]): Allocation {
  const flows: Allocation['flows'] = {};
  const free: string[] = [];
  for (const f of c.order) {
    const kind = c.flows[f]!;
    const size = FLOW_SIZE[kind];
    const req = requirement(f, kind, c.dir);
    const inFlow = picks.filter(id => COURSES[id]?.cat === f && !req.fixed.includes(id));
    const used = new Set<string>();
    const groups: GroupState[] = [];
    let counted = req.fixed.slice();
    let kSum = 0;
    for (const g of req.groups) {
      const take = inFlow.filter(id => g.of.includes(id)).slice(0, g.k);
      take.forEach(id => used.add(id));
      counted = counted.concat(take);
      kSum += g.k;
      groups.push({ of: g.of, k: g.k, take, need: g.k - take.length });
    }
    const electives = inFlow.filter(id => !used.has(id));
    const cap = size - req.fixed.length - kSum;
    counted = counted.concat(electives.slice(0, cap));
    const overflow = electives.slice(cap);
    flows[f] = {
      f, kind, size, req, groups, counted, overflow, n: counted.length,
      missing: groups.reduce((s, g) => s + g.need, 0),
    };
    free.push(...overflow);
  }
  for (const id of picks) { const co = COURSES[id]; if (co && !(co.cat in c.flows)) free.push(id); }

  const freeTarget = c.free;
  const flowTotal = Object.values(flows).reduce((s, x) => s + x!.n, 0);
  const needsCoreMandatory = Boolean(c.flows['Ο'] || c.flows['Ι']);
  const coreMandatory = needsCoreMandatory ? free.find(id => isCoreMandatory(id, c)) ?? null : null;
  return {
    flows, free, freeTarget,
    total: flowTotal + Math.min(free.length, freeTarget),
    humanities: free.filter(id => COURSES[id].cat === 'Α').length,
    unaffiliated: free.filter(id => COURSES[id].cat === 'Ρ' && id !== PRAKTIKI).length,
    needsCoreMandatory, coreMandatory,
  };
}

/**
 * Rule iv (§7.5): with Ο or Ι among the flows, one more course must be "ένα υποχρεωτικό μάθημα από τις υπόλοιπες
 * ροές (Υ, Λ, Η, Δ, Τ, Σ, Ζ, Ε) από τα εξάμηνα 6ο, 7ο ή 8ο, πέραν των μαθημάτων που ήδη προβλέπονται από τις
 * επιλεγμένες ροές". Read literally: a mandatory course of the full version of one of those 8 flows, semester ≤ 8,
 * that is not already part of what a chosen flow requires (its fixed courses or its "k of n" options).
 * So with full Δ the Δ courses never qualify, while with ½Υ the full-flow option 3213 does.
 */
export function isCoreMandatory(id: string, c: Combo): boolean {
  const co = COURSES[id];
  if (!co || !(CORE8 as readonly string[]).includes(co.cat) || co.sem > 8) return false;
  const f = co.cat as FlowId;
  const full = requirement(f, 'F', c.dir);
  if (!full.fixed.includes(id) && !full.groups.some(g => g.of.includes(id))) return false;
  const kind = c.flows[f];
  if (kind) {
    const own = requirement(f, kind, c.dir);
    if (own.fixed.includes(id) || own.groups.some(g => g.of.includes(id))) return false;
  }
  return true;
}

export interface Check { ok: boolean; text: string }

export function checks(c: Combo, a: Allocation): Check[] {
  const out: Check[] = [];
  out.push({ ok: a.total === TOTAL_COURSES, text: `${a.total}/${TOTAL_COURSES} μαθήματα εμβάθυνσης` });
  for (const f of c.order) {
    const x = a.flows[f]!;
    out.push({
      ok: x.n === x.size && x.missing === 0,
      text: `Ροή ${f}: ${x.n}/${x.size}${x.missing ? `, λείπουν ${x.missing} υποχρεωτικά` : ''}`,
    });
  }
  out.push({ ok: a.free.length === a.freeTarget, text: `Ελεύθερα: ${Math.min(a.free.length, a.freeTarget)}/${a.freeTarget}` });
  if (a.needsCoreMandatory) {
    out.push(a.coreMandatory
      ? { ok: true, text: `Υποχρεωτικό άλλης ροής για Ο/Ι: ${COURSES[a.coreMandatory].name}` }
      : { ok: false, text: 'Λόγω Ο/Ι, ένα ελεύθερο πρέπει να είναι υποχρεωτικό άλλης ροής (6ο–8ο)' });
  }
  out.push({ ok: a.humanities <= 1, text: 'Έως 1 ανθρωπιστικό' });
  out.push({ ok: a.unaffiliated <= 1, text: 'Έως 1 μη εντασσόμενο (+ Πρακτική)' });
  return out;
}

/** Why adding `id` is not allowed, or null if it is. */
export function rejectPick(c: Combo, picks: readonly string[], id: string): string | null {
  const co = COURSES[id];
  if (!co) return 'Άγνωστο μάθημα.';
  if (co.na) return 'Το μάθημα δεν διδάχθηκε το ακαδημαϊκό έτος του οδηγού.';
  const kind = c.flows[co.cat as FlowId];
  if (kind && requirement(co.cat as FlowId, kind, c.dir).fixed.includes(id)) return `Υποχρεωτικό της ροής ${co.cat}, μετρά ήδη.`;
  const a = allocate(c, picks.concat(id));
  if (a.free.length > a.freeTarget) {
    return kind
      ? `Η ροή ${co.cat} έχει ήδη ${FLOW_SIZE[kind]} μαθήματα και τα ελεύθερα είναι γεμάτα (${a.freeTarget}/${a.freeTarget}). Βγάλε ένα πρώτα.`
      : `Τα ελεύθερα είναι γεμάτα (${a.freeTarget}/${a.freeTarget}). Βγάλε ένα πρώτα.`;
  }
  if (a.humanities > 1) return 'Επιτρέπεται έως 1 ανθρωπιστικό μάθημα.';
  if (a.unaffiliated > 1) return 'Επιτρέπεται έως 1 μη εντασσόμενο μάθημα, εκτός από την Πρακτική Άσκηση.';
  return null;
}

/** Courses per semester, including Ηλεκτρολογικό Σχέδιο and the chosen core elective. */
export function semesterLoad(a: Allocation, core: CoreChoice) {
  const ids = Object.values(a.flows).flatMap(x => x!.counted)
    .concat(a.free.slice(0, a.freeTarget), [ELEC_DRAWING, core]);
  const bySem: Record<6 | 7 | 8 | 9, number> = { 6: 0, 7: 0, 8: 0, 9: 0 };
  let earlier = 0;
  for (const id of ids) {
    const s = COURSES[id].sem;
    if (s >= 6 && s <= 9) bySem[s as 6 | 7 | 8 | 9]++; else earlier++;
  }
  return { bySem, earlier };
}

export function planText(c: Combo, a: Allocation, core: CoreChoice): string {
  const L: string[] = [
    `Χάρτης Ροών ΣΗΜΜΥ · Κατεύθυνση ${DIR[c.dir].long}`,
    `Συνδυασμός: ${c.label} (${SHAPES[c.shape].name}, κανόνας ${c.rules.join('/')})`,
    '',
  ];
  const line = (id: string) => `  ${COURSES[id].code.padEnd(11)} ${COURSES[id].name}`;
  for (const f of c.order) {
    const x = a.flows[f]!;
    L.push(`Ροή ${f} · ${CATEGORIES[f].name} (${x.kind === 'F' ? 'πλήρης' : 'μισή'}, ${x.n}/${x.size})`);
    x.counted.slice().sort((p, q) => COURSES[p].sem - COURSES[q].sem).forEach(id => L.push(line(id)));
  }
  L.push(`Ελεύθερα (${Math.min(a.free.length, a.freeTarget)}/${a.freeTarget})`);
  a.free.forEach(id => L.push(line(id)));
  L.push('Κορμός', line(ELEC_DRAWING), line(core));
  return L.join('\n');
}
