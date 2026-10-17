/**
 * Sanity checks for the rule model. Run with `npm test`.
 */
import { CATEGORIES, COURSES, type FlowId } from '../src/data/catalog';
import { DIRECTIONS, FLOW_ORDER, FLOW_SIZE, TOTAL_COURSES, requirement } from '../src/data/rules';
import { COMBOS, COMBO_BY_KEY, filterCombos } from '../src/domain/combos';
import { layoutSphere } from '../src/domain/layout';
import { allocate, checks, rejectPick } from '../src/domain/plan';
import { COURSE_IDS, courseStates, IN_PLAN, layoutCourses } from '../src/domain/courses';
import { ectsTemplateCsv, parseEctsCsv, parseImport } from '../src/io/transfer';
import { defaultState } from '../src/state/app-state';
import { DEFAULT_SETTINGS, sanitizeSettings } from '../src/state/settings';
import { BUILTIN_ECTS, ECTS_SEMESTERS_1_5, ECTS_TARGET_6_9, ECTS_THESIS, confidenceOf } from '../src/data/ects';
import { BASE_KEYS, PRESETS, contrast, isHex } from '../src/data/themes';
import { ectsSpread, ectsTable, planEcts } from '../src/domain/ectsRange';
import { planLink, readPlanHash } from '../src/io/share';

let failures = 0;
const ok = (cond: unknown, msg: string) => { if (!cond) { failures++; console.error('✕', msg); } else console.log('✓', msg); };

// catalogue
ok(Object.keys(COURSES).length > 150, `catalogue has ${Object.keys(COURSES).length} courses`);
for (const f of FLOW_ORDER) ok(CATEGORIES[f].ids.length >= 10, `flow ${f} lists ${CATEGORIES[f].ids.length} courses`);

// combinations
const perDir = Object.fromEntries(DIRECTIONS.map(d => [d.id, COMBOS.filter(c => c.dir === d.id).length]));
console.log('   per direction:', perDir, 'total', COMBOS.length);
ok(perDir.ES === 92 && perDir.PL === 48 && perDir.TL === 49 && perDir.EN === 50, 'combination counts per direction are 92 / 48 / 49 / 50');
ok(COMBOS.every(c => {
  const n = c.order.reduce((s, f) => s + FLOW_SIZE[c.flows[f]!], 0);
  return n + c.free === TOTAL_COURSES && c.free <= 5;
}), 'every combination fills exactly 23 courses with at most 5 free');
ok(COMBOS.every(c => !c.flows['Φ' as FlowId] && !c.flows['Μ' as FlowId]), 'Φ and Μ never appear as flows');
ok(COMBOS.filter(c => c.flows['Ο'] || c.flows['Ι']).every(c => c.rules.includes('α')), 'Ο and Ι only appear through rule (α)');
ok(COMBO_BY_KEY.get('ES-ΥΗ½Σ')?.rules.join() === 'α,β', 'Η + Υ + ½Σ is reachable by both (α) and (β)');
ok(COMBOS.filter(c => c.dir === 'EN' && c.rules.includes('γ')).map(c => c.key).join() === 'EN-ΥΖ½Ε,EN-ΗΖ½Ε,EN-ΣΖ½Ε',
  '(γ) for Ενέργεια is {½Ε, Ζ} + {Υ ή Η ή Σ}');
ok(filterCombos({ dir: 'PL', shape: 'F3', flows: { 'Σ': 'F' } }).length === 1, 'Πληροφορική + 3 πλήρεις + Σ leaves one combination');

// requirements reference courses of the right flow
for (const c of COMBOS) for (const f of c.order) {
  const r = requirement(f, c.flows[f]!, c.dir);
  const ids = [...r.fixed, ...r.groups.flatMap(g => g.of)];
  if (!ids.every(id => COURSES[id]?.cat === f)) { ok(false, `requirement of ${f} in ${c.key} points outside the flow`); break; }
}
ok(true, 'mandatory course ids all belong to their flow');

// example plan
const ex = COMBO_BY_KEY.get('PL-ΥΛΣ')!;
const picks = ['3213', '3207', '3257', '3377', '3061', '3123', '3287', '3105', '3186', '3254', '3327', '3333', '3372', '3208', '3279', '3294', '3298'];
const a = allocate(ex, picks);
ok(a.total === 23 && checks(ex, a).every(x => x.ok), `example plan is valid (${a.total}/23)`);
ok(rejectPick(ex, picks, '3362') !== null, 'a 24th course is refused');
ok(rejectPick(ex, picks.slice(0, -1), '3385') === null, 'a humanities course fits a free slot');
ok(rejectPick(ex, picks.slice(0, -2).concat('3385'), '3146') !== null, 'a second humanities course is refused');

