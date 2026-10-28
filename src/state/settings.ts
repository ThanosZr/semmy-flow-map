import { BASE_KEYS, THEME_IDS, isHex, type ColorOverrides, type ThemeId } from '../data/themes';
import { debounce, storage, Store } from './store';

export type Resolution = 'auto' | 'native' | 0.5 | 0.75 | 1 | 1.5 | 2;
export type GpuPreference = 'low-power' | 'default' | 'high-performance';
export type Detail = 'low' | 'medium' | 'high';
export type ColorMode = 'direction' | 'shape' | 'ects';
export type SchemePref = 'auto' | 'light' | 'dark';
export type TouchMode = 'rotate' | 'scroll' | 'explore';
export type DockPref = 'auto' | 'on' | 'off';
export type PhoneLayout = 'side' | 'stack';

export interface Settings {
  // appearance
  theme: ThemeId;
  scheme: SchemePref;
  colorsLight: ColorOverrides;
  colorsDark: ColorOverrides;
  // touch
  touchDock: DockPref;
  touchMode: TouchMode;
  dockSide: 'left' | 'right';
  dockHidden: boolean;
  phoneLayout: PhoneLayout;
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
  /** mouse-wheel zoom speed (1 = 8% per notch) */
  zoomSpeed: number;
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
  theme: 'blueprint', scheme: 'auto', colorsLight: {}, colorsDark: {},
  touchDock: 'auto', touchMode: 'rotate', dockSide: 'right', dockHidden: false, phoneLayout: 'side',
  resolution: 'auto', msaa: true, fpsCap: 60, gpu: 'low-power', detail: 'medium', showStats: false,
  autoRotate: false, autoFocus: true, rotateSpeed: 0.6, zoomSpeed: 1, transitions: !reduceMotion,
  pointSize: 9, offOpacity: 0.3, backOpacity: 0.22,
  showGrid: true, showLinks: true, showLabels: true, courseGlobe: true, colorMode: 'direction',
  halfWeight: 0.5, spacing: 0.078, polePull: 3,
};

/** Value ranges, used by the settings panel and to sanitise stored values. */
export const RANGES = {
  rotateSpeed: { min: 0.1, max: 3, step: 0.1 },
  zoomSpeed: { min: 0.25, max: 3, step: 0.05 },
  pointSize: { min: 4, max: 18, step: 0.5 },
  offOpacity: { min: 0, max: 0.8, step: 0.02 },
  backOpacity: { min: 0, max: 0.8, step: 0.02 },
  halfWeight: { min: 0.2, max: 0.9, step: 0.05 },
  spacing: { min: 0.04, max: 0.12, step: 0.002 },
  polePull: { min: 1, max: 5, step: 0.25 },
} as const;

const KEY = 'semmy-flow-map/settings/v1';

export function sanitizeColors(v: unknown): ColorOverrides {
  const out: ColorOverrides = {};
  if (typeof v !== 'object' || v === null) return out;
  for (const k of BASE_KEYS) { const c = (v as Record<string, unknown>)[k]; if (isHex(c)) out[k] = c.toUpperCase(); }
  return out;
}

export function sanitizeSettings(s: Partial<Settings> | null): Settings {
  const out: Settings = { ...DEFAULT_SETTINGS, colorsLight: {}, colorsDark: {} };
  if (!s) return out;
  pickColors(out, s);
  const pick = <K extends keyof Settings>(k: K, ok: (v: unknown) => boolean) => { if (ok(s[k])) out[k] = s[k] as Settings[K]; };
  pick('resolution', v => ['auto', 'native', 0.5, 0.75, 1, 1.5, 2].includes(v as Resolution));
  pick('fpsCap', v => [30, 60, 0].includes(v as number));
  pick('gpu', v => ['low-power', 'default', 'high-performance'].includes(v as string));
  pick('detail', v => ['low', 'medium', 'high'].includes(v as string));
  pick('colorMode', v => ['direction', 'shape', 'ects'].includes(v as string));
  pick('theme', v => (THEME_IDS as readonly unknown[]).includes(v));
  pick('scheme', v => ['auto', 'light', 'dark'].includes(v as string));
  pick('touchDock', v => ['auto', 'on', 'off'].includes(v as string));
  pick('touchMode', v => ['rotate', 'scroll', 'explore'].includes(v as string));
  pick('dockSide', v => v === 'left' || v === 'right');
  pick('phoneLayout', v => v === 'side' || v === 'stack');
  for (const k of ['msaa', 'showStats', 'autoRotate', 'autoFocus', 'transitions', 'showGrid', 'showLinks', 'showLabels', 'courseGlobe', 'dockHidden'] as const) pick(k, v => typeof v === 'boolean');
  for (const [k, r] of Object.entries(RANGES) as [keyof typeof RANGES, { min: number; max: number }][]) {
    pick(k, v => typeof v === 'number' && v >= r.min && v <= r.max);
  }
  return out;
}

export const settingsStore = new Store<Settings>(
  sanitizeSettings(storage.read<Partial<Settings>>(KEY)),
  debounce((s: Settings) => storage.write(KEY, s), 250),
);

function pickColors(out: Settings, s: Partial<Settings>): void {
  out.colorsLight = sanitizeColors(s.colorsLight);
  out.colorsDark = sanitizeColors(s.colorsDark);
}

/** phones and small tablets: the "auto" resolution stays at 1.5× to spare the battery */
const smallTouch = () => typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches
  && Math.max(screen.width, screen.height) < 1100;

/** Effective device-pixel ratio for a resolution setting. */
export function pixelRatioFor(r: Resolution): number {
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
  if (r === 'auto') return Math.min(dpr, smallTouch() ? 1.5 : 2);
  if (r === 'native') return dpr;
  return r;
}
