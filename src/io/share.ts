/**
 * A plan as a link: the combination, its picked courses and the core choice live in the URL hash,
 * so opening the link on another device (or sending it to a friend) shows the same plan.
 *   #s=TL-ΔΤΙ&p=3259.3267.3331&c=3068
 */
import { COURSES } from '../data/catalog';
import { CORE_CHOICES, type CoreChoice } from '../data/rules';
import { COMBO_BY_KEY } from '../domain/combos';

export interface SharedPlan { sel: string; picks: string[]; core: CoreChoice | null }

/** page address that others can open: a configured public URL, or this page when it is not embedded */
export function shareBase(): string | null {
  const configured = (import.meta as unknown as { env?: Record<string, string | undefined> }).env?.VITE_PUBLIC_URL;
  if (configured) return configured;
  let top = true;
  try { top = window.self === window.top; } catch { top = false; }
  if (!top || !/^https?:$/.test(location.protocol)) return null;
  return location.href.split('#')[0];
}

export function planLink(plan: SharedPlan, base = shareBase()): string | null {
  if (!base) return null;
  const q = new URLSearchParams({ s: plan.sel, p: plan.picks.join('.') });
  if (plan.core) q.set('c', plan.core);
  return `${base.split('#')[0]}#${q.toString()}`;
}

/** reads a plan from a hash such as `#s=…&p=…&c=…`; unknown courses are dropped, an unknown combination gives null */
export function readPlanHash(hash: string): SharedPlan | null {
  const h = hash.replace(/^#/, '');
  if (!h.includes('s=')) return null;
  const q = new URLSearchParams(h);
  const sel = q.get('s') ?? '';
  if (!COMBO_BY_KEY.has(sel)) return null;
  const picks = [...new Set((q.get('p') ?? '').split('.').filter(id => Boolean(COURSES[id])))];
  const c = q.get('c') as CoreChoice;
  return { sel, picks, core: CORE_CHOICES.includes(c) ? c : null };
}
