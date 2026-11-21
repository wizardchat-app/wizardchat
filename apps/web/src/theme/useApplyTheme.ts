import { useEffect } from 'react';
import { useAtomValue } from 'jotai';
import { activeCustomThemeAtom, themeAtom } from '@/app/store/atoms/settings';
import { DEFAULT_THEME, THEMES } from './themes.css';
import { LIGHT_THEMES, THEME_TOKENS } from './themeTokens';
import { applyCustomTheme, customThemeTokens } from './customTheme';

export function useApplyTheme(onApplied?: (bg: string, text: string) => void) {
  const theme = useAtomValue(themeAtom);
  const custom = useAtomValue(activeCustomThemeAtom);
  useEffect(() => {
    const root = document.documentElement;
    Object.values(THEMES).forEach((cls) => root.classList.remove(cls));
    const shown = theme === 'Custom' && !custom ? DEFAULT_THEME : theme;
    root.classList.add(THEMES[shown] ?? THEMES[DEFAULT_THEME]);
    root.dataset.wzTheme = shown;
    applyCustomTheme(custom);
    root.style.colorScheme = (custom ? custom.mode === 'light' : LIGHT_THEMES.has(shown))
      ? 'light'
      : 'dark';
    const { color } = custom
      ? customThemeTokens(custom)
      : (THEME_TOKENS[shown] ?? THEME_TOKENS[DEFAULT_THEME]);
    document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => {
      meta.setAttribute('content', color.bgPrimary);
      meta.removeAttribute('media');
    });
    onApplied?.(color.bgPrimary, color.textPrimary);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme, custom]);
}
