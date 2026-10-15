/**
 * All combinations as one `THREE.Points` draw call.
 * Per-point attributes carry colour, the active/inactive transition, emphasis and selection rings;
 * transitions run in the vertex shader, driven by two uniforms, so the CPU only touches buffers on change.
 */
import { BufferAttribute, BufferGeometry, Color, DynamicDrawUsage, Points, ShaderMaterial } from 'three';

const vert = /* glsl */`
attribute vec3 aPrev;
attribute vec3 aColor;
attribute float aFrom;
attribute float aTo;
attribute float aEmph;
attribute float aSel;
uniform float uMorph;
uniform float uT;
uniform float uSize;
uniform float uPR;
uniform float uRef;
varying vec3 vColor;
varying float vActive;
varying float vFace;
varying float vEmph;
varying float vSel;
varying float vDot;
void main() {
  vec3 p = mix(aPrev, position, uMorph);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vec3 n = normalize((modelViewMatrix * vec4(p, 0.0)).xyz);
  vFace = dot(n, normalize(-mv.xyz));
  vActive = mix(aFrom, aTo, uT);
  vColor = aColor;
  vEmph = aEmph;
  vSel = aSel;
  float persp = uRef / max(-mv.z, 0.001);
  float depth = mix(0.72, 1.0, clamp(vFace * 0.5 + 0.5, 0.0, 1.0));
  float dotPx = uSize * mix(0.42, 1.0, vActive) * depth * persp;
  float spritePx = aSel > 0.5 ? max(dotPx * 2.4, uSize * 2.0 * persp) : dotPx;
  vDot = dotPx / spritePx;
  gl_PointSize = spritePx * uPR;
  gl_Position = projectionMatrix * mv;
}`;

const frag = /* glsl */`
uniform vec3 uOff;
uniform vec3 uInk;
uniform float uOffAlpha;
uniform float uBackAlpha;
varying vec3 vColor;
varying float vActive;
varying float vFace;
varying float vEmph;
varying float vSel;
varying float vDot;
void main() {
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  float r = length(c);
  float aa = max(fwidth(r), 0.002) * 1.2;
  float dotMask = 1.0 - smoothstep(vDot - aa, vDot, r);
  float vis = mix(uBackAlpha, 1.0, smoothstep(-0.12, 0.12, vFace));
  vec3 col = mix(uOff, vColor, vActive);
  float a = mix(uOffAlpha, 1.0, vActive) * vis * vEmph * dotMask;
  vec4 outc = vec4(col, a);
  if (vSel > 0.5) {
    bool strong = vSel > 1.5;
    float ringR = strong ? 0.84 : 0.8;
    float w = strong ? 0.085 : 0.055;
    float ring = 1.0 - smoothstep(w - aa, w + aa * 0.5, abs(r - ringR));
    float ra = ring * vis * (strong ? 1.0 : 0.8);
    outc = vec4(mix(outc.rgb, uInk, ring), max(outc.a, ra));
  }
  if (outc.a < 0.004) discard;
  gl_FragColor = outc;
}`;

const ease = (t: number) => t * t * (3 - 2 * t);

export class PointsLayer {
  readonly object: Points<BufferGeometry, ShaderMaterial>;
  readonly count: number;
  private pos: Float32Array;
  private prev: Float32Array;
  private from: Float32Array;
  private to: Float32Array;
  private morphT = 1;
  private activeT = 1;

