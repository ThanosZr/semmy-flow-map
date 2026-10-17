/**
 * Sphere 1: every allowed flow combination. Flows are anchors; links connect the selected
 * (and hovered) combination to its flows.
 */
import { Color } from 'three';
import { CATEGORIES, type FlowId } from '../data/catalog';
import { DIR, FLOW_ORDER, SHAPES } from '../data/rules';
import { COMBOS, type Combo } from '../domain/combos';
import { ANCHORS, layoutSphere, type Vec3 } from '../domain/layout';
import type { Settings } from '../state/settings';
import { LinksLayer, type LinkSpec } from './layers/LinksLayer';
import { SphereView, type CardAction, type CardTarget, type SphereParts } from './SphereView';
import type { Palette } from './theme';

export interface ComboGlobeCallbacks {
  onPick(key: string): void;
  onHover(key: string | null): void;
  onAnchorClick(f: FlowId): void;
  describe(key: string): string;
  describeAnchor(f: FlowId): string;
  pointActions(key: string): CardAction[];
  onPointAction(key: string, act: string): boolean;
  anchorActions(f: FlowId): CardAction[];
  onAnchorAction(f: FlowId, act: string): boolean;
  /** ECTS bounds of the 23 specialisation courses, and the overall spread (for the ECTS colour mode) */
  ects(key: string): { min: number; max: number } | null;
  ectsSpread(): [number, number];
}

/** three-stop scale for the ECTS colour mode: low → mid → high */
export function ectsColor(t: number, lo: Color, mid: Color, hi: Color, out = new Color()): Color {
  const u = Math.max(0, Math.min(1, t));
  return u < 0.5 ? out.copy(lo).lerp(mid, u * 2) : out.copy(mid).lerp(hi, (u - 0.5) * 2);
}

const ARC_SEGMENTS = { low: 24, medium: 48, high: 96 } as const;

export class ComboGlobe extends SphereView {
  private readonly links = new LinksLayer();
  private extHoverKey: string | null = null;
  private selected: string | null = null;
  private emphasisFlow: FlowId | null = null;
  private emphasisDir: string | null = null;
  private flowStates: Partial<Record<FlowId, string>> = {};
  private layoutTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(parts: SphereParts, settings: Settings, private cb: ComboGlobeCallbacks) {
    super(
      parts, settings,
      layoutSphere(COMBOS, { halfWeight: settings.halfWeight, spacing: settings.spacing, polePull: settings.polePull }),
      FLOW_ORDER.map(f => ({ id: f, label: f, title: `Ροή ${f}: ${CATEGORIES[f].name}`, vec: ANCHORS[f] })),
      'Σφαίρα με όλους τους επιτρεπτούς συνδυασμούς ροών',
    );
    this.scene.add(this.links.group);
    this.start();
  }

  /* ------------------------------------------------------------------ hooks */

  protected describePoint(i: number): string { return this.cb.describe(COMBOS[i].key); }
  protected describeAnchor(id: string): string { return this.cb.describeAnchor(id as FlowId); }
  protected pointActions(i: number): CardAction[] { return this.cb.pointActions(COMBOS[i].key); }
  protected anchorActions(id: string): CardAction[] { return this.cb.anchorActions(id as FlowId); }
  protected onCardAction(t: CardTarget, act: string): boolean {
    return t.kind === 'point' ? this.cb.onPointAction(COMBOS[t.i].key, act) : this.cb.onAnchorAction(t.id as FlowId, act);
  }
  protected onPointPick(i: number): void { this.cb.onPick(COMBOS[i].key); }
  protected onAnchorClick(id: string): void { this.cb.onAnchorClick(id as FlowId); }
  protected onAnchorHover(): void { this.refreshEmphasis(); }
  protected onHoverChange(): void {
    this.cb.onHover(this.hoverIndex >= 0 ? COMBOS[this.hoverIndex].key : null);
    this.refreshSelection();
    this.refreshLinks();
  }
  protected onResize(): void { this.links.setResolution(this.w, this.h); }

  protected applyPalette(): void {
    this.applyShellPalette();
    this.points.setColors(COMBOS.map(c => this.colorFor(c)));
    this.refreshLinks();
    this.loop.request();
  }

  protected applyExtraSettings(s: Settings, changed: ReadonlySet<keyof Settings>, prev: Settings): void {
    if (changed.has('detail') || changed.has('showLinks')) this.refreshLinks();
    if (changed.has('colorMode')) this.applyPalette();
    if ((changed.has('halfWeight') || changed.has('spacing') || changed.has('polePull'))
      && (prev.halfWeight !== s.halfWeight || prev.spacing !== s.spacing || prev.polePull !== s.polePull)) {
      clearTimeout(this.layoutTimer);
      this.layoutTimer = setTimeout(() => {
        this.points.setPositions(layoutSphere(COMBOS, { halfWeight: s.halfWeight, spacing: s.spacing, polePull: s.polePull }));
        this.refreshLinks();
        this.loop.request();
      }, 120);
    }
  }

