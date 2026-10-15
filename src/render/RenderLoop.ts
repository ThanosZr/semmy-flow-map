/**
 * On-demand render loop.
 * Nothing is drawn unless something asked for a frame (`request`) or the last frame said it
 * needs another (camera damping, a running transition, auto-rotation). When idle, the GPU does nothing.
 */
export interface FrameInfo { dt: number; now: number }

export class RenderLoop {
  private raf = 0;
  private lastDraw = 0;
  private frames: number[] = [];
  private paused = false;
  fpsCap = 60;
  totalFrames = 0;

  constructor(private draw: (f: FrameInfo) => boolean) {}

  request(): void {
    if (!this.raf && !this.paused) this.raf = requestAnimationFrame(this.tick);
  }

  setPaused(p: boolean): void {
    if (this.paused === p) return;
    this.paused = p;
    if (p && this.raf) { cancelAnimationFrame(this.raf); this.raf = 0; }
    if (!p) this.request();
  }

  get isPaused(): boolean { return this.paused; }

  /** frames drawn during the last second */
  get fps(): number {
    const now = performance.now();
    while (this.frames.length && now - this.frames[0] > 1000) this.frames.shift();
    return this.frames.length;
  }

  get idle(): boolean { return performance.now() - this.lastDraw > 400; }

  private tick = (now: number): void => {
    this.raf = 0;
    if (this.paused) return;
    const minGap = this.fpsCap > 0 ? 1000 / this.fpsCap : 0;
    // small tolerance so a 60 Hz display is not halved by a 60 fps cap
    if (minGap && this.lastDraw && now - this.lastDraw < minGap - 2) { this.request(); return; }
    const dt = this.lastDraw ? Math.min(0.1, (now - this.lastDraw) / 1000) : 1 / 60;
    this.lastDraw = now;
    this.frames.push(now);
    if (this.frames.length > 240) this.frames.splice(0, this.frames.length - 240);
    this.totalFrames++;
    if (this.draw({ dt, now })) this.request();
  };
}
