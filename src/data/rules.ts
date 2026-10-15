/**
 * Rules from the study guide, §7.4–7.5 and ch. 9.
 * A full flow is 7 courses (4 mandatory), a half flow is 4 (3 mandatory).
 * The 23 specialisation courses are flows + free courses.
 */
import type { FlowId } from './catalog';

export type DirId = 'ES' | 'PL' | 'TL' | 'EN';
export type Kind = 'F' | 'H';
export type RuleId = 'α' | 'β' | 'γ';
export type ShapeId = 'F3' | 'F2H1' | 'F2H2';

export const FLOW_ORDER: readonly FlowId[] = ['Υ', 'Λ', 'Η', 'Δ', 'Τ', 'Σ', 'Ζ', 'Ε', 'Ο', 'Ι'];
/** Flows built from the school's core subjects (rule iv refers to these). */
export const CORE8: readonly FlowId[] = FLOW_ORDER.slice(0, 8);
export const FLOW_SIZE: Record<Kind, number> = { F: 7, H: 4 };
export const TOTAL_COURSES = 23;

export interface Direction {
  id: DirId;
  name: string;
  /** genitive, as in "Κατεύθυνση Πληροφορικής" */
  long: string;
  /** CSS custom property holding the direction colour */
  token: string;
  tag: string;
  /** flows listed first when a combination is printed */
  lead: FlowId[];
  /** rule (α): every pair here as full flows + at least ½ other flow */
  a: FlowId[][];
  /** rule (β) and (γ): one full, one half, plus one of `third` as full */
  b: { F: FlowId; H: FlowId; third: FlowId[] };
  c: { F: FlowId; H: FlowId; third: FlowId[] };
  ruleText: Record<RuleId, string>;
}

export const DIRECTIONS: readonly Direction[] = [
  {
    id: 'ES', name: 'Ηλεκτρονική & Συστήματα', long: 'Ηλεκτρονικής και Συστημάτων', token: '--dir-es', tag: 'Η + Υ ή Σ',
    lead: ['Η', 'Σ', 'Υ'],
    a: [['Η', 'Υ'], ['Η', 'Σ']], b: { F: 'Η', H: 'Σ', third: ['Υ', 'Τ', 'Ζ'] }, c: { F: 'Σ', H: 'Η', third: ['Λ', 'Δ', 'Ε'] },
    ruleText: { 'α': '{Η} + {Υ ή Σ} + τουλάχιστον ½ άλλη ροή', 'β': '{Η, ½Σ} + {Υ ή Τ ή Ζ}', 'γ': '{½Η, Σ} + {Λ ή Δ ή Ε}' },
  },
  {
    id: 'PL', name: 'Πληροφορική', long: 'Πληροφορικής', token: '--dir-pl', tag: 'Υ + Λ',
    lead: ['Υ', 'Λ'],
    a: [['Υ', 'Λ']], b: { F: 'Υ', H: 'Λ', third: ['Δ', 'Σ'] }, c: { F: 'Λ', H: 'Υ', third: ['Δ', 'Σ'] },
    ruleText: { 'α': '{Υ, Λ} + τουλάχιστον ½ άλλη ροή', 'β': '{Υ, ½Λ} + {Δ ή Σ}', 'γ': '{½Υ, Λ} + {Δ ή Σ}' },
  },
  {
    id: 'TL', name: 'Επικοινωνίες', long: 'Επικοινωνιών', token: '--dir-tl', tag: 'Τ + Δ',
    lead: ['Τ', 'Δ'],
    a: [['Τ', 'Δ']], b: { F: 'Τ', H: 'Δ', third: ['Η', 'Σ'] }, c: { F: 'Δ', H: 'Τ', third: ['Υ', 'Λ', 'Σ'] },
    ruleText: { 'α': '{Τ, Δ} + τουλάχιστον ½ άλλη ροή', 'β': '{Τ, ½Δ} + {Η ή Σ}', 'γ': '{½Τ, Δ} + {Υ ή Λ ή Σ}' },
  },
  {
    id: 'EN', name: 'Ενέργεια', long: 'Ενέργειας', token: '--dir-en', tag: 'Ε + Ζ',
    lead: ['Ε', 'Ζ'],
    a: [['Ε', 'Ζ']], b: { F: 'Ε', H: 'Ζ', third: ['Τ', 'Δ', 'Σ'] }, c: { F: 'Ζ', H: 'Ε', third: ['Υ', 'Η', 'Σ'] },
    ruleText: { 'α': '{Ε, Ζ} + τουλάχιστον ½ άλλη ροή', 'β': '{Ε, ½Ζ} + {Τ ή Δ ή Σ}', 'γ': '{½Ε, Ζ} + {Υ ή Η ή Σ}' },
  },
];
export const DIR: Readonly<Record<DirId, Direction>> =
  Object.fromEntries(DIRECTIONS.map(d => [d.id, d])) as Record<DirId, Direction>;