  /* ------------------------------------------------------------------ state from the app */

  colorFor(c: Combo): Color {
    if (this.settings.colorMode === 'ects') {
      const e = this.cb.ects(c.key), [lo, hi] = this.cb.ectsSpread();
      if (e && hi > lo) {
        const p = this.palette;
        return ectsColor(((e.min + e.max) / 2 - lo) / (hi - lo), p['--shape-f3'], p['--dir-en'], p['--dir-es']);
      }
      return this.palette['--ink-3'];
    }
    const tok = this.settings.colorMode === 'shape' ? SHAPES[c.shape].token : DIR[c.dir].token;
    return this.palette[tok as keyof Palette];
  }

  /** colours depend on outside data (ECTS mode) */
  refreshColors(): void { this.applyPalette(); }

  setActive(keys: ReadonlySet<string>): void {
    const t = new Float32Array(COMBOS.length);
    COMBOS.forEach((c, i) => { t[i] = keys.has(c.key) ? 1 : 0; });
    if (this.points.setActive(t)) this.loop.request();
  }

  setSelected(key: string | null): void {
    if (key === this.selected) return;
    this.selected = key;
    this.refreshSelection();
    this.refreshLinks();
    this.loop.request();
  }

  /** hover coming from the side panels (list rows, flow rows, direction cards) */
  setExternalHover(h: { key: string | null; flow: string | null; dir: string | null }): void {
    if (h.key === this.extHoverKey && h.flow === this.emphasisFlow && h.dir === this.emphasisDir) return;
    this.extHoverKey = h.key;
    this.emphasisFlow = h.flow as FlowId | null;
    this.emphasisDir = h.dir;
    this.refreshEmphasis();
    this.refreshSelection();
    this.refreshLinks();
    this.loop.request();
  }

  setFlowStates(states: Partial<Record<FlowId, string>>): void {
    this.flowStates = { ...states };
    this.labels.setStates(this.flowStates, (this.hotAnchor as FlowId | null) ?? this.emphasisFlow);
  }

  focus(key: string): void {
    const c = COMBOS.find(x => x.key === key);
    if (!c) return;
    const q = this.points.positionOf(c.index, this.tmp);
    this.flyToward(q[0], q[1], q[2]);
  }

  focusOnSet(keys: ReadonlySet<string>): void {
    this.focusOnIndices(COMBOS.filter(c => keys.has(c.key)).map(c => c.index));
  }

  /* ------------------------------------------------------------------ internals */

  private refreshEmphasis(): void {
    const e = new Float32Array(COMBOS.length).fill(1);
    const flow = (this.hotAnchor as FlowId | null) ?? this.emphasisFlow;
    if (flow || this.emphasisDir) {
      COMBOS.forEach((c, i) => {
        if (flow && !c.flows[flow]) e[i] = 0.2;
        if (this.emphasisDir && c.dir !== this.emphasisDir) e[i] = 0.2;
      });
    }
    this.points.setEmphasis(e);
    this.labels.setStates(this.flowStates, flow);
    this.loop.request();
  }

  private hoveredKey(): string | null {
    return this.hoverIndex >= 0 ? COMBOS[this.hoverIndex].key : this.extHoverKey;
  }

  private refreshSelection(): void {
    const s = new Float32Array(COMBOS.length);
    const hk = this.hoveredKey();
    COMBOS.forEach((c, i) => { if (c.key === this.selected) s[i] = 2; else if (c.key === hk) s[i] = 1; });
    this.points.setSelection(s);
  }

  private refreshLinks(): void {
    if (!this.settings.showLinks) { this.links.set([], 2); return; }
    const specs: LinkSpec[] = [];
    const add = (key: string | null, strong: boolean) => {
      const c = key ? COMBOS.find(x => x.key === key) : undefined;
      if (!c) return;
      const from = this.points.positionOf(c.index, [0, 0, 0]) as Vec3;
      for (const f of c.order) specs.push({ from: [...from] as Vec3, to: ANCHORS[f], color: this.colorFor(c), half: c.flows[f] === 'H', strong });
    };
    add(this.selected, true);
    const hk = this.hoveredKey();
    if (hk !== this.selected) add(hk, false);
    this.links.set(specs, ARC_SEGMENTS[this.settings.detail]);
  }
}