  constructor(positions: Float32Array) {
    this.count = positions.length / 3;
    const n = this.count;
    this.pos = positions.slice();
    this.prev = positions.slice();
    this.from = new Float32Array(n).fill(1);
    this.to = new Float32Array(n).fill(1);
    const g = new BufferGeometry();
    const dyn = (a: BufferAttribute) => a.setUsage(DynamicDrawUsage);
    g.setAttribute('position', dyn(new BufferAttribute(this.pos, 3)));
    g.setAttribute('aPrev', dyn(new BufferAttribute(this.prev, 3)));
    g.setAttribute('aColor', dyn(new BufferAttribute(new Float32Array(n * 3), 3)));
    g.setAttribute('aFrom', dyn(new BufferAttribute(this.from, 1)));
    g.setAttribute('aTo', dyn(new BufferAttribute(this.to, 1)));
    g.setAttribute('aEmph', dyn(new BufferAttribute(new Float32Array(n).fill(1), 1)));
    g.setAttribute('aSel', dyn(new BufferAttribute(new Float32Array(n), 1)));
    g.computeBoundingSphere();
    const m = new ShaderMaterial({
      vertexShader: vert, fragmentShader: frag, transparent: true, depthTest: false, depthWrite: false,
      uniforms: {
        uMorph: { value: 1 }, uT: { value: 1 }, uSize: { value: 9 }, uPR: { value: 1 }, uRef: { value: 4 },
        uOff: { value: new Color() }, uInk: { value: new Color() }, uOffAlpha: { value: 0.3 }, uBackAlpha: { value: 0.22 },
      },
    });
    this.object = new Points(g, m);
    this.object.frustumCulled = false;
    this.object.renderOrder = 2;
  }

  private attr(name: string) { return this.object.geometry.getAttribute(name) as BufferAttribute; }
  get uniforms() { return this.object.material.uniforms; }

  /** current on-screen position of point i (accounts for a running morph) */
  positionOf(i: number, out: [number, number, number]): [number, number, number] {
    const m = ease(this.morphT), o = i * 3;
    out[0] = this.prev[o] + (this.pos[o] - this.prev[o]) * m;
    out[1] = this.prev[o + 1] + (this.pos[o + 1] - this.prev[o + 1]) * m;
    out[2] = this.prev[o + 2] + (this.pos[o + 2] - this.prev[o + 2]) * m;
    return out;
  }

  activeOf(i: number): number { return this.from[i] + (this.to[i] - this.from[i]) * ease(this.activeT); }

  setColors(colors: Color[]): void {
    const a = this.attr('aColor');
    colors.forEach((c, i) => a.setXYZ(i, c.r, c.g, c.b));
    a.needsUpdate = true;
  }

  /** start an active-state transition; returns false if nothing changed */
  setActive(target: Float32Array): boolean {
    let changed = false;
    for (let i = 0; i < this.count; i++) if (target[i] !== this.to[i]) { changed = true; break; }
    if (!changed) return false;
    for (let i = 0; i < this.count; i++) this.from[i] = this.activeOf(i);
    this.to.set(target);
    this.attr('aFrom').needsUpdate = true;
    this.attr('aTo').needsUpdate = true;
    this.activeT = 0;
    this.uniforms.uT.value = 0;
    return true;
  }

  /** start a layout morph to new positions */
  setPositions(next: Float32Array): void {
    const tmp: [number, number, number] = [0, 0, 0];
    for (let i = 0; i < this.count; i++) this.prev.set(this.positionOf(i, tmp), i * 3);
    this.pos.set(next);
    this.attr('position').needsUpdate = true;
    this.attr('aPrev').needsUpdate = true;
    this.morphT = 0;
    this.uniforms.uMorph.value = 0;
  }

  setEmphasis(e: Float32Array): void { (this.attr('aEmph').array as Float32Array).set(e); this.attr('aEmph').needsUpdate = true; }
  setSelection(s: Float32Array): void { (this.attr('aSel').array as Float32Array).set(s); this.attr('aSel').needsUpdate = true; }

  /** advance transitions; `dur` in seconds (0 = instant). Returns true while something is still moving. */
  step(dt: number, dur: number): boolean {
    const k = dur > 0 ? dt / dur : 1;
    let moving = false;
    if (this.activeT < 1) { this.activeT = Math.min(1, this.activeT + k); this.uniforms.uT.value = ease(this.activeT); moving = true; }
    if (this.morphT < 1) { this.morphT = Math.min(1, this.morphT + k * 0.6); this.uniforms.uMorph.value = ease(this.morphT); moving = true; }
    return moving;
  }

  dispose(): void { this.object.geometry.dispose(); this.object.material.dispose(); }
}
