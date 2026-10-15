/**
 * Anchors (flows, course categories) as DOM buttons laid over the canvas: crisp at any resolution,
 * themed by CSS, clickable and focusable. Positions are written with transforms once per rendered frame.
 */
import { Vector3, type PerspectiveCamera } from 'three';
import type { Vec3 } from '../domain/layout';

export interface AnchorDef { id: string; label: string; title: string; vec: Vec3 }

export class AnchorLabels {
  private els = new Map<string, { el: HTMLButtonElement; vec: Vec3 }>();
  private v = new Vector3();
  private n = new Vector3();
  private toCam = new Vector3();

  constructor(private layer: HTMLElement, anchors: readonly AnchorDef[], onClick: (id: string) => void, onHover: (id: string | null) => void) {
    for (const a of anchors) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'anchor';
      b.textContent = a.label;
      b.dataset.anchor = a.id;
      b.setAttribute('aria-label', a.title);
      b.addEventListener('click', () => onClick(a.id));
      b.addEventListener('pointerenter', () => onHover(a.id));
      b.addEventListener('pointerleave', () => onHover(null));
      b.addEventListener('focus', () => onHover(a.id));
      b.addEventListener('blur', () => onHover(null));
      layer.appendChild(b);
      this.els.set(a.id, { el: b, vec: a.vec });
    }
  }

  setStates(states: Readonly<Record<string, string | undefined>>, hot: string | null): void {
    for (const [id, { el }] of this.els) {
      el.dataset.state = states[id] ?? '';
      el.classList.toggle('hot', hot === id);
    }
  }

  update(camera: PerspectiveCamera, w: number, h: number): void {
    for (const { el, vec } of this.els.values()) {
      this.n.set(vec[0], vec[1], vec[2]);
      this.v.copy(this.n);
      this.toCam.copy(camera.position).sub(this.v).normalize();
      const facing = this.n.dot(this.toCam);
      this.v.project(camera);
      const x = (this.v.x * 0.5 + 0.5) * w, y = (-this.v.y * 0.5 + 0.5) * h;
      const front = facing > 0;
      const k = Math.max(0, Math.min(1, (facing + 0.15) / 0.3));
      el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, -50%) scale(${(0.82 + 0.18 * k).toFixed(3)})`;
      el.style.opacity = (0.22 + 0.78 * k).toFixed(3);
      el.style.zIndex = front ? '2' : '1';
      el.tabIndex = front ? 0 : -1;
      el.classList.toggle('back', !front);
    }
  }

  screenOf(id: string, camera: PerspectiveCamera, w: number, h: number): [number, number] | null {
    const a = this.els.get(id);
    if (!a) return null;
    const p = new Vector3(a.vec[0], a.vec[1], a.vec[2]).project(camera);
    return [(p.x * 0.5 + 0.5) * w, (-p.y * 0.5 + 0.5) * h];
  }

  /** anchors projected to CSS pixels, with how much each faces the camera (for snapshots) */
  projected(camera: PerspectiveCamera, w: number, h: number) {
    return [...this.els.entries()].map(([id, { el, vec }]) => {
      this.n.set(vec[0], vec[1], vec[2]);
      const facing = this.n.dot(this.toCam.copy(camera.position).sub(this.n).normalize());
      const p = this.v.set(vec[0], vec[1], vec[2]).project(camera);
      return { id, label: el.textContent ?? id, state: el.dataset.state ?? '', facing, x: (p.x * 0.5 + 0.5) * w, y: (-p.y * 0.5 + 0.5) * h };
    });
  }

  setVisible(v: boolean): void { this.layer.hidden = !v; }
}
