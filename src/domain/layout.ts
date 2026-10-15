/**
 * Places the combinations on a unit sphere.
 * Each flow is an anchor; a combination sits at the weighted centroid of its flows
 * (full = 1, half = `halfWeight`), then a short relaxation pass keeps points apart.
 * Ο and Ι sit on the poles and pull `polePull` times harder, so their combinations
 * form a ring around them instead of sinking to the equator next to the direction's own flows.
 */
import type { FlowId } from '../data/catalog';
import type { Combo } from './combos';

export type Vec3 = [number, number, number];

/** Anchor positions as [latitude, longitude] in degrees.
 *  The 8 core flows ring the equator with each direction's pair side by side;
 *  Ο (management) and Ι (biomedical) sit on the poles: they join any direction, only through rule (α). */
export const ANCHOR_LATLON: Readonly<Record<FlowId, [number, number]>> = {
  'Υ': [14, 0], 'Λ': [-14, 45], 'Δ': [14, 90], 'Τ': [-14, 135],
  'Ζ': [14, 180], 'Ε': [-14, 225], 'Σ': [14, 270], 'Η': [-14, 315],
  'Ο': [90, 0], 'Ι': [-90, 0],
};

export function fromLatLon(lat: number, lon: number): Vec3 {
  const a = (lat * Math.PI) / 180, b = (lon * Math.PI) / 180;
  return [Math.cos(a) * Math.sin(b), Math.sin(a), Math.cos(a) * Math.cos(b)];
}

export function normalize(v: Vec3): Vec3 {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

export const ANCHORS: Readonly<Record<FlowId, Vec3>> = Object.fromEntries(
  Object.entries(ANCHOR_LATLON).map(([f, [la, lo]]) => [f, fromLatLon(la, lo)]),
) as Record<FlowId, Vec3>;

export interface LayoutParams {
  /** weight of a half flow relative to a full one */
  halfWeight: number;
  /** minimum chord distance between two points */
  spacing: number;
  /** weight multiplier of the polar flows Ο and Ι (1 = plain centroid) */
  polePull: number;
  iterations?: number;
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/** Returns xyz triples (length 3·n) on the unit sphere, in the order of `combos`. */
export function layoutSphere(combos: readonly Combo[], p: LayoutParams): Float32Array {
  const n = combos.length;
  const P: Vec3[] = [];
  const T: Vec3[] = [];
  for (const c of combos) {
    const v: Vec3 = [0, 0, 0];
    for (const f of c.order) {
      const w = (c.flows[f] === 'F' ? 1 : p.halfWeight) * (f === 'Ο' || f === 'Ι' ? p.polePull : 1);
      const a = ANCHORS[f];
      v[0] += a[0] * w; v[1] += a[1] * w; v[2] += a[2] * w;
    }
    const t = normalize(v);
    T.push(t);
    // deterministic jitter so coincident centroids (same flows, another direction) can separate
    const h = hash(c.key);
    const jit = (k: number) => ((((h >>> k) & 255) / 255) - 0.5) * 0.05;
    P.push(normalize([t[0] + jit(0), t[1] + jit(8), t[2] + jit(16)]));
  }

  const dmin = p.spacing, amin = p.spacing * 1.8;
  const anchors = Object.values(ANCHORS);
  const iters = p.iterations ?? 170;
  for (let it = 0; it < iters; it++) {
    for (let i = 0; i < n; i++) {
      const a = P[i];
      for (let j = i + 1; j < n; j++) {
        const b = P[j];
        const dx = a[0] - b[0], dy = a[1] - b[1], dz = a[2] - b[2];
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < dmin * dmin) {
          const d = Math.sqrt(d2) || 1e-6, k = ((dmin - d) / d) * 0.5;
          a[0] += dx * k; a[1] += dy * k; a[2] += dz * k;
          b[0] -= dx * k; b[1] -= dy * k; b[2] -= dz * k;
        }
      }
      for (const q of anchors) {
        const dx = a[0] - q[0], dy = a[1] - q[1], dz = a[2] - q[2];
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < amin * amin) {
          const d = Math.sqrt(d2) || 1e-6, k = (amin - d) / d;
          a[0] += dx * k; a[1] += dy * k; a[2] += dz * k;
        }
      }
    }
    for (let i = 0; i < n; i++) {
      const a = P[i], t = T[i];
      P[i] = normalize([a[0] + (t[0] - a[0]) * 0.035, a[1] + (t[1] - a[1]) * 0.035, a[2] + (t[2] - a[2]) * 0.035]);
    }
  }
  const out = new Float32Array(n * 3);
  P.forEach((v, i) => out.set(v, i * 3));
  return out;
}

/** Points of the great-circle arc from a to b (both unit vectors), lifted to `radius`. */
export function greatArc(a: Vec3, b: Vec3, segments: number, radius: number): number[] {
  const d = Math.min(1, Math.max(-1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]));
  const th = Math.acos(d), s = Math.sin(th) || 1e-6;
  const out: number[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments, w1 = Math.sin((1 - t) * th) / s, w2 = Math.sin(t * th) / s;
    out.push((a[0] * w1 + b[0] * w2) * radius, (a[1] * w1 + b[1] * w2) * radius, (a[2] * w1 + b[2] * w2) * radius);
  }
  return out;
}
