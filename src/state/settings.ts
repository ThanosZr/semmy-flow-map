import { debounce, storage, Store } from './store';

export type Resolution = 'auto' | 'native' | 0.5 | 0.75 | 1 | 1.5 | 2;
export type GpuPreference = 'low-power' | 'default' | 'high-performance';
export type Detail = 'low' | 'medium' | 'high';
export type ColorMode = 'direction' | 'shape';

export interface Settings {
  // rendering
  resolution: Resolution;
  msaa: boolean;
  fpsCap: 30 | 60 | 0;
  gpu: GpuPreference;
  detail: Detail;
  showStats: boolean;
  // globe
  autoRotate: boolean;
  autoFocus: boolean;
  rotateSpeed: number;
  transitions: boolean;
  pointSize: number;
  offOpacity: number;
  backOpacity: number;
  showGrid: boolean;
  showLinks: boolean;
  showLabels: boolean;
  courseGlobe: boolean;
  colorMode: ColorMode;
  // layout
  halfWeight: number;
  spacing: number;
  polePull: number;
}

const reduceMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export const DEFAULT_SETTINGS: Readonly<Settings> = {
  resolution: 'auto', msaa: true, fpsCap: 60, gpu: 'low-power', detail: 'medium', showStats: false,
  autoRotate: false, autoFocus: true, rotateSpeed: 0.6, transitions: !reduceMotion,
  pointSize: 9, offOpacity: 0.3, backOpacity: 0.22,
  showGrid: true, showLinks: true, showLabels: true, courseGlobe: true, colorMode: 'direction',
  halfWeight: 0.5, spacing: 0.078, polePull: 3,
};

/** Value ranges, used by the settings panel and to sanitise stored values. */
export const RANGES = {
  rotateSpeed: { min: 0.1, max: 3, step: 0.1 },
  pointSize: { min: 4, max: 18, step: 0.5 },
  offOpacity: { min: 0, max: 0.8, step: 0.02 },
  backOpacity: { min: 0, max: 0.8, step: 0.02 },
  halfWeight: { min: 0.2, max: 0.9, step: 0.05 },
  spacing: { min: 0.04, max: 0.12, step: 0.002 },
  polePull: { min: 1, max: 5, step: 0.25 },
} as const;

const KEY = 'semmy-flow-map/settings/v1';

export function sanitizeSettings(s: Partial<Settings> | null): Settings {
  const out: Settings = { ...DEFAULT_SETTINGS };
  if (!s) return out;
  const pick = <K extends keyof Settings>(k: K, ok: (v: unknown) => boolean) => { if (ok(s[k])) out[k] = s[k] as Settings[K]; };
  pick('resolution', v => ['auto', 'native', 0.5, 0.75, 1, 1.5, 2].includes(v as Resolution));
  pick('fpsCap', v => [30, 60, 0].includes(v as number));
  pick('gpu', v => ['low-power', 'default', 'high-performance'].includes(v as string));
  pick('detail', v => ['low', 'medium', 'high'].includes(v as string));
  pick('colorMode', v => ['direction', 'shape'].includes(v as string));
  for (const k of ['msaa', 'showStats', 'autoRotate', 'autoFocus', 'transitions', 'showGrid', 'showLinks', 'showLabels', 'courseGlobe'] as const) pick(k, v => typeof v === 'boolean');
  for (const [k, r] of Object.entries(RANGES) as [keyof typeof RANGES, { min: number; max: number }][]) {
    pick(k, v => typeof v === 'number' && v >= r.min && v <= r.max);
  }
  return out;
}

export const settingsStore = new Store<Settings>(
  sanitizeSettings(storage.read<Partial<Settings>>(KEY)),
  debounce((s: Settings) => storage.write(KEY, s), 250),
);

/** Effective device-pixel ratio for a resolution setting. */
export function pixelRatioFor(r: Resolution): number {
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
  if (r === 'auto') return Math.min(dpr, 2);
  if (r === 'native') return dpr;
  return r;
}
