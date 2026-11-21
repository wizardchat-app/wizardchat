import type { CustomTheme } from './customTheme';
import { LIGHT_THEMES, THEME_TOKENS } from './themeTokens';

export type ThemeMode = 'system' | 'light' | 'dark';
export type ColorMode = 'light' | 'dark';

export const BUILTIN_THEMES = [
  'Carbon',
  'Pewter',
  'Umbra',
  'Eclipse',
  'Prism',
  'Parrot',
  'Hallow',
  'Garnet',
  'Ethereal',
  'Blossom',
  'Opaline',
] as const;
export type BuiltinTheme = (typeof BUILTIN_THEMES)[number];

export const DEFAULT_SLOTS: Record<ColorMode, BuiltinTheme> = { light: 'Ethereal', dark: 'Carbon' };

export const isBuiltinTheme = (value: string): value is BuiltinTheme =>
  (BUILTIN_THEMES as readonly string[]).includes(value) && value in THEME_TOKENS;

export const builtinMode = (theme: BuiltinTheme): ColorMode =>
  LIGHT_THEMES.has(theme) ? 'light' : 'dark';

export const builtinThemesOf = (mode: ColorMode) =>
  BUILTIN_THEMES.filter((theme) => builtinMode(theme) === mode);

export const slotKey = (mode: ColorMode) => (mode === 'light' ? 'lightTheme' : 'darkTheme');

export function resolveSlot(
  value: string | undefined,
  mode: ColorMode,
  customThemes: CustomTheme[]
): BuiltinTheme | CustomTheme {
  if (value && isBuiltinTheme(value)) return value;
  return customThemes.find((t) => t.id === value) ?? DEFAULT_SLOTS[mode];
}

export function legacyThemeSlot(
  theme: unknown,
  activeCustomTheme: unknown,
  customThemes: CustomTheme[]
): { mode: ColorMode; value: string; wasDefault: boolean } | null {
  if (typeof theme !== 'string') return null;
  if (isBuiltinTheme(theme))
    return { mode: builtinMode(theme), value: theme, wasDefault: theme === DEFAULT_SLOTS.dark };
  if (theme !== 'Custom') return null;
  const custom = customThemes.find((t) => t.id === activeCustomTheme) ?? customThemes[0];
  return custom ? { mode: custom.mode, value: custom.id, wasDefault: false } : null;
}
