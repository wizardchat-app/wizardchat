import { themeColors } from '@wizardchat/design-tokens';
import { BASE_LOGO, type ThemeColorTokens } from './themeTokens';

export interface CustomTheme {
  id: string;
  name: string;
  mode: 'dark' | 'light';
  colors: string[];
  angle: number;
  intensity: number;
}

export const MAX_CUSTOM_THEMES = 5;
export const MAX_THEME_COLORS = 5;
const MAX_NAME_LENGTH = 32;

const HEX = /^#[0-9a-f]{6}$/i;

export function newCustomTheme(name: string): CustomTheme {
  return {
    id: crypto.randomUUID(),
    name,
    mode: 'dark',
    colors: ['#5865f2', '#9b6bff'],
    angle: 135,
    intensity: 60,
  };
}

export function isCustomTheme(value: unknown): value is CustomTheme {
  const t = value as Partial<CustomTheme> | null;
  return (
    !!t &&
    typeof t === 'object' &&
    typeof t.id === 'string' &&
    typeof t.name === 'string' &&
    t.name.length <= MAX_NAME_LENGTH &&
    (t.mode === 'dark' || t.mode === 'light') &&
    Array.isArray(t.colors) &&
    t.colors.length >= 1 &&
    t.colors.length <= MAX_THEME_COLORS &&
    t.colors.every((c) => typeof c === 'string' && HEX.test(c)) &&
    typeof t.angle === 'number' &&
    typeof t.intensity === 'number'
  );
}

export const isCustomThemeList = (value: unknown) =>
  Array.isArray(value) && value.length <= MAX_CUSTOM_THEMES && value.every(isCustomTheme);

const FILE_TYPE = 'org.wizardchat.theme';

export function exportCustomTheme(theme: CustomTheme): { blob: Blob; filename: string } {
  const { name, mode, colors, angle, intensity } = theme;
  const json = JSON.stringify(
    { type: FILE_TYPE, version: 1, name, mode, colors, angle, intensity },
    null,
    2
  );
  const safe = name.replace(/[^\p{L}\p{N} _-]/gu, '').trim() || 'theme';
  return { blob: new Blob([json], { type: 'application/json' }), filename: `${safe}.json` };
}

export function importCustomTheme(text: string): CustomTheme | null {
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (!data || typeof data !== 'object' || data.type !== FILE_TYPE) return null;
  const clamp = (v: unknown, max: number) =>
    typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(0, Math.round(v))) : v;
  const theme = {
    id: crypto.randomUUID(),
    name: typeof data.name === 'string' ? data.name.slice(0, MAX_NAME_LENGTH) : data.name,
    mode: data.mode,
    colors: Array.isArray(data.colors)
      ? data.colors.map((c) => (typeof c === 'string' ? c.toLowerCase() : c))
      : data.colors,
    angle: clamp(data.angle, 360),
    intensity: clamp(data.intensity, 100),
  };
  return isCustomTheme(theme) ? theme : null;
}

type Rgb = [number, number, number];

const toRgb = (hex: string): Rgb => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as Rgb;
const toHex = (rgb: Rgb) =>
  `#${rgb
    .map((c) =>
      Math.round(Math.min(255, Math.max(0, c)))
        .toString(16)
        .padStart(2, '0')
    )
    .join('')}`;

export function mix(a: string, b: string, amount: number): string {
  const [x, y] = [toRgb(a), toRgb(b)];
  return toHex(x.map((c, i) => c + (y[i] - c) * amount) as Rgb);
}

const withAlpha = (hex: string, alpha: number) =>
  `${hex}${Math.round(alpha * 255)
    .toString(16)
    .padStart(2, '0')}`;

const rgba = (hex: string, alpha: number) => `rgba(${toRgb(hex).join(', ')}, ${alpha})`;

