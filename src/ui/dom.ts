export const $ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document): T => {
  const el = root.querySelector<T>(sel);
  if (!el) throw new Error(`Missing element ${sel}`);
  return el;
};

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s: string | number): string => String(s).replace(/[&<>"']/g, ch => ESC[ch]);

/** Event delegation: `handler` runs for events whose target is inside an element matching `selector`. */
export function on<K extends keyof HTMLElementEventMap>(
  root: HTMLElement, type: K, selector: string, handler: (el: HTMLElement, ev: HTMLElementEventMap[K]) => void,
): void {
  root.addEventListener(type, ev => {
    const t = ev.target as Element | null;
    const el = t?.closest?.(selector) as HTMLElement | null;
    if (el && root.contains(el)) handler(el, ev);
  });
}

/** Replace innerHTML and keep keyboard focus on the element with the same `data-focus-key`. */
export function render(root: HTMLElement, html: string): void {
  const active = document.activeElement as HTMLElement | null;
  const key = active && root.contains(active) ? active.dataset.focusKey : undefined;
  root.innerHTML = html;
  if (key) root.querySelector<HTMLElement>(`[data-focus-key="${CSS.escape(key)}"]`)?.focus({ preventScroll: true });
}

export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