// Ο / Ι rule iv
const oi = COMBOS.find(c => c.dir === 'PL' && c.flows['Ο'] === 'H' && c.flows['Ι'] === 'H')!;
const aoi = allocate(oi, []);
ok(aoi.needsCoreMandatory && aoi.coreMandatory === null, 'Ο/Ι combination asks for a core mandatory course');
ok(allocate(oi, ['3171']).coreMandatory === '3171', 'a Σ mandatory course in the free slot satisfies it');
const oiY = COMBOS.find(c => c.dir === 'PL' && c.flows['Υ'] === 'F' && c.flows['Λ'] === 'F' && c.flows['Ο'] === 'H' && Object.keys(c.flows).length === 3)!;
ok(allocate(oiY, ['3213', '3207', '3257', '3377', '3362']).coreMandatory === null, 'the second option of a chosen flow’s "1 of 2" does not satisfy rule iv');
const tdi = COMBO_BY_KEY.get('TL-ΔΤΙ')!;
ok(Boolean(tdi) && tdi.rules.join() === 'α' && tdi.free === 2, 'Τ + Δ + Ι (all full) is allowed for Επικοινωνίες under (α), with 2 free');
const tdiPicks = ['3259', '3267', '3331', '3272', '3060', '3370', '3312', '3278', '3356', '3303', '3347'].filter(id => !COURSES[id].na);
ok(allocate(tdi, tdiPicks.concat('3346')).coreMandatory === null, 'with full Δ, a Δ course cannot be the rule-iv course');
ok(allocate(tdi, tdiPicks.concat('3136')).coreMandatory === '3136', 'with Τ + Δ + Ι, a Υ mandatory course satisfies rule iv');
const tdiExtra = allocate(tdi, tdiPicks.concat('3136', '3382'));
ok(tdiExtra.flows['Ι']!.n === 7 && tdiExtra.free.includes('3382') && tdiExtra.total === 23 && checks(tdi, tdiExtra).every(x => x.ok),
  'Τ + Δ + Ι: 7+7+7, one Υ mandatory + an 8th Ι course as the 2 free = valid 23');

// layout
const pos = layoutSphere(COMBOS, { halfWeight: 0.5, spacing: 0.078, polePull: 3 });
let unit = true;
for (let i = 0; i < pos.length; i += 3) { const l = Math.hypot(pos[i], pos[i + 1], pos[i + 2]); if (!(Math.abs(l - 1) < 1e-4)) unit = false; }
ok(unit && pos.length === COMBOS.length * 3, 'layout puts every combination on the unit sphere');
for (const [f, sign] of [['Ο', 1], ['Ι', -1]] as const) {
  const lats = COMBOS.map((c, i) => [c, Math.asin(pos[i * 3 + 1]) * 180 / Math.PI * sign] as const)
    .filter(([c]) => c.flows[f] && !c.flows[f === 'Ο' ? 'Ι' : 'Ο']).map(([, l]) => l);
  ok(Math.min(...lats) > 25, `every combination with ${f} (and not the other pole) sits on its hemisphere, min |lat| ${Math.min(...lats).toFixed(0)}°`);
}

// course sphere
const cpos = layoutCourses();
let cunit = true, minD = 9;
for (let i = 0; i < COURSE_IDS.length; i++) {
  const l = Math.hypot(cpos[i * 3], cpos[i * 3 + 1], cpos[i * 3 + 2]); if (Math.abs(l - 1) > 1e-4) cunit = false;
  for (let j = i + 1; j < COURSE_IDS.length; j++) minD = Math.min(minD, Math.hypot(cpos[i * 3] - cpos[j * 3], cpos[i * 3 + 1] - cpos[j * 3 + 1], cpos[i * 3 + 2] - cpos[j * 3 + 2]));
}
ok(COURSE_IDS.length === Object.keys(COURSES).length && cunit, `course sphere holds all ${COURSE_IDS.length} courses on the unit sphere`);
ok(minD > 0.03, `no two courses overlap on the course sphere (closest ${minD.toFixed(3)})`);
const st = courseStates(ex, a, picks, '3403');
ok(COURSE_IDS.filter(id => IN_PLAN.has(st.get(id)!)).length === 25, 'course sphere shows 23 + 2 core courses in the example plan');

// files
const csv = ectsTemplateCsv({ '3136': 5 });
ok(/^3\.4\.3136\.6;.*;"δική σου τιμή";5$/m.test(csv) && /^3\.4\.3046\.6;.*;6$/m.test(csv), 'ECTS file carries the values in effect and their source');
const filled = csv.replace(/^(3\.4\.3046\.6;.*;)[^;]*$/m, '$15,5').replace(/^(3\.5\.3222\.6;.*;)[^;]*$/m, '$14');
const parsed = parseEctsCsv(filled);
ok(parsed.ects['3136'] === 5 && parsed.ects['3046'] === 5.5 && parsed.ects['3222'] === 4 && parsed.skipped === 0, 'ECTS template round-trips (incl. decimal comma)');
const exp = JSON.stringify({ app: 'semmy-flow-map', version: 1, settings: { ...DEFAULT_SETTINGS, pointSize: 12, resolution: 7 }, state: { ...defaultState(), sel: 'TL-ΔΤΙ', picks: { 'TL-ΔΤΙ': ['3259', 'nope'] }, ects: { '3136': 5, 'zzz': 3 } } });
const imp = parseImport(exp, 'x.json');
ok(imp.kind === 'full' && imp.state.sel === 'TL-ΔΤΙ' && imp.state.picks['TL-ΔΤΙ'].join() === '3259' && imp.settings.pointSize === 12
  && imp.settings.resolution === 'auto' && Object.keys(imp.state.ects).join() === '3136', 'import keeps valid values and drops invalid ones');
