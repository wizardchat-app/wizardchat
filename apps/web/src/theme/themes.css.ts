import { style } from '@vanilla-extract/css';
import { themeColors, type ThemeId } from '@wizardchat/design-tokens';
import { BASE_LOGO } from './themeTokens';

type Colors = (typeof themeColors)[ThemeId]['color'];

const kebab = (key: string) => key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

function rgbOf(hex: string): string {
  const h = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)).join(', ');
}

/** Every theme colour as the CSS variables the design tokens define */
function themeVars(colors: Colors): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [group, values] of Object.entries(colors))
    for (const [name, value] of Object.entries(values as Record<string, string>))
      out[`--wz-color-${group}-${kebab(name)}`] = value;
  out['--wz-accent-rgb'] = rgbOf(colors.accent.default);
  return out;
}

const themeClass = (id: ThemeId) =>
  style({ selectors: { 'html&': { vars: themeVars(themeColors[id].color) } } });

export const THEMES: Record<string, string> = {
  Carbon: themeClass('carbon'),
  Parrot: themeClass('parrot'),
  Hallow: themeClass('hallow'),
  Ethereal: themeClass('ethereal'),
  Pewter: themeClass('pewter'),
  Umbra: themeClass('umbra'),
  Eclipse: themeClass('eclipse'),
  Garnet: themeClass('garnet'),
  Blossom: themeClass('blossom'),
  Custom: style({}),
};

export const DEFAULT_THEME = 'Carbon';

/** The app icon in its default colours, whatever the theme */
export const baseLogoClass = style({
  selectors: {
    'html&': {
      vars: Object.fromEntries(
        Object.entries(BASE_LOGO).map(([k, v]) => [`--wz-color-logo-${kebab(k)}`, v])
      ),
    },
  },
});
