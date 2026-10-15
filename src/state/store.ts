/**
 * Minimal observable store. `update` mutates a draft in place and notifies subscribers
 * with the set of top-level keys that the caller says changed.
 */
export type Listener<T> = (state: Readonly<T>, changed: ReadonlySet<keyof T>) => void;

export class Store<T extends object> {
  private listeners = new Set<Listener<T>>();
  private pending = new Set<keyof T>();
  private scheduled = false;

  constructor(private value: T, private persist?: (v: T) => void) {}

  get state(): Readonly<T> { return this.value; }

  update(changed: (keyof T)[], fn: (draft: T) => void): void {
    fn(this.value);
    changed.forEach(k => this.pending.add(k));
    if (this.scheduled) return;
    this.scheduled = true;
    queueMicrotask(() => {
      this.scheduled = false;
      const keys = new Set(this.pending);
      this.pending.clear();
      this.listeners.forEach(l => l(this.value, keys));
      this.persist?.(this.value);
    });
  }

  subscribe(l: Listener<T>): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }
}

/** localStorage wrapper that never throws (private mode, blocked storage, sandboxed previews). */
export const storage = {
  read<T>(key: string): T | null {
    try { const s = localStorage.getItem(key); return s ? (JSON.parse(s) as T) : null; } catch { return null; }
  },
  write(key: string, v: unknown): void {
    try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* storage unavailable */ }
  },
};

export function debounce<A extends unknown[]>(fn: (...a: A) => void, ms: number) {
  let t: ReturnType<typeof setTimeout> | undefined;
  return (...a: A) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}