let threw = false; try { parseImport('{"hello":1}', 'a.json'); } catch { threw = true; }
ok(threw, 'unrelated JSON is refused with a message');

// ECTS
const conf: Record<string, number> = {};
for (const id of Object.keys(COURSES)) conf[confidenceOf(id)] = (conf[confidenceOf(id)] ?? 0) + 1;
console.log('   ECTS confidence:', conf);
ok(Object.keys(BUILTIN_ECTS).length === 168 && conf.unknown === 9 && conf.moved === 8, '168 courses have ECTS from the 2020-21 curriculum, 9 newer ones have none, 8 moved semester');
ok(Object.values(BUILTIN_ECTS).every(v => [2, 4, 5, 6].includes(v)), 'every shipped ECTS value is 2, 4, 5 or 6');
ok(COMBOS.every(c => c.order.every(f => requirement(f, c.flows[f]!, c.dir).fixed.every(id => BUILTIN_ECTS[id] !== undefined))),
  'every fixed mandatory course has a known ECTS value');
ok(ECTS_SEMESTERS_1_5 + ECTS_TARGET_6_9 + ECTS_THESIS === 300, 'diploma split 150 + 120 + 30 = 300');
const T = ectsTable({}, '3068');
let boundsOk = true;
for (const c of COMBOS) {
  const e = T.get(c.key);
  if (!e || e.min.total > e.max.total) { boundsOk = false; break; }
  for (const b of [e.min, e.max]) {
    const al = allocate(c, b.picks);
    if (!checks(c, al).every(x => x.ok) || planEcts(al, '3068', {}).spec.total !== b.total) { boundsOk = false; console.error('   bad bound', c.key, b.total); }
  }
}
ok(boundsOk, 'every combination has ECTS bounds, each reached by a valid 23-course plan');
const sp = ectsSpread(T);
ok(sp[0] === 110 && sp[1] === 130, `ECTS of the 23 specialisation courses range ${sp[0]}–${sp[1]}`);
const tdiE = T.get('TL-ΔΤΙ')!;
ok(tdiE.min.total === 114 && tdiE.max.total === 122, `Τ + Δ + Ι gives ${tdiE.min.total}–${tdiE.max.total} ECTS`);
ok(ectsTable({ '3136': 30 }, '3068').get('PL-ΥΛΣ')!.min.total >= T.get('PL-ΥΛΣ')!.min.total + 24, 'user ECTS values change the bounds');

// share link
const link = planLink({ sel: 'TL-ΔΤΙ', picks: ['3259', '3267'], core: '3068' }, 'https://example.test/app/');
const back = link ? readPlanHash(new URL(link).hash) : null;
ok(back?.sel === 'TL-ΔΤΙ' && back.picks.join() === '3259,3267' && back.core === '3068', 'a plan link reopens the same plan');
ok(readPlanHash('#s=XX-Y&p=1') === null && readPlanHash('#s=TL-%CE%94%CE%A4%CE%99&p=3259.bad')?.picks.join() === '3259', 'bad links are rejected, unknown courses dropped');

// themes
let themesOk = true;
for (const p of Object.values(PRESETS)) for (const sc of ['light', 'dark'] as const) {
  const c = p[sc];
  if (!BASE_KEYS.every(k => isHex(c[k]))) themesOk = false;
  if (contrast(c.ink, c.panel) < 7 || contrast(c.ink, c.paper) < 7 || contrast(c.ink2, c.panel) < 4.5) { themesOk = false; console.error('   low text contrast', p.id, sc); }
  if (contrast(c.ok, c.panel) < 4.5 || contrast(c.bad, c.panel) < 4.5) { themesOk = false; console.error('   low status contrast', p.id, sc); }
  for (const k of ['dirES', 'dirPL', 'dirTL', 'dirEN', 'shapeF3', 'shapeF2H1', 'shapeF2H2'] as const) {
    if (contrast(c[k], c.globe) < 2.6) { themesOk = false; console.error('   low point contrast', p.id, sc, k); }
  }
}
ok(themesOk, `${Object.keys(PRESETS).length} colour themes: complete, readable text, points visible on the globe`);
const ss = sanitizeSettings({ theme: 'neon', colorsLight: { ink: '#123456', paper: 'red', zzz: '#000000' } as never, touchMode: 'explore', phoneLayout: 'nope' as never });
ok(ss.theme === 'neon' && ss.colorsLight.ink === '#123456' && !('paper' in ss.colorsLight) && ss.touchMode === 'explore' && ss.phoneLayout === 'side',
  'settings keep valid theme colours and touch options, drop invalid ones');

if (failures) { console.error(`\n${failures} check(s) failed`); process.exit(1); }
console.log('\nall checks passed');
