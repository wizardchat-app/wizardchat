import { useRef } from 'react';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import type { CustomTheme } from '@/theme/customTheme';
import { useTranslation } from 'react-i18next';
import { PlusIcon, UploadSimpleIcon } from '@phosphor-icons/react';
import {
  colorModeAtom,
  customThemesAtom,
  darkThemeAtom,
  lightThemeAtom,
  settingsOpenAtom,
  themeEditorAtom,
} from '@/app/store/atoms';
import { Tooltip } from '@/app/components/Tooltip';
import { MAX_CUSTOM_THEMES, importCustomTheme, newCustomTheme } from '@/theme/customTheme';
import { useToast } from '@/app/hooks/useToast';
import * as layoutCss from '../Settings.css';
import * as css from './Appearance.css';

export function CustomThemes() {
  const { t } = useTranslation();
  const [themes, setThemes] = useAtom(customThemesAtom);
  const colorMode = useAtomValue(colorModeAtom);
  const setLightTheme = useSetAtom(lightThemeAtom);
  const setDarkTheme = useSetAtom(darkThemeAtom);
  const setEditing = useSetAtom(themeEditorAtom);
  const openSettings = useSetAtom(settingsOpenAtom);
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const add = (theme: CustomTheme) => {
    setThemes([...themes, theme]);
    (theme.mode === 'light' ? setLightTheme : setDarkTheme)(theme.id);
  };
  const create = () => {
    const theme = {
      ...newCustomTheme(t('settings.appearance.customThemeName', { number: themes.length + 1 })),
      mode: colorMode,
    };
    add(theme);
    setEditing(theme.id);
    openSettings(false);
  };

  const importFile = async (file: File | undefined) => {
    if (!file) return;
    const theme = importCustomTheme(await file.text());
    if (!theme) {
      toast.error(t('settings.appearance.importThemeFailed'));
      return;
    }
    add(theme);
  };

  const full = themes.length >= MAX_CUSTOM_THEMES;
  const fullNote = t('settings.appearance.customThemesFull', { count: MAX_CUSTOM_THEMES });

  return (
    <div className={layoutCss.settingRow}>
      <div className={layoutCss.settingInfo}>
        <span className={layoutCss.settingLabel}>{t('settings.appearance.customThemes')}</span>
        <span className={layoutCss.settingNote}>
          {t('settings.appearance.customThemesNote', { count: MAX_CUSTOM_THEMES })}
        </span>
      </div>
      <div className={css.swatchRow}>
        <Tooltip content={full ? fullNote : t('settings.appearance.newCustomTheme')}>
          <button
            type="button"
            aria-label={t('settings.appearance.newCustomTheme')}
            aria-disabled={full}
            onClick={full ? undefined : create}
            className={full ? css.addSwatchDisabled : css.addSwatch}
          >
            <PlusIcon size={16} weight="bold" />
          </button>
        </Tooltip>
        <Tooltip content={full ? fullNote : t('settings.appearance.importTheme')}>
          <button
            type="button"
            aria-label={t('settings.appearance.importTheme')}
            aria-disabled={full}
            onClick={full ? undefined : () => fileRef.current?.click()}
            className={full ? css.addSwatchDisabled : css.addSwatch}
          >
            <UploadSimpleIcon size={16} weight="bold" />
          </button>
        </Tooltip>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={(e) => {
            void importFile(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
      </div>
    </div>
  );
}
