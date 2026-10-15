/**
 * The globe itself: a translucent sphere with a fresnel rim, plus a graticule whose far side fades out.
 * The sphere writes depth so flow links on the far side are hidden; points and grid do their own fading.
 */
import {
  BufferGeometry, Color, Float32BufferAttribute, Group, LineSegments, Mesh, ShaderMaterial, SphereGeometry,
} from 'three';
import { fromLatLon } from '../../domain/layout';
import type { Detail } from '../../state/settings';

const DETAIL = {
  low: { seg: [32, 24], arc: 72 },
  medium: { seg: [64, 48], arc: 144 },
  high: { seg: [128, 96], arc: 288 },
} as const;

const sphereVert = /* glsl */`
varying vec3 vN;
varying vec3 vV;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vN = normalize((modelViewMatrix * vec4(normal, 0.0)).xyz);
  vV = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;

const sphereFrag = /* glsl */`
uniform vec3 uFill;
uniform vec3 uRim;
uniform float uFillAlpha;
varying vec3 vN;
varying vec3 vV;
void main() {
  float f = 1.0 - clamp(dot(normalize(vN), normalize(vV)), 0.0, 1.0);
  float rim = pow(f, 3.0);
  vec3 col = mix(uFill, uRim, rim * 0.5);
  gl_FragColor = vec4(col, uFillAlpha + rim * 0.5);
}`;

const gridVert = /* glsl */`
varying float vFace;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vec3 n = normalize((modelViewMatrix * vec4(position, 0.0)).xyz);
  vFace = dot(n, normalize(-mv.xyz));
  gl_Position = projectionMatrix * mv;
}`;

const gridFrag = /* glsl */`
uniform vec3 uColor;
uniform float uFront;
uniform float uBack;
varying float vFace;
void main() {
  float a = mix(uBack, uFront, smoothstep(-0.04, 0.04, vFace));
  gl_FragColor = vec4(uColor, a);
}`;

function gridMaterial(front: number, back: number) {
  return new ShaderMaterial({
    vertexShader: gridVert, fragmentShader: gridFrag, transparent: true, depthWrite: false, depthTest: false,
    uniforms: { uColor: { value: new Color() }, uFront: { value: front }, uBack: { value: back } },
  });
}

function circles(detail: Detail, lats: number[], lons: number[]) {
  const n = DETAIL[detail].arc;
  const pos: number[] = [];
  const seg = (pts: number[][]) => { for (let i = 0; i < pts.length - 1; i++) pos.push(...pts[i], ...pts[i + 1]); };
  for (const lat of lats) {
    const pts: number[][] = [];
    for (let i = 0; i <= n; i++) pts.push(fromLatLon(lat, (i / n) * 360));
    seg(pts);
  }
  for (const lon of lons) {
    const b = (lon * Math.PI) / 180, pts: number[][] = [];
    for (let i = 0; i <= n; i++) { const t = (i / n) * Math.PI * 2; pts.push([Math.cos(t) * Math.sin(b), Math.sin(t), Math.cos(t) * Math.cos(b)]); }
    seg(pts);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  return g;
}

export class GlobeShell {
  readonly group = new Group();
  private sphere: Mesh<SphereGeometry, ShaderMaterial>;
  private grid: LineSegments<BufferGeometry, ShaderMaterial>;
  private equator: LineSegments<BufferGeometry, ShaderMaterial>;

  constructor(detail: Detail) {
    const [w, h] = DETAIL[detail].seg;
    this.sphere = new Mesh(
      new SphereGeometry(0.992, w, h),
      new ShaderMaterial({
        vertexShader: sphereVert, fragmentShader: sphereFrag, transparent: true, depthWrite: true,
        uniforms: { uFill: { value: new Color() }, uRim: { value: new Color() }, uFillAlpha: { value: 0.55 } },
      }),
    );
    this.sphere.renderOrder = 0;
    this.grid = new LineSegments(circles(detail, [-60, -30, 30, 60], [0, 30, 60, 90, 120, 150]), gridMaterial(0.16, 0.06));
    this.grid.renderOrder = 1;
    this.equator = new LineSegments(circles(detail, [0], []), gridMaterial(0.42, 0.14));
    this.equator.renderOrder = 1;
    this.group.add(this.sphere, this.grid, this.equator);
  }

  setDetail(detail: Detail): void {
    const [w, h] = DETAIL[detail].seg;
    this.sphere.geometry.dispose();
    this.sphere.geometry = new SphereGeometry(0.992, w, h);
    this.grid.geometry.dispose();
    this.grid.geometry = circles(detail, [-60, -30, 30, 60], [0, 30, 60, 90, 120, 150]);
    this.equator.geometry.dispose();
    this.equator.geometry = circles(detail, [0], []);
  }

  setColors(fill: Color, ink: Color, dark: boolean): void {
    this.sphere.material.uniforms.uFill.value.copy(fill);
    this.sphere.material.uniforms.uRim.value.copy(ink);
    this.sphere.material.uniforms.uFillAlpha.value = dark ? 0.62 : 0.55;
    this.grid.material.uniforms.uColor.value.copy(ink);
    this.equator.material.uniforms.uColor.value.copy(ink);
  }

  setGridVisible(v: boolean): void { this.grid.visible = v; this.equator.visible = v; }

  dispose(): void {
    for (const o of [this.sphere, this.grid, this.equator]) { o.geometry.dispose(); o.material.dispose(); }
  }
}