function luminance(hex: string): number {
  const [r, g, b] = toRgb(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function saturation(hex: string): number {
  const [r, g, b] = toRgb(hex).map((c) => c / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return max === 0 ? 0 : (max - min) / max;
}

const average = (colors: string[]) =>
  toHex(
    [0, 1, 2].map((i) => colors.reduce((sum, c) => sum + toRgb(c)[i], 0) / colors.length) as Rgb
  );

const NEUTRALS = {
  dark: { app: '#0d0e12', surface: '#16171c', raised: '#202127', text: '#eceef3' },
  light: { app: '#e9ebef', surface: '#ffffff', raised: '#f1f2f5', text: '#15161b' },
};

const veil = (theme: CustomTheme) =>
  0.88 - (Math.min(100, Math.max(0, theme.intensity)) / 100) * 0.6;

function accentOf(theme: CustomTheme): string {
  let accent = [...theme.colors].sort((a, b) => saturation(b) - saturation(a))[0];
  for (let i = 0; i < 10; i++) {
    const l = luminance(accent);
    if (theme.mode === 'dark' ? l >= 0.16 : l <= 0.22) break;
    accent = mix(accent, theme.mode === 'dark' ? '#ffffff' : '#000000', 0.15);
  }
  return accent;
}

type Colors = (typeof themeColors)['carbon']['color'];

export function customThemeColors(theme: CustomTheme): Colors {
  const light = theme.mode === 'light';
  const base = themeColors[light ? 'ethereal' : 'carbon'].color;
  const n = NEUTRALS[theme.mode];
  const tint = average(theme.colors);
  const show = 1 - veil(theme);
  const app = mix(n.app, tint, show);
  const surface = mix(n.surface, tint, show * 0.85);
  const raised = mix(n.raised, tint, show * 0.7);
  const toward = light ? '#000000' : '#ffffff';
  const text = (amount: number) => mix(n.text, light ? '#ffffff' : '#000000', amount);
  const accent = accentOf(theme);

  return {
    ...base,
    bg: {
      app,
      surface,
      raised,
      input: mix(surface, toward, light ? 0.02 : 0.04),
      hover: light ? withAlpha('#000000', 0.05) : withAlpha('#ffffff', 0.06),
      active: withAlpha(accent, light ? 0.16 : 0.24),
      overlay: light ? '#1a1a2e66' : '#000000a6',
    },
    text: {
      primary: text(0),
      secondary: text(0.2),
      muted: text(0.38),
      disabled: text(0.52),
      onAccent: luminance(accent) > 0.5 ? '#111118' : '#ffffff',
      link: base.text.link,
    },
    accent: {
      default: accent,
      hover: mix(accent, toward, 0.15),
      soft: withAlpha(accent, light ? 0.14 : 0.18),
      glow1: withAlpha(accent, 0.08),
      glow2: withAlpha(accent, 0.05),
    },
    border: {
      default: mix(surface, toward, light ? 0.1 : 0.1),
      strong: mix(surface, toward, light ? 0.22 : 0.22),
      focus: light ? accent : mix(accent, '#ffffff', 0.35),
    },
    message: {
      ...base.message,
      mine: mix(accent, surface, light ? 0.78 : 0.5),
      other: raised,
    },
    logo: base.logo,
  };
}

export function gradientOf(theme: Pick<CustomTheme, 'colors' | 'angle'>): string {
  const [first] = theme.colors;
  if (theme.colors.length < 2) return `linear-gradient(${first}, ${first})`;
  return `linear-gradient(${theme.angle}deg, ${theme.colors.join(', ')})`;
}

function backdropVars(theme: CustomTheme): Record<string, string> {
  const n = NEUTRALS[theme.mode];
  const v = veil(theme);
  const layer = (grey: string, alpha: number) =>
    `linear-gradient(${rgba(grey, alpha)}, ${rgba(grey, alpha)}), ${gradientOf(theme)}`;
  return {
    '--wz-backdrop-primary': layer(n.app, v),
    '--wz-backdrop-secondary': layer(n.surface, Math.min(1, v + 0.08)),
  };
}

const kebab = (key: string) => key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
const rgbString = (hex: string) => toRgb(hex).join(', ');

function themeCssVars(colors: Colors): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [group, values] of Object.entries(colors))
    for (const [name, value] of Object.entries(values as Record<string, string>))
      out[`--wz-color-${group}-${kebab(name)}`] = value;
  out['--wz-accent-rgb'] = rgbString(colors.accent.default);
  return out;
}

export function customThemeTokens(theme: CustomTheme): ThemeColorTokens {
  const c = customThemeColors(theme);
  return {
    logo: BASE_LOGO,
    color: {
      bgPrimary: c.bg.app,
      bgSecondary: c.bg.surface,
      bgTertiary: c.bg.raised,
      bgInput: c.bg.input,
      bgHover: c.bg.hover,
      bgActive: c.bg.active,
      accent: c.accent.default,
      accentRgb: rgbString(c.accent.default),
      accentHover: c.accent.hover,
      link: c.text.link,
      textPrimary: c.text.primary,
      textMuted: c.text.muted,
      textSecondary: c.text.disabled,
      border: c.border.default,
      msgMineBg: c.message.mine,
      msgOtherBg: c.message.other,
      mention: c.status.mention,
      error: c.status.error,
      danger: c.status.danger,
      success: c.status.success,
      warning: c.status.warning,
      bgAccentGlow1: c.accent.glow1,
      bgAccentGlow2: c.accent.glow2,
    },
    username: c.username,
    radius: { sm: '4px', md: '8px', lg: '18px' },
    font: { body: "'Roboto', sans-serif" },
  };
}

export function randomColors(): string[] {
  const hue = Math.random() * 360;
  const count = 2 + Math.floor(Math.random() * 2);
  const spread = 30 + Math.random() * 90;
  return Array.from({ length: count }, (_, i) =>
    hsvToHex((hue + i * spread) % 360, 0.55 + Math.random() * 0.35, 0.6 + Math.random() * 0.35)
  );
}

export function hsvToHex(h: number, s: number, v: number): string {
  const f = (n: number) => {
    const k = (n + h / 60) % 6;
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
  };
  return toHex([f(5) * 255, f(3) * 255, f(1) * 255]);
}

export function hexToHsv(hex: string): [number, number, number] {
  const [r, g, b] = toRgb(hex).map((c) => c / 255);
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
  }
  return [(h * 60 + 360) % 360, max ? d / max : 0, max];
}

let applied: string[] = [];
let activeTokens: ThemeColorTokens | null = null;

export const activeCustomThemeTokens = () => activeTokens;

export function applyCustomTheme(theme: CustomTheme | null): void {
  const style = document.documentElement.style;
  for (const name of applied) style.removeProperty(name);
  applied = [];
  activeTokens = null;
  if (!theme) return;
  const values = { ...themeCssVars(customThemeColors(theme)), ...backdropVars(theme) };
  for (const [name, value] of Object.entries(values)) {
    style.setProperty(name, value);
    applied.push(name);
  }
  activeTokens = customThemeTokens(theme);
}
