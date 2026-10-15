/**
 * Sphere 2: every course of semesters 6–9, grouped around its flow (same anchors as sphere 1)
 * or category. It shows the plan of the selected combination, or previews a hovered one:
 * courses in the plan are full size with a ring, options of the chosen flows are medium,
 * everything that could still be a free course is small.
 */
import type { Color } from 'three';
import { CATEGORIES, COURSES, type CatId, type FlowId } from '../data/catalog';
import { DIR } from '../data/rules';
import type { Combo } from '../domain/combos';
import { CAT_ANCHORS, COURSE_CATS, COURSE_IDS, IN_PLAN, layoutCourses, type CourseState } from '../domain/courses';
import type { Settings } from '../state/settings';
import { SphereView, type SphereParts } from './SphereView';

export interface CourseGlobeCallbacks {
  onPick(id: string): void;
  describe(id: string): string;
  describeAnchor(cat: CatId): string;
  onAnchorClick(cat: CatId): void;
}

const ACTIVE: Record<CourseState, number> = { req: 1, on: 1, free: 1, core: 1, grp: 0.85, opt: 0.62, pool: 0.3, idle: 0.55, na: 0 };

export class CourseGlobe extends SphereView {
  private states = new Map<string, CourseState>();
  private combo: Combo | null = null;

  constructor(parts: SphereParts, settings: Settings, private cb: CourseGlobeCallbacks) {
    super(
      parts, settings, layoutCourses(),
      COURSE_CATS.map(cat => ({ id: cat, label: cat, title: `${cat}: ${CATEGORIES[cat].name}`, vec: CAT_ANCHORS[cat] })),
      'Σφαίρα με τα μαθήματα 6ου–9ου εξαμήνου',
    );
    this.start();
  }

  protected describePoint(i: number): string { return this.cb.describe(COURSE_IDS[i]); }
  protected describeAnchor(id: string): string { return this.cb.describeAnchor(id as CatId); }
  protected onPointPick(i: number): void { this.cb.onPick(COURSE_IDS[i]); }
  protected onAnchorClick(id: string): void { this.cb.onAnchorClick(id as CatId); }
  protected onAnchorHover(): void { this.refreshEmphasis(); }
  protected onHoverChange(): void { this.refreshRings(); }

  protected applyPalette(): void {
    this.applyShellPalette();
    this.points.setColors(COURSE_IDS.map(id => this.colorOf(id)));
    this.loop.request();
  }

  private colorOf(id: string): Color {
    const st = this.states.get(id) ?? 'idle';
    const p = this.palette;
    if (st === 'free') return p['--accent'];
    if (st === 'core') return p['--ink'];
    if (this.combo && (COURSES[id].cat as FlowId) in this.combo.flows) return p[DIR[this.combo.dir].token as keyof typeof p];
    return p['--ink-3'];
  }

  /** show the plan of `combo` (selected, or a hovered preview) */
  setPlan(combo: Combo | null, states: ReadonlyMap<string, CourseState>): void {
    this.combo = combo;
    this.states = new Map(states);
    const t = new Float32Array(COURSE_IDS.length);
    COURSE_IDS.forEach((id, i) => { t[i] = ACTIVE[this.states.get(id) ?? 'idle']; });
    this.points.setActive(t);
    this.points.setColors(COURSE_IDS.map(id => this.colorOf(id)));
    this.refreshRings();
    const anchorStates: Record<string, string> = {};
    if (combo) for (const f of combo.order) anchorStates[f] = combo.flows[f]!;
    this.labels.setStates(anchorStates, this.hotAnchor);
    this.loop.request();
  }

  /** turn toward the chosen flows */
  focusOnFlows(combo: Combo): void {
    const idx: number[] = [];
    COURSE_IDS.forEach((id, i) => { if ((COURSES[id].cat as FlowId) in combo.flows) idx.push(i); });
    this.focusOnIndices(idx, 0.15);
  }

  private refreshRings(): void {
    const s = new Float32Array(COURSE_IDS.length);
    COURSE_IDS.forEach((id, i) => { if (IN_PLAN.has(this.states.get(id) ?? 'idle')) s[i] = 1; });
    if (this.hoverIndex >= 0) s[this.hoverIndex] = 2;
    this.points.setSelection(s);
    this.loop.request();
  }

  private refreshEmphasis(): void {
    const e = new Float32Array(COURSE_IDS.length).fill(1);
    if (this.hotAnchor) COURSE_IDS.forEach((id, i) => { if (COURSES[id].cat !== this.hotAnchor) e[i] = 0.2; });
    this.points.setEmphasis(e);
    this.loop.request();
  }
}
