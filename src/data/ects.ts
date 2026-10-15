/**
 * ECTS credits.
 *
 * The study guide (2024-25 and 2025-26) states only the diploma total: 300 ECTS over 10 semesters
 * (9 semesters of courses + the diploma thesis, §1.4). It does not list ECTS per course, so no
 * per-course value ships with the app. Values come from:
 *   1. BUILTIN_ECTS below, if someone fills it in from an official source, and
 *   2. a file the user loads in the app (CSV `κωδικός,ects` or the app's JSON export), which wins.
 * Unknown values are shown as "—" and are never estimated.
 */
export const DIPLOMA_ECTS = 300;

/** course id (4-digit part of the code) → ECTS */
export const BUILTIN_ECTS: Readonly<Record<string, number>> = {};

export function ectsOf(id: string, overrides: Readonly<Record<string, number>>): number | null {
  const v = overrides[id] ?? BUILTIN_ECTS[id];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** Sum of known values plus how many were unknown. */
export function sumEcts(ids: readonly string[], overrides: Readonly<Record<string, number>>) {
  let total = 0, unknown = 0;
  for (const id of ids) { const v = ectsOf(id, overrides); if (v === null) unknown++; else total += v; }
  return { total, unknown, known: ids.length - unknown };
}

export const fmtEcts = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1).replace('.', ','));
