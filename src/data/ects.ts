/**
 * ECTS credits.
 *
 * The Greek study guide (2024-25, 2025-26) states only the diploma total: 300 ECTS over 10 semesters (§1.4).
 * Per-course values come from the school's English curricula, which list credits per course:
 *   - Undergraduate Curriculum, School of ECE NTUA, 2020-2021 (values below, as printed there)
 *   - Undergraduate Curriculum, School of ECE NTUA, 2018-2019 (cross-check: identical for every course listed in both)
 * The credits are ECTS: semesters 1–5 each add up to 30 in the 2020-21 curriculum.
 *
 * Confidence per course:
 *   confirmed  same value in 2018-19 and 2020-21, same code (semester) as in the app's guide year
 *   single     only in 2020-21 (course introduced after 2018-19)
 *   moved      the course changed semester since 2020-21; the value may have changed too
 *   unknown    newer than both curricula (codes 3400–3408): no value is shipped
 * A file the user loads in the app (CSV `κωδικός;ects` or the JSON export) overrides any value here.
 */
import { COURSES } from './catalog';

export const DIPLOMA_ECTS = 300;
/** semesters 1–5: 5 × 30 (2020-21 curriculum: each semester's courses add up to 30) */
export const ECTS_SEMESTERS_1_5 = 150;
/** 10th semester, diploma thesis: 300 over 10 semesters leaves 30 */
export const ECTS_THESIS = 30;
/** what semesters 6–9 contribute when the diploma totals exactly 300 */
export const ECTS_TARGET_6_9 = DIPLOMA_ECTS - ECTS_SEMESTERS_1_5 - ECTS_THESIS;

export const ECTS_SOURCES = [
  { id: 'ug2021', title: 'Undergraduate Curriculum, School of ECE NTUA, 2020-2021', url: 'https://www.ece.ntua.gr/media/630/Undergraduate_Curriculum_SchoolofECE_NTUA_2020_2021-20210220.pdf' },
  { id: 'ug1819', title: 'Undergraduate Curriculum, School of ECE NTUA, 2018-2019', url: 'https://www.ece.ntua.gr/media/628/Undergraduate_Curriculum_SchoolofECE_NTUA_2018_2019-20210220.pdf' },
] as const;

/** `code=ects` as printed in the 2020-21 curriculum (the code carries the semester of that year) */
const UG2021 = `
2.1.3161.6=4 3.1.3259.6=6 3.1.3288.6=4 3.1.3296.6=4 3.1.3356.6=4 3.2.3057.6=6 3.2.3336.6=6 3.2.3338.6=6 3.2.3392.6=6
3.3.3068.6=5 3.3.3149.6=6 3.3.3171.6=6 3.4.3046.6=6 3.4.3061.6=6 3.4.3123.6=6 3.4.3136.6=6 3.4.3165.6=4 3.4.3229.6=4
3.5.3222.6=6 3.5.3236.6=4 3.5.3248.6=6 3.5.3299.6=6 3.6.3074.6=6 3.6.3103.6=4 3.6.3127.6=6 3.6.3246.6=6 3.6.3290.6=6
3.6.3292.6=6 3.6.3380.6=4 3.7.3196.6=6 9.2.3293.6=4 9.2.3373.6=4 9.2.3396.6=4 9.4.3121.6=4 9.4.3158.6=4 9.4.3318.6=4
3.1.3267.7=4 3.1.3301.7=4 3.1.3303.7=4 3.1.3350.7=6 3.2.3300.7=6 3.2.3331.7=4 3.2.3335.7=4 3.2.3344.7=4 3.2.3347.7=4
3.3.3181.7=4 3.3.3304.7=6 3.3.3305.7=6 3.3.3372.7=4 3.4.3105.7=6 3.4.3205.7=6 3.4.3213.7=6 3.4.3237.7=4 3.4.3287.7=4
3.4.3362.7=6 3.5.3016.7=6 3.5.3060.7=4 3.5.3256.7=6 3.5.3297.7=4 3.5.3298.7=6 3.6.3101.7=6 3.6.3261.7=4 3.6.3269.7=4
3.6.3307.7=6 3.6.3308.7=6 3.6.3349.7=4 3.7.3035.7=5 3.7.3306.7=6 3.7.3341.7=4 9.2.3384.7=4 9.2.3397.7=4 9.3.3398.7=4
9.4.3051.7=4 9.4.3078.7=4 9.4.3302.7=4
3.1.3311.8=4 3.1.3364.8=4 3.2.3058.8=6 3.2.3156.8=4 3.2.3272.8=4 3.2.3360.8=4 3.2.3366.8=4 3.2.3382.8=4 3.3.3175.8=4
3.3.3176.8=4 3.3.3333.8=6 3.3.3348.8=4 3.4.3135.8=4 3.4.3183.8=4 3.4.3186.8=4 3.4.3207.8=4 3.4.3254.8=4 3.4.3328.8=4
3.4.3330.8=4 3.4.3352.8=6 3.4.3399.8=4 3.5.3258.8=4 3.5.3278.8=4 3.5.3310.8=6 3.5.3312.8=4 3.5.3329.8=4 3.5.3337.8=4
3.5.3345.8=4 3.5.3346.8=6 3.5.3370.8=4 3.6.3047.8=6 3.6.3182.8=4 3.6.3214.8=4 3.6.3216.8=4 3.6.3313.8=6 3.6.3314.8=4
3.6.3358.8=4 3.6.3363.8=4 3.7.3164.8=4 3.7.3215.8=4 3.7.3219.8=4 3.7.3252.8=4 3.7.3260.8=6 3.7.3264.8=4 3.7.3365.8=4
3.7.3381.8=4 3.7.3394.8=6 4.1.3385.8=2 9.1.3146.8=2 9.1.3147.8=2 9.2.3167.8=4 9.2.3294.8=4 9.2.3317.8=4 9.2.3383.8=4
3.2.3077.9=4 3.2.3169.9=4 3.2.3195.9=4 3.2.3275.9=4 3.2.3324.9=4 3.2.3326.9=6 3.3.3172.9=4 3.3.3179.9=4 3.3.3208.9=4
3.3.3279.9=4 3.4.3189.9=4 3.4.3257.9=4 3.4.3319.9=4 3.4.3320.9=4 3.4.3321.9=4 3.4.3327.9=4 3.4.3361.9=4 3.4.3377.9=4
3.5.3125.9=4 3.5.3251.9=4 3.5.3323.9=4 3.5.3367.9=4 3.5.3379.9=4 3.6.3128.9=4 3.6.3202.9=4 3.6.3224.9=4 3.6.3227.9=4
3.6.3235.9=4 3.6.3244.9=4 3.7.3245.9=4 3.7.3255.9=4 3.7.3325.9=4 3.7.3334.9=6 3.7.3339.9=4 3.7.3354.9=4 9.1.3062.9=4
9.4.3234.9=4 9.4.3378.9=4 9.4.3395.9=4
`;
/** in the 2020-21 curriculum but not in 2018-19 */
const NOT_IN_1819 = new Set(['3167', '3398', '3399']);

