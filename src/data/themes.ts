/**
 * Colour themes. Each preset has a light and a dark variant of 16 base colours; the rest of the palette
 * (secondary panel, rules, grid, the "off" colour of filtered points, scrim, shadow) is derived from them.
 * Users can override any base colour, separately for light and dark.
 */
export const BASE_KEYS = [
  'paper', 'panel', 'globe', 'ink', 'ink2', 'ink3', 'accent',
  'dirES', 'dirPL', 'dirTL', 'dirEN', 'shapeF3', 'shapeF2H1', 'shapeF2H2', 'ok', 'bad',
] as const;
export type BaseKey = typeof BASE_KEYS[number];
export type BaseColors = Record<BaseKey, string>;
export type Scheme = 'light' | 'dark';

/** CSS custom property behind each base colour */
export const TOKEN_OF: Record<BaseKey, string> = {
  paper: '--paper', panel: '--panel', globe: '--globe', ink: '--ink', ink2: '--ink-2', ink3: '--ink-3', accent: '--accent',
  dirES: '--dir-es', dirPL: '--dir-pl', dirTL: '--dir-tl', dirEN: '--dir-en',
  shapeF3: '--shape-f3', shapeF2H1: '--shape-f2h1', shapeF2H2: '--shape-f2h2', ok: '--ok', bad: '--bad',
};

/** groups and labels for the colour editor */
export const COLOR_GROUPS: { title: string; keys: { key: BaseKey; label: string }[] }[] = [
  { title: 'Επιφάνειες', keys: [{ key: 'paper', label: 'Φόντο' }, { key: 'panel', label: 'Πάνελ' }, { key: 'globe', label: 'Σφαίρα' }] },
  { title: 'Κείμενο και τονισμός', keys: [{ key: 'ink', label: 'Κείμενο' }, { key: 'ink2', label: 'Δευτερεύον κείμενο' }, { key: 'ink3', label: 'Αχνό κείμενο' }, { key: 'accent', label: 'Τονισμός' }] },
  { title: 'Κατευθύνσεις', keys: [{ key: 'dirES', label: 'Ηλεκτρονική & Συστήματα' }, { key: 'dirPL', label: 'Πληροφορική' }, { key: 'dirTL', label: 'Επικοινωνίες' }, { key: 'dirEN', label: 'Ενέργεια' }] },
  { title: 'Σχήματα συνδυασμών', keys: [{ key: 'shapeF3', label: '3 πλήρεις' }, { key: 'shapeF2H1', label: '2 + ½' }, { key: 'shapeF2H2', label: '2 + ½ + ½' }] },
  { title: 'Ενδείξεις', keys: [{ key: 'ok', label: 'Έγκυρο' }, { key: 'bad', label: 'Εκκρεμότητα' }] },
];

export interface Derived { panel2: string; rule: string; grid: string; off: string; scrim: string; shadow: string }

export interface ThemePreset {
  id: ThemeId;
  name: string;
  note: string;
  light: BaseColors;
  dark: BaseColors;
  /** exact derived colours for the untouched preset (otherwise computed) */
  derived?: Partial<Record<Scheme, Partial<Derived>>>;
}

export const THEME_IDS = ['blueprint', 'vivid', 'sunset', 'forest', 'neon', 'okabe'] as const;
export type ThemeId = typeof THEME_IDS[number];

