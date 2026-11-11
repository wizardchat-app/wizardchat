import { THEME_TOKENS } from '@/theme/themeTokens';
import { activeCustomThemeTokens } from '@/theme/customTheme';
import { DEFAULT_THEME, THEMES } from '@/theme/themes.css';
import type { ThemeName } from '@/app/store/atoms/settings';

export function getThemeTokens() {
  const custom = activeCustomThemeTokens();
  if (custom) return custom;
  const themeName =
    Object.keys(THEMES).find((name) => document.documentElement.classList.contains(THEMES[name])) ??
    DEFAULT_THEME;
  return THEME_TOKENS[themeName] ?? THEME_TOKENS[DEFAULT_THEME];
}

export function toRgbString(value: string): string | null {
  const hex = value.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) {
    const digits =
      hex[1].length === 3
        ? hex[1]
            .split('')
            .map((char) => char + char)
            .join('')
        : hex[1];
    return [
      parseInt(digits.slice(0, 2), 16),
      parseInt(digits.slice(2, 4), 16),
      parseInt(digits.slice(4, 6), 16),
    ].join(', ');
  }
  const rgb = value.trim().match(/^rgba?\(([^)]+)\)$/i);
  if (rgb) return rgb[1].split(',').slice(0, 3).join(', ');
  return null;
}

export function buildCallBackground(theme?: ThemeName): { base: string; glow: string } {
  const tokens = THEME_TOKENS[theme ?? ''] ?? getThemeTokens();
  const accent = toRgbString(tokens.color.accent) ?? '88, 101, 242';
  const purple = toRgbString(tokens.logo.p5) ?? '136, 94, 231';
  const purpleSoft = toRgbString(tokens.logo.p1) ?? '120, 76, 200';

  return {
    base: tokens.color.bgPrimary,
    glow: [
      `radial-gradient(75% 60% at 50% 120%, rgba(${accent}, 0.42) 0%, rgba(${accent}, 0) 62%)`,
      `radial-gradient(55% 50% at 4% -12%, rgba(${purple}, 0.3) 0%, rgba(${purple}, 0) 70%)`,
      `radial-gradient(50% 45% at 96% -8%, rgba(${purpleSoft}, 0.22) 0%, rgba(${purpleSoft}, 0) 70%)`,
    ].join(', '),
  };
}
