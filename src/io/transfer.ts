/**
 * Export and import of the user's work.
 * - JSON export: settings + filters + selected combination + picks + core choice + loaded ECTS.
 * - ECTS: a CSV template with every course code, to be filled in and loaded back.
 */
import { CATEGORIES, COURSES, GUIDE_YEAR } from '../data/catalog';
import { confidenceOf, ectsOf, ectsOrigin } from '../data/ects';
import { COURSE_CATS, COURSE_IDS } from '../domain/courses';
import { sanitizeEcts, sanitizeState, savedState, type AppState, type SavedState } from '../state/app-state';
import { sanitizeSettings, type Settings } from '../state/settings';

export const EXPORT_APP = 'semmy-flow-map';
export const EXPORT_VERSION = 1;

export interface ExportFile {
  app: typeof EXPORT_APP;
  version: number;
  exportedAt: string;
  guide: string;
  settings: Settings;
  state: SavedState;
}

export function exportJson(state: AppState, settings: Settings): string {
  const file: ExportFile = {
    app: EXPORT_APP, version: EXPORT_VERSION, exportedAt: new Date().toISOString(), guide: GUIDE_YEAR,
    settings, state: savedState(state),
  };
  return JSON.stringify(file, null, 2);
}

export type ImportResult =
  | { kind: 'full'; state: AppState; settings: Settings; picks: number; ects: number }
  | { kind: 'ects'; ects: Record<string, number>; count: number; skipped: number };

const ID_BY_CODE = new Map(Object.values(COURSES).map(c => [c.code, c.id]));

function courseIdOf(token: string): string | null {
  const t = token.trim().replace(/^"|"$/g, '');
  if (COURSES[t]) return t;
  return ID_BY_CODE.get(t) ?? null;
}

/** Parses an ECTS CSV: first column the course code (3.4.3136.6) or id (3136), last column the ECTS. */
export function parseEctsCsv(text: string): { ects: Record<string, number>; skipped: number } {
  const ects: Record<string, number> = {};
  let skipped = 0;
  for (const raw of text.replace(/^﻿/, '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const sep = line.includes(';') ? ';' : line.includes('\t') ? '\t' : ',';
    const cells = line.split(sep);
    const id = courseIdOf(cells[0] ?? '');
    const value = (cells[cells.length - 1] ?? '').trim().replace(/^"|"$/g, '').replace(',', '.');
    if (!id) { if (/\d/.test(cells[0] ?? '')) skipped++; continue; } // header lines have no digits in the first cell
    if (value === '') continue;
    const n = Number(value);
    if (Number.isFinite(n) && n > 0 && n <= 60) ects[id] = n; else skipped++;
  }
  return { ects, skipped };
}

export function parseImport(text: string, filename: string): ImportResult {
  const name = filename.toLowerCase();
  const trimmed = text.trim();
  if (name.endsWith('.csv') || name.endsWith('.tsv') || (!trimmed.startsWith('{') && !trimmed.startsWith('['))) {
    const { ects, skipped } = parseEctsCsv(text);
    const count = Object.keys(ects).length;
    if (!count) throw new Error('Δεν βρέθηκαν τιμές ECTS. Το αρχείο χρειάζεται μία γραμμή ανά μάθημα: κωδικός;ects.');
    return { kind: 'ects', ects, count, skipped };
  }
  let data: unknown;
  try { data = JSON.parse(text); } catch { throw new Error('Το αρχείο δεν είναι έγκυρο JSON.'); }
  if (typeof data !== 'object' || data === null) throw new Error('Το αρχείο δεν περιέχει ρυθμίσεις ή επιλογές.');
  const obj = data as Record<string, unknown>;
  if (obj.app === EXPORT_APP && typeof obj.state === 'object') {
    const state = sanitizeState(obj.state);
    const settings = sanitizeSettings((obj.settings ?? null) as Partial<Settings> | null);
    const picks = Object.values(state.picks).reduce((s, v) => s + v.length, 0);
    return { kind: 'full', state, settings, picks, ects: Object.keys(state.ects).length };
  }
  if ('ects' in obj) {
    const ects = sanitizeEcts(obj.ects);
    const count = Object.keys(ects).length;
    if (!count) throw new Error('Το πεδίο ects δεν περιέχει γνωστούς κωδικούς μαθημάτων.');
    return { kind: 'ects', ects, count, skipped: 0 };
  }
  throw new Error('Το αρχείο δεν είναι εξαγωγή του Χάρτη Ροών ούτε λίστα ECTS.');
}

const SOURCE_TEXT = { confirmed: 'οδηγός 2025-26 (= πρόγραμμα 2020-21)', guide: 'οδηγός 2025-26', legacy: 'πρόγραμμα 2020-21 (όχι στον οδηγό)', unknown: 'χωρίς τιμή' } as const;

/** CSV with the ECTS in effect (UTF-8 with BOM, `;` separated, opens cleanly in Excel/LibreOffice with Greek locale). */
export function ectsTemplateCsv(current: Readonly<Record<string, number>>): string {
  const rows = ['κωδικός;μάθημα;εξάμηνο;κατηγορία;πηγή;ects'];
  for (const cat of COURSE_CATS) {
    for (const id of COURSE_IDS.filter(x => COURSES[x].cat === cat)) {
      const c = COURSES[id];
      const v = ectsOf(id, current);
      const src = ectsOrigin(id, current) === 'user' ? 'δική σου τιμή' : SOURCE_TEXT[confidenceOf(id)];
      rows.push([c.code, `"${c.name.replace(/"/g, '""')}"`, c.sem, `"${cat} ${CATEGORIES[cat].name}"`, `"${src}"`, v === null ? '' : String(v).replace('.', ',')].join(';'));
    }
  }
  return '﻿' + rows.join('\r\n') + '\r\n';
}
