/**
 * Great-circle links from a combination to its flows, drawn with fat lines (Line2).
 * Full flows are solid, half flows dashed. Only the selected and the hovered combination get links,
 * so this is at most a handful of draw calls.
 */
import { Color, Group } from 'three';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { greatArc, type Vec3 } from '../../domain/layout';

export interface LinkSpec { from: Vec3; to: Vec3; color: Color; half: boolean; strong: boolean }

const POOL = 10;

export class LinksLayer {
  readonly group = new Group();
  private lines: Line2[] = [];
  private mats: { solid: LineMaterial; dashed: LineMaterial }[] = [];

  constructor() {
    for (let i = 0; i < POOL; i++) {
      const common = { transparent: true, depthTest: true, depthWrite: false, worldUnits: false } as const;
      const solid = new LineMaterial({ ...common, linewidth: 2 });
      const dashed = new LineMaterial({ ...common, linewidth: 1.6, dashed: true, dashSize: 0.035, gapSize: 0.025 });
      const line = new Line2(new LineGeometry(), solid);
      line.visible = false;
      line.renderOrder = 3;
      line.frustumCulled = false;
      this.lines.push(line);
      this.mats.push({ solid, dashed });
      this.group.add(line);
    }
  }

  setResolution(w: number, h: number): void {
    for (const m of this.mats) { m.solid.resolution.set(w, h); m.dashed.resolution.set(w, h); }
  }

  set(specs: LinkSpec[], quality: number): void {
    this.lines.forEach((line, i) => {
      const s = specs[i];
      if (!s) { line.visible = false; return; }
      const m = s.half ? this.mats[i].dashed : this.mats[i].solid;
      m.color.copy(s.color);
      m.opacity = s.strong ? 0.95 : 0.6;
      m.linewidth = (s.half ? 1.6 : 2.2) * (s.strong ? 1 : 0.8);
      line.material = m;
      const geo = new LineGeometry();
      geo.setPositions(greatArc(s.from, s.to, quality, 1.006));
      line.geometry.dispose();
      line.geometry = geo;
      if (s.half) line.computeLineDistances();
      line.visible = true;
    });
  }

  dispose(): void {
    this.lines.forEach(l => l.geometry.dispose());
    this.mats.forEach(m => { m.solid.dispose(); m.dashed.dispose(); });
  }
}