export interface Shape { id: ShapeId; name: string; sub: string; free: number; token: string }
export const SHAPES: Readonly<Record<ShapeId, Shape>> = {
  F3:   { id: 'F3',   name: '3 πλήρεις', sub: '+2 ελεύθερα', free: 2, token: '--shape-f3' },
  F2H1: { id: 'F2H1', name: '2 + ½',     sub: '+5 ελεύθερα', free: 5, token: '--shape-f2h1' },
  F2H2: { id: 'F2H2', name: '2 + ½ + ½', sub: '+1 ελεύθερο', free: 1, token: '--shape-f2h2' },
};
export const SHAPE_ORDER: readonly ShapeId[] = ['F3', 'F2H1', 'F2H2'];

/** Mandatory courses of a flow: `fixed` are always required, each group requires `k` of `of`. */
export interface Requirement { fixed: string[]; groups: { of: string[]; k: number }[] }
const rq = (fixed: string[], groups: Requirement['groups'] = []): Requirement => ({ fixed, groups });

export function requirement(f: FlowId, kind: Kind, dir: DirId): Requirement {
  const full = kind === 'F';
  switch (f) {
    case 'Υ': return full ? rq(['3136', '3046', '3352'], [{ of: ['3213', '3362'], k: 1 }]) : rq(['3136', '3046', '3352']);
    case 'Λ': return rq([], [{ of: ['3061', '3123', '3287', '3105', '3205'], k: full ? 4 : 3 }]);
    case 'Η': return full ? rq(['3222', '3016', '3256', '3310']) : rq(['3222', '3016', '3310']);
    case 'Δ':
      if (full) return rq(['3299', '3248', '3298', '3346']);
      // the half flow differs for the informatics direction
      return dir === 'PL' ? rq(['3248', '3298', '3346']) : rq(['3299', '3298', '3346']);
    case 'Τ': return full ? rq(['3338', '3057', '3300', '3058']) : rq([], [{ of: ['3338', '3057', '3300', '3058'], k: 3 }]);
    case 'Σ': return full ? rq(['3171', '3149', '3305'], [{ of: ['3304', '3333'], k: 1 }]) : rq(['3171', '3149', '3305']);
    case 'Ζ': return full ? rq(['3290', '3127', '3101'], [{ of: ['3307', '3047'], k: 1 }]) : rq(['3290', '3101', '3127']);
    case 'Ε': return full ? rq(['3074', '3246', '3308', '3313']) : rq(['3074', '3246', '3308']);
    case 'Ο': return full
      ? rq([], [{ of: ['3292', '3196', '3306', '3260', '3334'], k: 4 }])
      : rq([], [{ of: ['3292', '3196', '3306', '3260'], k: 3 }]);
    case 'Ι': return full
      ? rq(['3336', '3350', '3326'], [{ of: ['3259', '3392'], k: 1 }])
      : rq(['3336', '3350'], [{ of: ['3259', '3392'], k: 1 }]);
  }
}

/** Πρακτική Άσκηση: allowed on top of the one "μη εντασσόμενο" course. */
export const PRAKTIKI = '3394';
/** Ηλεκτρολογικό Σχέδιο, mandatory core course of the 7th semester. */
export const ELEC_DRAWING = '3035';
/** Core elective: at least one of these; the second one counts as free. */
export const CORE_CHOICES = ['3068', '3403'] as const;
export type CoreChoice = typeof CORE_CHOICES[number];