export const PRESETS: Readonly<Record<ThemeId, ThemePreset>> = {
  blueprint: {
    id: 'blueprint', name: 'Σχέδιο', note: 'Το αρχικό: μπλε χαρτί σχεδίου.',
    light: {
      paper: '#E8EDF3', panel: '#F7F9FC', globe: '#DCE5F0', ink: '#0F2747', ink2: '#4A6183', ink3: '#7F92AC', accent: '#1E5BB8',
      dirES: '#C23B2A', dirPL: '#6B3FC8', dirTL: '#0B8466', dirEN: '#A86A00', shapeF3: '#1E5BB8', shapeF2H1: '#B4469A', shapeF2H2: '#557012', ok: '#1F7A4A', bad: '#B42318',
    },
    dark: {
      paper: '#081A33', panel: '#0D2446', globe: '#123058', ink: '#E6EDF7', ink2: '#A2B5CF', ink3: '#6C86A9', accent: '#8AB9FF',
      dirES: '#FF8270', dirPL: '#BDA5FF', dirTL: '#55DAB2', dirEN: '#F3BE52', shapeF3: '#8AB9FF', shapeF2H1: '#F29AD8', shapeF2H2: '#B9DB6A', ok: '#7BE0A6', bad: '#FF8A80',
    },
    derived: {
      light: { panel2: '#EEF2F7', rule: '#C9D3E0', off: '#A9B6C8', grid: 'rgba(15, 39, 71, .06)' },
      dark: { panel2: '#10294F', rule: '#21406B', off: '#36557F', grid: 'rgba(190, 215, 255, .05)' },
    },
  },
  vivid: {
    id: 'vivid', name: 'Πολύχρωμο', note: 'Ουδέτερο φόντο, έντονα και καθαρά χρώματα.',
    light: {
      paper: '#F4F1FA', panel: '#FFFFFF', globe: '#E9E4F7', ink: '#1F1535', ink2: '#5A4E78', ink3: '#8C82A8', accent: '#D6246E',
      dirES: '#E8432E', dirPL: '#7444F2', dirTL: '#009C85', dirEN: '#BF7A00', shapeF3: '#2F6FEB', shapeF2H1: '#D6246E', shapeF2H2: '#3A9E3E', ok: '#177A43', bad: '#D7263D',
    },
    dark: {
      paper: '#140F24', panel: '#1C1533', globe: '#251C45', ink: '#F3EEFF', ink2: '#C3B7E6', ink3: '#8A7DB5', accent: '#FF6FA8',
      dirES: '#FF7A5C', dirPL: '#A98BFF', dirTL: '#3FE0C5', dirEN: '#FFC53D', shapeF3: '#6FA8FF', shapeF2H1: '#FF6FA8', shapeF2H2: '#7BE07F', ok: '#6EE7A0', bad: '#FF7A8A',
    },
  },
  sunset: {
    id: 'sunset', name: 'Ηλιοβασίλεμα', note: 'Ζεστό χαρτί, κεραμιδί και μοβ.',
    light: {
      paper: '#FBF1E6', panel: '#FFF9F2', globe: '#F6E2CF', ink: '#3A1F14', ink2: '#7A4F3A', ink3: '#A88570', accent: '#C2410C',
      dirES: '#C2255C', dirPL: '#6741D9', dirTL: '#0C8599', dirEN: '#D9480F', shapeF3: '#C2410C', shapeF2H1: '#A61E4D', shapeF2H2: '#5C940D', ok: '#237A35', bad: '#C92A2A',
    },
    dark: {
      paper: '#22120E', panel: '#2D1914', globe: '#3A211A', ink: '#FCEBDD', ink2: '#E0B9A0', ink3: '#A9826D', accent: '#FF8A4C',
      dirES: '#FF6B9A', dirPL: '#B197FC', dirTL: '#3BC9DB', dirEN: '#FFA94D', shapeF3: '#FF8A4C', shapeF2H1: '#F783AC', shapeF2H2: '#A9E34B', ok: '#8CE99A', bad: '#FF8787',
    },
  },
  forest: {
    id: 'forest', name: 'Δάσος', note: 'Πράσινοι τόνοι, ήρεμο.',
    light: {
      paper: '#EEF3EC', panel: '#F8FBF6', globe: '#DDE9D8', ink: '#14301F', ink2: '#4A6B55', ink3: '#7F9886', accent: '#2F7D4F',
      dirES: '#C0392B', dirPL: '#6C4AB6', dirTL: '#1B7F8C', dirEN: '#B7791F', shapeF3: '#2F7D4F', shapeF2H1: '#9C4F96', shapeF2H2: '#B7791F', ok: '#2F7D4F', bad: '#B42318',
    },
    dark: {
      paper: '#0C1A12', panel: '#12241A', globe: '#183022', ink: '#E4F2E7', ink2: '#A9C8B2', ink3: '#6E8F78', accent: '#6CD39A',
      dirES: '#FF8A7A', dirPL: '#C3A6FF', dirTL: '#5ED6E0', dirEN: '#F2C46D', shapeF3: '#6CD39A', shapeF2H1: '#E7A1E0', shapeF2H2: '#F2C46D', ok: '#7BE0A6', bad: '#FF8A80',
    },
  },
  neon: {
    id: 'neon', name: 'Νέον', note: 'Πολύ έντονα χρώματα, καλύτερο στο σκούρο.',
    light: {
      paper: '#F2F4FF', panel: '#FFFFFF', globe: '#E3E7FF', ink: '#0B0B2B', ink2: '#3D3D72', ink3: '#7C7CA8', accent: '#D400B4',
      dirES: '#F2271C', dirPL: '#8A2BFF', dirTL: '#008F7A', dirEN: '#C46F00', shapeF3: '#0A6CFF', shapeF2H1: '#D400B4', shapeF2H2: '#1A9437', ok: '#007F50', bad: '#E5251B',
    },
    dark: {
      paper: '#05050F', panel: '#0D0D1F', globe: '#121236', ink: '#F0F0FF', ink2: '#A9A9E0', ink3: '#6A6AA6', accent: '#FF4FE0',
      dirES: '#FF5A5F', dirPL: '#B26BFF', dirTL: '#00F5D4', dirEN: '#FFD60A', shapeF3: '#4CC9FF', shapeF2H1: '#FF4FE0', shapeF2H2: '#7CFF6B', ok: '#5CFFA8', bad: '#FF5A5F',
    },
  },
  okabe: {
    id: 'okabe', name: 'Για αχρωματοψία', note: 'Παλέτα Okabe–Ito: τα χρώματα ξεχωρίζουν και με δυσχρωματοψία.',
    light: {
      paper: '#F3F3F1', panel: '#FFFFFF', globe: '#E6E6E2', ink: '#1A1A1A', ink2: '#4D4D4D', ink3: '#7A7A7A', accent: '#0072B2',
      dirES: '#D55E00', dirPL: '#B0588A', dirTL: '#009E73', dirEN: '#B07A00', shapeF3: '#0072B2', shapeF2H1: '#B0588A', shapeF2H2: '#009E73', ok: '#007A59', bad: '#C24E00',
    },
    dark: {
      paper: '#121212', panel: '#1C1C1C', globe: '#262626', ink: '#F2F2F2', ink2: '#BDBDBD', ink3: '#8A8A8A', accent: '#56B4E9',
      dirES: '#FF8A3D', dirPL: '#E69AC8', dirTL: '#2CCB9A', dirEN: '#F0B429', shapeF3: '#56B4E9', shapeF2H1: '#E69AC8', shapeF2H2: '#2CCB9A', ok: '#2CCB9A', bad: '#FF8A3D',
    },
  },
};

