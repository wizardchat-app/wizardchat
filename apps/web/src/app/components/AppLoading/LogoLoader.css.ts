import { style, keyframes, styleVariants } from '@vanilla-extract/css';
import { THEME_TOKENS, type ThemeLogoTokens } from '@/theme/themeTokens';

type ThemeKey = keyof typeof THEME_TOKENS;

const THEMES = Object.keys(THEME_TOKENS) as ThemeKey[];

const rampOf = (logo: ThemeLogoTokens['logo']): string[] => [
  logo.p4,
  logo.p0,
  logo.p1,
  logo.p5,
  logo.hover,
];

const CYCLE = Object.fromEntries(
  THEMES.map((theme) => {
    const [c1, c2, c3, c4, c5] = rampOf(THEME_TOKENS[theme].logo);
    return [
      theme,
      keyframes({
        '0%': { fill: c2 },
        '16%': { fill: c4 },
        '33%': { fill: c5 },
        '50%': { fill: c4 },
        '66%': { fill: c3 },
        '83%': { fill: c1 },
        '100%': { fill: c2 },
      }),
    ];
  })
) as Record<ThemeKey, string>;

const DURATION = '2.4s';
const TIMING = 'ease-in-out';
const ITER = 'infinite';

const DELAYS = ['-0.4s', '-0.8s', '-1.2s', '0s', '-1.6s', '-2.0s'];

const BASE = {
  animationDuration: DURATION,
  animationTimingFunction: TIMING,
  animationIterationCount: ITER,
} as const;

function polygonVariants(index: number) {
  return styleVariants(
    Object.fromEntries(
      THEMES.map((theme) => [
        theme,
        { ...BASE, animationName: CYCLE[theme], animationDelay: DELAYS[index] },
      ])
    )
  );
}

export const p0 = polygonVariants(0);
export const p1 = polygonVariants(1);
export const p2 = polygonVariants(2);
export const p3 = polygonVariants(3);
export const p4 = polygonVariants(4);
export const p5 = polygonVariants(5);

export const svg = style({
  width: '80px',
  height: '80px',
});
