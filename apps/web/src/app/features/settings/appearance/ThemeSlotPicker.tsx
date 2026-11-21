import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { useTranslation } from 'react-i18next';
import { DesktopIcon, MoonIcon, PencilSimpleIcon, SunIcon } from '@phosphor-icons/react';
import {
  colorModeAtom,
  customThemesAtom,
  settingsOpenAtom,
  themeEditorAtom,
  themeModeAtom,
  themeSlotAtom,
  type ColorMode,
  type ThemeMode,
} from '@/app/store/atoms';
import { Tooltip } from '@/app/components/Tooltip';
import { gradientOf } from '@/theme/customTheme';
import { THEME_TOKENS } from '@/theme/themeTokens';
import { builtinThemesOf, resolveSlot } from '@/theme/themeSlots';
import * as layoutCss from '../Settings.css';
import * as css from './Appearance.css';

const MODES: { mode: ThemeMode; icon: typeof SunIcon; label: string }[] = [
  { mode: 'system', icon: DesktopIcon, label: 'settings.appearance.themeModeSystem' },
  { mode: 'light', icon: SunIcon, label: 'settings.appearance.themeModeLight' },
  { mode: 'dark', icon: MoonIcon, label: 'settings.appearance.themeModeDark' },
];

export function ThemeModeControl() {
  const { t } = useTranslation();
  const [themeMode, setThemeMode] = useAtom(themeModeAtom);
  const label = t('settings.appearance.themeMode');

  return (
    <div className={layoutCss.settingRow}>
      <div className={layoutCss.settingInfo}>
        <span className={layoutCss.settingLabel}>{label}</span>
      </div>
      <div className={css.modeSegmented} role="radiogroup" aria-label={label}>
        {MODES.map(({ mode, icon: Icon, label: modeLabel }) => (
          <button
            key={mode}
            type="button"
            role="radio"
            aria-checked={themeMode === mode}
            className={themeMode === mode ? css.modeSegmentActive : css.modeSegment}
            onClick={() => setThemeMode(mode)}
          >
            <Icon size={16} weight={themeMode === mode ? 'fill' : 'regular'} />
            {t(modeLabel)}
          </button>
        ))}
      </div>
    </div>
  );
}

export function ThemeSlotPicker({ mode }: { mode: ColorMode }) {
  const { t } = useTranslation();
  const inUse = useAtomValue(colorModeAtom) === mode;
  const [slot, setSlot] = useAtom(themeSlotAtom(mode));
  const customThemes = useAtomValue(customThemesAtom);
  const setEditing = useSetAtom(themeEditorAtom);
  const openSettings = useSetAtom(settingsOpenAtom);
  const resolved = resolveSlot(slot, mode, customThemes);
  const selected = typeof resolved === 'string' ? resolved : resolved.id;
  const label = t(
    mode === 'light' ? 'settings.appearance.lightTheme' : 'settings.appearance.darkTheme'
  );

  const edit = (id: string) => {
    setSlot(id);
    setEditing(id);
    openSettings(false);
  };

  return (
    <div className={inUse ? layoutCss.settingRow : `${layoutCss.settingRow} ${css.slotUnused}`}>
      <div className={layoutCss.settingInfo}>
        <span className={layoutCss.settingLabel}>{label}</span>
      </div>
      <div
        className={css.swatchRow}
        role="radiogroup"
        aria-label={inUse ? `${label}, ${t('settings.appearance.themeInUse')}` : label}
      >
        {builtinThemesOf(mode).map((name) => {
          const { color } = THEME_TOKENS[name];
          const isActive = selected === name;
          return (
            <Tooltip key={name} content={name}>
              <button
                type="button"
                role="radio"
                aria-checked={isActive}
                aria-label={name}
                onClick={() => setSlot(name)}
                className={isActive ? css.swatchActive : css.swatch}
                style={{
                  background: `linear-gradient(135deg, ${color.bgSecondary} calc(50% - 0.5px), ${color.accent} calc(50% + 0.5px))`,
                }}
              />
            </Tooltip>
          );
        })}
        {customThemes
          .filter((theme) => theme.mode === mode)
          .map((theme) => (
            <div key={theme.id} className={css.slot}>
              <Tooltip content={theme.name}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={selected === theme.id}
                  aria-label={theme.name}
                  onClick={() => setSlot(theme.id)}
                  className={selected === theme.id ? css.swatchActive : css.swatch}
                  style={{ background: gradientOf(theme) }}
                />
              </Tooltip>
              <Tooltip content={t('settings.appearance.editCustomTheme', { name: theme.name })}>
                <button
                  type="button"
                  aria-label={t('settings.appearance.editCustomTheme', { name: theme.name })}
                  onClick={() => edit(theme.id)}
                  className={css.slotEdit}
                >
                  <PencilSimpleIcon size={11} weight="bold" />
                </button>
              </Tooltip>
            </div>
          ))}
      </div>
    </div>
  );
}
