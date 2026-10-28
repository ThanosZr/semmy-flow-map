/**
 * Shared machinery for a Three.js sphere of points: renderer lifecycle, camera and controls,
 * the on-demand render loop, anchors, picking, tooltips and the rendering settings.
 * Subclasses add content (ComboGlobe, CourseGlobe) and must call `start()` at the end of their constructor.
 *
 * Performance notes
 * - Renders on demand (RenderLoop). Idle = no frames. Auto-rotation is opt-in and respects the FPS cap.
 * - Paused while its view is hidden, the tab is hidden, or the canvas is off screen.
 * - All points are one draw call; the sphere and the graticule are three more.
 */
import {
  ColorManagement, LinearSRGBColorSpace, PerspectiveCamera, Quaternion, Scene, Vector2, Vector3, WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { pixelRatioFor, type Settings, type TouchMode } from '../state/settings';
import { AnchorLabels, type AnchorDef } from './AnchorLabels';
import { GlobeShell } from './layers/GlobeShell';
import { PointsLayer } from './layers/PointsLayer';
import { RenderLoop } from './RenderLoop';
import { onThemeChange, readPalette, type Palette } from './theme';

ColorManagement.enabled = false; // CSS colours go to the GPU as authored; no linear/sRGB round-trip

export interface RenderStats {
  webgl: string;
  fps: number;
  idle: boolean;
  paused: boolean;
  pixelRatio: number;
  buffer: [number, number];
  calls: number;
  triangles: number;
  points: number;
  frames: number;
  gpu: string;
}

export interface CardAction { id: string; label: string; primary?: boolean; pressed?: boolean }
export type CardTarget = { kind: 'point'; i: number } | { kind: 'anchor'; id: string };

export interface SphereParts {
  host: HTMLElement;
  glLayer: HTMLElement;
  labelsLayer: HTMLElement;
  tip: HTMLElement;
  msg: HTMLElement;
}

const FOV = 32;
const MIN_DIST = 2.2, MAX_DIST = 9;
/** mouse wheel: distance factor for one standard notch (deltaY 100 px) at zoom speed 1 */
const WHEEL_STEP = 1.08;
/** one wheel event never counts for more than a standard notch, so ×3 / fast-scroll wheels stay gentle */
const WHEEL_NOTCH = 100;
/** the zoom target never runs further than this factor ahead of the current distance */
const ZOOM_LEAD = 1.3;
/** highest camera latitude for automatic moves (keeps OrbitControls away from the pole singularity) */
const MAX_FLY_Y = Math.sin((78 * Math.PI) / 180);

export abstract class SphereView {
  protected renderer: WebGLRenderer | null = null;
  protected controls: OrbitControls | null = null;
  protected readonly scene = new Scene();
  protected readonly camera = new PerspectiveCamera(FOV, 1, 0.1, 50);
  protected readonly loop: RenderLoop;
  protected readonly shell: GlobeShell;
  protected readonly points: PointsLayer;
  protected readonly labels: AnchorLabels;
  protected palette: Palette;
  protected settings: Settings;
  protected w = 1;
  protected h = 1;
  /** last size while visible, so a snapshot works while the view is hidden (plan view) */
  private shown = { w: 640, h: 640 };
  protected fitDist = 4;
  protected hoverIndex = -1;
  protected hotAnchor: string | null = null;
  protected readonly tmp: [number, number, number] = [0, 0, 0];
  private userZoomed = false;
  /** camera distance the wheel zoom is easing toward */
  private zoomTo: number | null = null;
  /** camera move along a great circle: `from` rotated by an increasing share of `q` */
  private fly: { from: Vector3; q: Quaternion; t: number; dur: number; dist: number } | null = null;
  private readonly qStep = new Quaternion();
  private readonly v = new Vector3();
  private pointerInside = false;
  private down: { x: number; y: number; moved: number } | null = null;
  /** what a finger does on this sphere (mouse and pen are not affected) */
  private touchMode: TouchMode = 'rotate';
  private exploring = false;
  /** a pinned card (touch): info plus action buttons */
  private card: CardTarget | null = null;
  /** the pinned card came from a mouse click: compact, and hovering another point replaces it */
  private cardMini = false;
  private visible = { page: true, onscreen: true, view: true };
  private gpuName = '';
  private webglVersion = '';
  private lost = false;

  protected constructor(
    protected parts: SphereParts,
    settings: Settings,
    positions: Float32Array,
    anchors: readonly AnchorDef[],
    private ariaLabel: string,
  ) {
    this.settings = { ...settings };
    this.palette = readPalette();
    this.loop = new RenderLoop(f => this.frame(f.dt));
    this.loop.fpsCap = settings.fpsCap;
    this.points = new PointsLayer(positions);
    this.shell = new GlobeShell(settings.detail);
    this.scene.add(this.shell.group, this.points.object);
    this.labels = new AnchorLabels(parts.labelsLayer, anchors,
      (id, type) => (type === 'touch' ? this.openCard({ kind: 'anchor', id }) : this.onAnchorClick(id)),
      id => {
        if (this.card) return; // a pinned card owns the emphasis until it closes
        this.hotAnchor = id; this.onAnchorHover(id); this.showAnchorTip(id);
      });
    parts.tip.addEventListener('click', e => {
      const b = (e.target as Element).closest<HTMLElement>('[data-card-act]');
      if (!b || !this.card) return;
      const act = b.dataset.cardAct!;
      if (act === 'close') { this.closeCard(); return; }
      const target = this.card;
      if (this.onCardAction(target, act)) setTimeout(() => { if (this.card === target) this.renderCard(); }, 30);
      else this.closeCard();
    });
    this.camera.position.set(0, 0.9, 4);
    this.camera.lookAt(0, 0, 0);
  }

  /* ------------------------------------------------------------------ subclass hooks */

  protected abstract describePoint(i: number): string;
  protected abstract describeAnchor(id: string): string;
  protected abstract onPointPick(i: number): void;
  protected abstract onAnchorClick(id: string): void;
  /** colours of points and links from `this.palette` */
  protected abstract applyPalette(): void;
  protected onAnchorHover(_id: string | null): void { /* optional */ }
  protected onHoverChange(): void { /* optional */ }
  protected onResize(): void { /* optional */ }
  protected applyExtraSettings(_s: Settings, _changed: ReadonlySet<keyof Settings>, _prev: Settings): void { /* optional */ }
  /** buttons on the touch card of a point / an anchor */
  protected pointActions(_i: number): CardAction[] { return []; }
  /** buttons on the small card a mouse click on a point opens (none: a plain tooltip, as before) */
  protected clickActions(_i: number): CardAction[] { return []; }
  protected anchorActions(_id: string): CardAction[] { return []; }
  /** a card button was pressed; return true to keep the card open (it is redrawn) */
  protected onCardAction(_t: CardTarget, _act: string): boolean { return false; }

  /** finish construction once subclass fields exist */
  protected start(): void {
    this.applyPalette();
    this.applyPointUniforms();
    this.shell.setGridVisible(this.settings.showGrid);
    this.labels.setVisible(this.settings.showLabels);
    this.createRenderer();
    new ResizeObserver(() => this.resize()).observe(this.parts.host);
    window.addEventListener('resize', () => this.resize()); // also fires when the device-pixel ratio changes
    this.resize();
    onThemeChange(() => { this.palette = readPalette(); this.applyPalette(); this.loop.request(); });
    document.addEventListener('visibilitychange', () => { this.visible.page = !document.hidden; this.updatePaused(); });
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(es => { this.visible.onscreen = es[0].isIntersecting; this.updatePaused(); }).observe(this.parts.host);
    }
  }

  /* ------------------------------------------------------------------ renderer lifecycle */

  private createRenderer(): void {
    this.controls?.dispose();
    this.controls = null;
    if (this.renderer) {
      this.renderer.dispose();
      this.renderer.forceContextLoss();
      this.renderer.domElement.remove();
      this.renderer = null;
    }
    let r: WebGLRenderer;
    try {
      r = new WebGLRenderer({ antialias: this.settings.msaa, alpha: true, powerPreference: this.settings.gpu, stencil: false });
    } catch {
      this.showMessage('Η συσκευή δεν παρέχει WebGL, οπότε η σφαίρα δεν μπορεί να σχεδιαστεί. Τα φίλτρα, η λίστα και το πλάνο λειτουργούν κανονικά.');
      return;
    }
    r.outputColorSpace = LinearSRGBColorSpace;
    r.setClearColor(0x000000, 0);
    r.setPixelRatio(pixelRatioFor(this.settings.resolution));
    r.setSize(this.w, this.h, false);
    const c = r.domElement;
    c.className = 'gl-canvas';
    c.setAttribute('role', 'img');
    c.setAttribute('aria-label', this.ariaLabel);
    // a renderer we replaced (MSAA / GPU change) also fires these; only the current canvas counts
    c.addEventListener('webglcontextlost', e => {
      if (this.renderer?.domElement !== c) return;
      e.preventDefault(); this.lost = true;
      this.showMessage('Η GPU απελευθέρωσε το γραφικό πλαίσιο. Θα επανέλθει μόλις επιτραπεί.');
    });
    c.addEventListener('webglcontextrestored', () => {
      if (this.renderer?.domElement !== c) return;
      this.lost = false; this.showMessage(null); this.loop.request();
    });
    this.parts.glLayer.appendChild(c);
    this.renderer = r;
    this.lost = false;
    const gl = r.getContext();
    this.webglVersion = r.capabilities.isWebGL2 ? 'WebGL 2' : 'WebGL 1';
    try {
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      this.gpuName = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : '';
    } catch { this.gpuName = ''; }

    const ctl = new OrbitControls(this.camera, c);
    ctl.enableDamping = true;
    ctl.dampingFactor = 0.09;
    ctl.enablePan = false;
    ctl.rotateSpeed = 0.55;
    ctl.zoomSpeed = 0.7;
    ctl.minDistance = MIN_DIST;
    ctl.maxDistance = MAX_DIST;
    // three 0.160 scales wheel and middle-drag zoom by 1 / (devicePixelRatio | 0): with the page zoomed below 100%
    // that is 1 / 0 and a single notch jumps straight to the nearest or farthest distance. The wheel is handled
    // in bindPointer instead; middle-drag zoom is switched off. Pinch zoom on touch is not affected.
    ctl.mouseButtons = { ...ctl.mouseButtons, MIDDLE: null };
    ctl.autoRotate = this.settings.autoRotate;
    ctl.autoRotateSpeed = this.settings.rotateSpeed;
    ctl.addEventListener('change', () => this.loop.request());
    ctl.addEventListener('start', () => { this.fly = null; this.closeCard(); this.hideTip(); });
    this.controls = ctl;
    this.bindPointer(c);
    this.applyTouchAction();
    this.showMessage(null);
    this.loop.request();
  }

  private bindPointer(c: HTMLCanvasElement): void {
    // capture phase, so OrbitControls' own wheel zoom on the same canvas never runs (see createRenderer)
    c.addEventListener('wheel', e => {
      if (!this.controls?.enabled) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      // pixels, lines (Firefox: 3 per notch) or pages → pixels; one event counts for at most one notch
      const px = e.deltaY * (e.deltaMode === 1 ? WHEEL_NOTCH / 3 : e.deltaMode === 2 ? WHEEL_NOTCH : 1);
      const notches = Math.max(-1, Math.min(1, px / WHEEL_NOTCH));
      if (!notches) return;
      this.userZoomed = true;
      this.fly = null; this.closeCard(); this.hideTip();
      const d = this.camera.position.length();
      const want = (this.zoomTo ?? d) * WHEEL_STEP ** (notches * this.settings.zoomSpeed);
      this.zoomTo = Math.min(MAX_DIST, Math.max(MIN_DIST, d / ZOOM_LEAD, Math.min(d * ZOOM_LEAD, want)));
      this.loop.request();
    }, { passive: false, capture: true });
    c.addEventListener('pointerenter', () => { this.pointerInside = true; this.syncAutoRotate(); });
    c.addEventListener('pointerleave', e => {
      this.pointerInside = false;
      if (e.pointerType !== 'touch' && !this.card) { this.setHoverIndex(-1); this.hideTip(); }
      this.syncAutoRotate();
    });
    // capture phase: runs before OrbitControls' own listener on the same canvas
    c.addEventListener('pointerdown', e => {
      this.down = { x: e.clientX, y: e.clientY, moved: 0 };
      if (e.pointerType !== 'touch' || this.touchMode === 'rotate') return;
      e.stopImmediatePropagation(); // the sphere stays still: scrolling or exploring
      if (this.touchMode === 'explore') {
        this.exploring = true;
        try { c.setPointerCapture(e.pointerId); } catch { /* not capturable */ }
        this.explore(e);
      }
    }, { capture: true });
    c.addEventListener('pointermove', e => {
      if (this.exploring) { this.explore(e); return; }
      if (this.down) { this.down.moved += Math.abs(e.movementX) + Math.abs(e.movementY); if (this.down.moved > 4) return; }
      if (e.pointerType === 'touch') return;
      const [x, y] = this.local(e);
      const i = this.pick(x, y);
      if (this.card) {
        // a click card stays while the pointer heads for its button; another point under the pointer replaces it
        if (!this.cardMini || i < 0 || (this.card.kind === 'point' && this.card.i === i)) return;
        this.closeCard();
      }
      this.setHoverIndex(i);
      if (i >= 0) this.showTip(this.describePoint(i), x, y); else this.hideTip();
      c.style.cursor = i >= 0 ? 'pointer' : 'grab';
    });
    c.addEventListener('pointerup', e => {
      const d = this.down; this.down = null;
      const [x, y] = this.local(e);
      if (this.exploring) {
        this.exploring = false;
        const i = this.pick(x, y);
        if (i >= 0) this.openCard({ kind: 'point', i }); else this.closeCard();
        return;
      }
      if (!d || d.moved > 4 || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 6) return;
      const i = this.pick(x, y);
      if (e.pointerType === 'touch') { if (i >= 0) this.openCard({ kind: 'point', i }); else this.closeCard(); return; }
      if (this.card) this.closeCard();
      if (i < 0) return;
      this.onPointPick(i);
      if (this.clickActions(i).length) this.openCard({ kind: 'point', i }, true);
      else this.showTip(this.describePoint(i), x, y);
    });
    c.addEventListener('pointercancel', () => { this.down = null; this.exploring = false; });
  }

  /** explore mode: the card follows the finger and shows what is underneath */
  private explore(e: PointerEvent): void {
    const [x, y] = this.local(e);
    const i = this.pick(x, y);
    this.setHoverIndex(i);
    if (i >= 0) this.placeTip(this.cardHtml(this.describePoint(i), []), x, y, false);
    else this.hideTip();
  }

  /* ------------------------------------------------------------------ touch cards */

  setTouchMode(m: TouchMode): void {
    if (m === this.touchMode) return;
    this.touchMode = m;
    this.exploring = false;
    this.applyTouchAction();
  }

  private applyTouchAction(): void {
    const c = this.renderer?.domElement;
    if (c) c.style.touchAction = this.touchMode === 'scroll' ? 'pan-x pan-y pinch-zoom' : 'none';
  }

  private cardHtml(info: string, actions: CardAction[], close = false): string {
    const body = info.replace(/<em>[\s\S]*?<\/em>/g, '');
    const acts = actions.map(a => `<button type="button" data-card-act="${a.id}" class="${a.primary ? 'primary' : ''}" ${a.pressed === undefined ? '' : `aria-pressed="${a.pressed}"`}>${a.label}</button>`).join('');
    return `${close ? '<button type="button" class="card-x" data-card-act="close" aria-label="Κλείσιμο">✕</button>' : ''}${body}${acts ? `<div class="card-acts">${acts}</div>` : ''}`;
  }

  private openCard(t: CardTarget, mini = false): void {
    this.card = t;
    this.cardMini = mini;
    if (t.kind === 'point') { this.hotAnchor = null; this.onAnchorHover(null); this.setHoverIndex(t.i); }
    else { this.setHoverIndex(-1); this.hotAnchor = t.id; this.onAnchorHover(t.id); }
    this.renderCard();
  }

  private renderCard(): void {
    const t = this.card;
    if (!t) return;
    let p: [number, number] | null;
    let html: string;
    if (t.kind === 'point') {
      const q = this.points.positionOf(t.i, this.tmp);
      const v = this.v.set(q[0], q[1], q[2]).project(this.camera);
      p = [(v.x * 0.5 + 0.5) * this.w, (-v.y * 0.5 + 0.5) * this.h];
      html = this.cardHtml(this.describePoint(t.i), this.cardMini ? this.clickActions(t.i) : this.pointActions(t.i), true);
    } else {
      p = this.labels.screenOf(t.id, this.camera, this.w, this.h);
      html = this.cardHtml(this.describeAnchor(t.id), this.anchorActions(t.id), true);
    }
    this.parts.tip.classList.toggle('mini', this.cardMini);
    if (p) this.placeTip(html, p[0], p[1], true);
  }

  closeCard(): void {
    if (!this.card) return;
    const wasAnchor = this.card.kind === 'anchor';
    this.card = null;
    this.cardMini = false;
    this.parts.tip.classList.remove('card', 'mini');
    this.hideTip();
    this.setHoverIndex(-1);
    if (wasAnchor) { this.hotAnchor = null; this.onAnchorHover(null); }
  }

  private local(e: PointerEvent): [number, number] {
    const r = this.parts.host.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  }

  protected resize(): void {
    const r = this.parts.host.getBoundingClientRect();
    this.w = Math.max(1, Math.round(r.width));
    this.h = Math.max(1, Math.round(r.height));
    if (this.w >= 40 && this.h >= 40) this.shown = { w: this.w, h: this.h };
    this.camera.aspect = this.w / this.h;
    this.fitDist = this.fitDistance();
    if (!this.userZoomed) { this.zoomTo = null; this.camera.position.setLength(this.fitDist); }
    this.camera.updateProjectionMatrix();
    this.points.uniforms.uRef.value = this.fitDist;
    this.renderer?.setPixelRatio(pixelRatioFor(this.settings.resolution));
    this.renderer?.setSize(this.w, this.h, false);
    this.applyPointUniforms();
    this.onResize();
    this.loop.request();
  }

  private fitDistance(w = this.w, h = this.h): number {
    const v = (FOV * Math.PI) / 180;
    const hFov = 2 * Math.atan(Math.tan(v / 2) * (w / h));
    const margin = w < 600 ? 1.12 : 1.22;
    return Math.min(MAX_DIST, margin / Math.sin(Math.min(v, hFov) / 2));
  }

  private showMessage(text: string | null): void {
    this.parts.msg.hidden = !text;
    this.parts.msg.textContent = text ?? '';
  }

  /* ------------------------------------------------------------------ frame */

  private frame(dt: number): boolean {
    if (!this.renderer || this.lost) return false;
    let more = false;
    if (this.fly) {
      const f = this.fly;
      f.t = Math.min(1, f.t + (f.dur > 0 ? dt / f.dur : 1));
      const e = f.t < 0.5 ? 4 * f.t ** 3 : 1 - (-2 * f.t + 2) ** 3 / 2;
      this.qStep.identity().slerp(f.q, e);
      this.v.copy(f.from).applyQuaternion(this.qStep).multiplyScalar(f.dist);
      this.camera.position.copy(this.v);
      this.camera.lookAt(0, 0, 0);
      if (f.t >= 1) this.fly = null; else more = true;
    }
    if (this.zoomTo !== null && !this.fly) {
      const d = this.camera.position.length();
      const next = this.settings.transitions ? d + (this.zoomTo - d) * (1 - Math.exp(-dt * 14)) : this.zoomTo;
      if (Math.abs(this.zoomTo - next) < 1e-3) { this.camera.position.setLength(this.zoomTo); this.zoomTo = null; }
      else { this.camera.position.setLength(next); more = true; }
    }
    if (this.controls) {
      const changed = this.controls.update(dt);
      if (changed || this.controls.autoRotate) more = true;
    }
    if (this.points.step(dt, this.settings.transitions ? 0.38 : 0)) more = true;
    this.renderer.render(this.scene, this.camera);
    if (this.settings.showLabels) this.labels.update(this.camera, this.w, this.h);
    return more;
  }

  /* ------------------------------------------------------------------ picking & tooltips */

  private pick(x: number, y: number): number {
    const camDir = this.v.copy(this.camera.position).normalize();
    const cx = camDir.x, cy = camDir.y, cz = camDir.z;
    const p = new Vector3();
    let best = -1, bestD = Infinity;
    const thr = Math.max(8, this.settings.pointSize * 0.9);
    for (let i = 0; i < this.points.count; i++) {
      const q = this.points.positionOf(i, this.tmp);
      if (q[0] * cx + q[1] * cy + q[2] * cz < 0.08) continue; // far side
      p.set(q[0], q[1], q[2]).project(this.camera);
      const sx = (p.x * 0.5 + 0.5) * this.w, sy = (-p.y * 0.5 + 0.5) * this.h;
      const d = Math.hypot(sx - x, sy - y) - (this.points.activeOf(i) > 0.5 ? 3 : 0);
      if (d < thr && d < bestD) { bestD = d; best = i; }
    }
    return best;
  }

  protected showTip(html: string, x: number, y: number): void {
    const t = this.parts.tip;
    t.classList.remove('card');
    t.innerHTML = html;
    t.hidden = false;
    const tw = t.offsetWidth, th = t.offsetHeight;
    let left = x + 16, top = y - th - 12;
    if (left + tw > this.w - 8) left = x - tw - 16;
    if (top < 8) top = y + 18;
    t.style.transform = `translate(${Math.max(8, left)}px, ${Math.min(this.h - th - 8, top)}px)`;
  }

  /** card centred above a finger (or a point), so the finger does not cover it; below if there is no room */
  private placeTip(html: string, x: number, y: number, pinned: boolean): void {
    const t = this.parts.tip;
    t.classList.toggle('card', pinned);
    t.innerHTML = html;
    t.hidden = false;
    const tw = t.offsetWidth, th = t.offsetHeight;
    const gap = pinned ? 18 : 64;
    let top = y - th - gap;
    if (top < 8) top = Math.min(this.h - th - 8, y + (pinned ? 18 : 40));
    const left = Math.min(this.w - tw - 8, Math.max(8, x - tw / 2));
    t.style.transform = `translate(${Math.round(left)}px, ${Math.round(Math.max(8, top))}px)`;
  }

  private showAnchorTip(id: string | null): void {
    if (this.card) return;
    if (!id) { this.hideTip(); return; }
    const p = this.labels.screenOf(id, this.camera, this.w, this.h);
    if (p) this.showTip(this.describeAnchor(id), p[0] + 8, p[1]);
  }

  protected hideTip(): void { this.parts.tip.hidden = true; this.parts.tip.classList.remove('card'); }

  private setHoverIndex(i: number): void {
    if (i === this.hoverIndex) return;
    this.hoverIndex = i;
    this.onHoverChange();
    this.loop.request();
  }

  /* ------------------------------------------------------------------ camera */

  /** turn toward the centre of a set of point indices, if they lean to one side of the globe */
  protected focusOnIndices(indices: Iterable<number>, minLean = 0.35): void {
    let x = 0, y = 0, z = 0, n = 0;
    for (const i of indices) { const q = this.points.positionOf(i, this.tmp); x += q[0]; y += q[1]; z += q[2]; n++; }
    if (!n || Math.hypot(x, y, z) / n < minLean) return;
    const dir = new Vector3(x, y, z).normalize();
    if (this.camera.position.clone().normalize().dot(dir) > 0.93) return;
    this.flyToward(dir.x, dir.y, dir.z);
  }

  protected flyToward(x: number, y: number, z: number, dist = this.camera.position.length(), dur = 0.75): void {
    const to = new Vector3(x, y * 0.85 + 0.12, z).normalize();
    if (Math.abs(to.y) > MAX_FLY_Y) {
      const h = new Vector3(to.x, 0, to.z);
      if (h.lengthSq() < 1e-6) h.set(this.camera.position.x, 0, this.camera.position.z);
      if (h.lengthSq() < 1e-6) h.set(0, 0, 1);
      h.normalize().multiplyScalar(Math.sqrt(1 - MAX_FLY_Y * MAX_FLY_Y));
      to.set(h.x, Math.sign(to.y) * MAX_FLY_Y, h.z);
    }
    const from = this.camera.position.clone().normalize();
    this.fly = { from, q: new Quaternion().setFromUnitVectors(from, to), t: 0, dur: this.settings.transitions ? dur : 0, dist };
    this.loop.request();
  }

  resetView(): void {
    this.userZoomed = false;
    this.zoomTo = null;
    this.flyToward(0, 0.12, 1, this.fitDist, 0.6);
  }

  setViewVisible(v: boolean): void { this.visible.view = v; this.updatePaused(); if (v) this.resize(); }

  private updatePaused(): void {
    const run = this.visible.page && this.visible.onscreen && this.visible.view;
    this.loop.setPaused(!run);
  }

  private syncAutoRotate(): void {
    if (!this.controls) return;
    this.controls.autoRotate = this.settings.autoRotate && !this.pointerInside;
    this.loop.request();
  }

  /* ------------------------------------------------------------------ settings */

  applySettings(s: Settings, changed: ReadonlySet<keyof Settings>): void {
    const prev = this.settings;
    this.settings = { ...s };
    if (changed.has('msaa') || changed.has('gpu')) { this.createRenderer(); this.resize(); }
    if (changed.has('resolution') && this.renderer) this.resize();
    if (changed.has('fpsCap')) this.loop.fpsCap = s.fpsCap;
    if (changed.has('detail')) this.shell.setDetail(s.detail);
    if (changed.has('autoRotate') || changed.has('rotateSpeed')) {
      if (this.controls) this.controls.autoRotateSpeed = s.rotateSpeed;
      this.syncAutoRotate();
    }
    if (changed.has('pointSize') || changed.has('offOpacity') || changed.has('backOpacity')) this.applyPointUniforms();
    if (changed.has('showGrid')) this.shell.setGridVisible(s.showGrid);
    if (changed.has('showLabels')) { this.labels.setVisible(s.showLabels); if (s.showLabels) this.labels.update(this.camera, this.w, this.h); }
    this.applyExtraSettings(s, changed, prev);
    this.loop.request();
  }

  protected applyPointUniforms(): void {
    const u = this.points.uniforms;
    u.uSize.value = this.settings.pointSize;
    u.uPR.value = this.renderer ? this.renderer.getPixelRatio() : pixelRatioFor(this.settings.resolution);
    u.uOffAlpha.value = this.settings.offOpacity;
    u.uBackAlpha.value = this.settings.backOpacity;
  }

  protected applyShellPalette(): void {
    const p = this.palette;
    const dark = p['--panel'].r + p['--panel'].g + p['--panel'].b < 1.2;
    this.shell.setColors(p['--globe'], p['--ink'], dark);
    this.points.uniforms.uOff.value.copy(p['--off']);
    this.points.uniforms.uInk.value.copy(p['--ink']);
  }

  /* ------------------------------------------------------------------ export & stats */

  /**
   * Image of the current view for the PDF report (JPEG on `background`, else a transparent PNG): cropped to the globe, with the anchor letters
   * drawn in (they are HTML on screen, so a plain canvas capture would miss them). Null without WebGL.
   */
  snapshot(background?: string): { dataUrl: string; width: number; height: number } | null {
    if (!this.renderer || this.lost) return null;
    // hidden (e.g. the plan view is open): draw once at the last visible size, then restore
    const hidden = this.w < 40 || this.h < 40;
    const W = hidden ? this.shown.w : this.w, H = hidden ? this.shown.h : this.h;
    const camPos = this.camera.position.clone();
    if (hidden) {
      this.renderer.setSize(W, H, false);
      this.camera.aspect = W / H;
      this.camera.updateProjectionMatrix();
      const fit = this.fitDistance(W, H);
      this.camera.position.setLength(this.userZoomed ? Math.max(fit * 0.6, camPos.length()) : fit);
      this.camera.lookAt(0, 0, 0);
      this.points.uniforms.uRef.value = fit;
      this.points.step(10, 0); // settle any transition that was running when the view was hidden
      const [w0, h0] = [this.w, this.h];
      this.w = W; this.h = H; this.onResize(); // e.g. line widths are in pixels of this size
      this.w = w0; this.h = h0;
    }
    try {
      this.renderer.render(this.scene, this.camera);
      const src = this.renderer.domElement, pr = this.renderer.getPixelRatio();
      const d = this.camera.position.length();
      const rPx = (1 / Math.sqrt(Math.max(1e-6, d * d - 1))) / Math.tan(((FOV * Math.PI) / 180) / 2) * (H / 2);
      const half = Math.min(Math.max(W, H) / 2, rPx * 1.06 + 20);
      const sx = Math.max(0, W / 2 - half), sy = Math.max(0, H / 2 - half);
      const sw = Math.min(W, W / 2 + half) - sx, sh = Math.min(H, H / 2 + half) - sy;
      const k = Math.max(pr, Math.min(2.5, 900 / sw));
      const out = document.createElement('canvas');
      out.width = Math.round(sw * k); out.height = Math.round(sh * k);
      const ctx = out.getContext('2d');
      if (!ctx) return null;
      if (background) { ctx.fillStyle = background; ctx.fillRect(0, 0, out.width, out.height); }
      ctx.drawImage(src, sx * pr, sy * pr, sw * pr, sh * pr, 0, 0, out.width, out.height);
      if (this.settings.showLabels) {
        const css = (key: keyof Palette) => `#${this.palette[key].getHexString()}`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        for (const a of this.labels.projected(this.camera, W, H).sort((p, q) => p.facing - q.facing)) {
          const x = (a.x - sx) * k, y = (a.y - sy) * k, r = 13 * k * (a.facing > 0 ? 1 : 0.85);
          if (x < -r || y < -r || x > out.width + r || y > out.height + r) continue;
          ctx.globalAlpha = a.facing > 0 ? 1 : 0.3;
          ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.fillStyle = a.state === 'F' ? css('--ink') : css('--panel'); ctx.fill();
          ctx.lineWidth = 1.5 * k; ctx.strokeStyle = css('--ink'); ctx.stroke();
          ctx.fillStyle = a.state === 'F' ? css('--panel') : css('--ink');
          ctx.font = `800 ${Math.round(12.5 * k)}px Commissioner, "Segoe UI", Arial, sans-serif`;
          ctx.fillText(a.label, x, y + 0.5 * k);
        }
        ctx.globalAlpha = 1;
      }
      // on a solid background a JPEG is a fraction of the size of a PNG with transparency
      return { dataUrl: background ? out.toDataURL('image/jpeg', 0.9) : out.toDataURL('image/png'), width: out.width, height: out.height };
    } finally {
      if (hidden) {
        this.renderer.setSize(this.w, this.h, false);
        this.camera.aspect = this.w / this.h;
        this.camera.updateProjectionMatrix();
        this.camera.position.copy(camPos);
        this.camera.lookAt(0, 0, 0);
        this.points.uniforms.uRef.value = this.fitDist;
        this.onResize();
      }
    }
  }

  stats(): RenderStats {
    const r = this.renderer;
    const buf = new Vector2();
    r?.getDrawingBufferSize(buf);
    return {
      webgl: r ? this.webglVersion : 'χωρίς WebGL',
      fps: this.loop.fps,
      idle: this.loop.idle,
      paused: this.loop.isPaused,
      pixelRatio: r ? r.getPixelRatio() : 0,
      buffer: [buf.x, buf.y],
      calls: r ? r.info.render.calls : 0,
      triangles: r ? r.info.render.triangles : 0,
      points: r ? r.info.render.points : 0,
      frames: this.loop.totalFrames,
      gpu: this.gpuName,
    };
  }
}