export type EctsConfidence = 'confirmed' | 'single' | 'moved' | 'unknown';

/** code as printed in the 2020-21 curriculum, per course id */
export const UG2021_CODE: Readonly<Record<string, string>> = {};
/** course id (4-digit part of the code) → ECTS */
export const BUILTIN_ECTS: Readonly<Record<string, number>> = (() => {
  const out: Record<string, number> = {};
  for (const tok of UG2021.trim().split(/\s+/)) {
    const [code, v] = tok.split('=');
    const id = code.split('.')[2];
    out[id] = Number(v);
    (UG2021_CODE as Record<string, string>)[id] = code;
  }
  return out;
})();

export function confidenceOf(id: string): EctsConfidence {
  if (!(id in BUILTIN_ECTS)) return 'unknown';
  if (COURSES[id] && COURSES[id].code !== UG2021_CODE[id]) return 'moved';
  return NOT_IN_1819.has(id) ? 'single' : 'confirmed';
}

export const CONFIDENCE_TEXT: Record<EctsConfidence, string> = {
  confirmed: 'ίδια τιμή στα προγράμματα 2018-19 και 2020-21',
  single: 'από το πρόγραμμα 2020-21',
  moved: 'από το πρόγραμμα 2020-21· το μάθημα άλλαξε εξάμηνο από τότε, η τιμή μπορεί να άλλαξε',
  unknown: 'νεότερο μάθημα, χωρίς δημοσιευμένη τιμή',
};

export function ectsOf(id: string, overrides: Readonly<Record<string, number>>): number | null {
  const v = overrides[id] ?? BUILTIN_ECTS[id];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** where the value in effect comes from */
export function ectsOrigin(id: string, overrides: Readonly<Record<string, number>>): 'user' | 'builtin' | null {
  if (typeof overrides[id] === 'number') return 'user';
  return id in BUILTIN_ECTS ? 'builtin' : null;
}

/** Sum of known values plus how many were unknown. */
export function sumEcts(ids: readonly string[], overrides: Readonly<Record<string, number>>) {
  let total = 0, unknown = 0;
  for (const id of ids) { const v = ectsOf(id, overrides); if (v === null) unknown++; else total += v; }
  return { total, unknown, known: ids.length - unknown };
}

export const fmtEcts = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1).replace('.', ','));
