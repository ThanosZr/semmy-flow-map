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
import { DEFAULT_SETTINGS } from '../src/state/settings';

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
const filled = csv.replace(/^(3\.4\.3046\.6;.*;)$/m, '$15,5').replace(/^(3\.5\.3222\.6;.*;)$/m, '$14');
const parsed = parseEctsCsv(filled);
ok(parsed.ects['3136'] === 5 && parsed.ects['3046'] === 5.5 && parsed.ects['3222'] === 4 && parsed.skipped === 0, 'ECTS template round-trips (incl. decimal comma)');
const exp = JSON.stringify({ app: 'semmy-flow-map', version: 1, settings: { ...DEFAULT_SETTINGS, pointSize: 12, resolution: 7 }, state: { ...defaultState(), sel: 'TL-ΔΤΙ', picks: { 'TL-ΔΤΙ': ['3259', 'nope'] }, ects: { '3136': 5, 'zzz': 3 } } });
const imp = parseImport(exp, 'x.json');
ok(imp.kind === 'full' && imp.state.sel === 'TL-ΔΤΙ' && imp.state.picks['TL-ΔΤΙ'].join() === '3259' && imp.settings.pointSize === 12
  && imp.settings.resolution === 'auto' && Object.keys(imp.state.ects).join() === '3136', 'import keeps valid values and drops invalid ones');
let threw = false; try { parseImport('{"hello":1}', 'a.json'); } catch { threw = true; }
ok(threw, 'unrelated JSON is refused with a message');

if (failures) { console.error(`\n${failures} check(s) failed`); process.exit(1); }
console.log('\nall checks passed');