export const isHex = (v: unknown): v is string => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);

/* ------------------------------------------------------------------ colour math */

export function rgbOf(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const toHex = (r: number, g: number, b: number) => '#' + [r, g, b].map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('').toUpperCase();
/** `a` moved `t` of the way toward `b` (sRGB) */
export function mix(a: string, b: string, t: number): string {
  const p = rgbOf(a), q = rgbOf(b);
  return toHex(p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t);
}
const rgba = (hex: string, a: number) => { const [r, g, b] = rgbOf(hex); return `rgba(${r}, ${g}, ${b}, ${a})`; };

export function luminance(hex: string): number {
  const lin = (v: number) => { const s = v / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  const [r, g, b] = rgbOf(hex);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}
export function contrast(a: string, b: string): number {
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

export function derive(c: BaseColors, scheme: Scheme): Derived {
  const dark = scheme === 'dark';
  return {
    panel2: mix(c.panel, c.ink, dark ? 0.05 : 0.04),
    rule: mix(c.panel, c.ink, dark ? 0.16 : 0.17),
    grid: rgba(c.ink, dark ? 0.05 : 0.06),
    off: mix(c.globe, c.ink3, dark ? 0.45 : 0.55),
    scrim: dark ? 'rgba(0, 0, 0, .55)' : rgba(c.ink, 0.28),
    shadow: dark ? '0 12px 36px rgba(0, 0, 0, .45)' : `0 12px 36px ${rgba(c.ink, 0.16)}`,
  };
}

export type ColorOverrides = Partial<Record<BaseKey, string>>;

/** the full palette in effect: preset + user overrides, plus derived colours */
export function resolveTheme(id: ThemeId, scheme: Scheme, overrides: ColorOverrides): { base: BaseColors; derived: Derived } {
  const p = PRESETS[id] ?? PRESETS.blueprint;
  const base = { ...p[scheme] };
  for (const k of BASE_KEYS) if (isHex(overrides[k])) base[k] = overrides[k]!.toUpperCase();
  const touched = (['panel', 'ink', 'globe', 'ink3'] as const).some(k => isHex(overrides[k]));
  const derived = { ...derive(base, scheme), ...(touched ? {} : p.derived?.[scheme] ?? {}) };
  return { base, derived };
}

/** all CSS custom properties of a resolved theme */
export function themeVars(t: { base: BaseColors; derived: Derived }): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of BASE_KEYS) out[TOKEN_OF[k]] = t.base[k];
  out['--panel-2'] = t.derived.panel2;
  out['--rule'] = t.derived.rule;
  out['--grid'] = t.derived.grid;
  out['--off'] = t.derived.off;
  out['--scrim'] = t.derived.scrim;
  out['--shadow'] = t.derived.shadow;
  return out;
}
