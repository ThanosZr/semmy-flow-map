/**
 * Narrow screens: the two spheres sit side by side in their own horizontal scroller ("pager").
 * The second one is just off screen to the right; tabs, an edge arrow, the dock, or a swipe on the strip
 * under a sphere bring it in. The page itself keeps scrolling vertically as usual.
 */
import { storage } from '../state/store';

const HINT_KEY = 'semmy-flow-map/pager-hint/v1';

export class SpherePager {
  page = 0;
  private hintTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private root: HTMLElement,
    private track: HTMLElement,
    private tabs: HTMLElement,
    private hint: HTMLElement,
    private isActive: () => boolean,
    private onChange: (page: number) => void,
  ) {
    tabs.addEventListener('click', e => {
      const b = (e.target as Element).closest<HTMLElement>('[data-page]');
      if (b) this.go(Number(b.dataset.page));
    });
    root.querySelectorAll<HTMLElement>('.pager-arrow').forEach(b => b.addEventListener('click', () => this.go(Number(b.dataset.go))));
    let raf = 0;
    track.addEventListener('scroll', () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => this.syncFromScroll());
    }, { passive: true });
    new ResizeObserver(() => { if (this.isActive()) this.track.scrollLeft = this.page * this.track.clientWidth; }).observe(track);
    hint.addEventListener('click', () => this.dismissHint());
  }

  get active(): boolean { return this.isActive(); }

  go(page: number, smooth = true): void {
    const p = Math.max(0, Math.min(1, page));
    if (this.isActive()) this.track.scrollTo({ left: p * this.track.clientWidth, behavior: smooth ? 'smooth' : 'auto' });
    this.set(p);
    this.dismissHint();
  }

  private syncFromScroll(): void {
    if (!this.isActive()) return;
    const w = this.track.clientWidth || 1;
    const p = Math.round(this.track.scrollLeft / w);
    if (p !== this.page) { this.set(p); this.dismissHint(); }
  }

  private set(p: number): void {
    const changed = p !== this.page;
    this.page = p;
    this.root.dataset.page = String(p);
    this.tabs.querySelectorAll<HTMLElement>('[data-page]').forEach(b => b.setAttribute('aria-selected', String(Number(b.dataset.page) === p)));
    if (changed) this.onChange(p);
  }

  /** layout changed (width, setting): realign and refresh */
  refresh(): void {
    if (!this.isActive()) { this.set(0); return; }
    this.track.scrollLeft = this.page * this.track.clientWidth;
    this.set(this.page);
  }

  /** a one-time pointer to the second sphere */
  maybeShowHint(): void {
    if (!this.isActive() || storage.read<boolean>(HINT_KEY)) return;
    this.hint.hidden = false;
    this.hintTimer = setTimeout(() => this.dismissHint(), 9000);
  }

  private dismissHint(): void {
    if (this.hint.hidden) return;
    clearTimeout(this.hintTimer);
    this.hint.hidden = true;
    storage.write(HINT_KEY, true);
  }
}
