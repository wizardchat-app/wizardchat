import { useRef } from 'react';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { useTranslation } from 'react-i18next';
import { PencilSimpleIcon, PlusIcon, UploadSimpleIcon } from '@phosphor-icons/react';
import {
  activeCustomThemeAtom,
  activeCustomThemeIdAtom,
  customThemesAtom,
  settingsOpenAtom,
  themeAtom,
  themeEditorAtom,
} from '@/app/store/atoms';
import { Tooltip } from '@/app/components/Tooltip';
import {
  MAX_CUSTOM_THEMES,
  gradientOf,
  importCustomTheme,
  newCustomTheme,
} from '@/theme/customTheme';
import { useToast } from '@/app/hooks/useToast';
import * as layoutCss from '../Settings.css';
import * as css from './Appearance.css';

export function CustomThemes() {
  const { t } = useTranslation();
  const [themes, setThemes] = useAtom(customThemesAtom);
  const setTheme = useSetAtom(themeAtom);
  const setActiveId = useSetAtom(activeCustomThemeIdAtom);
  const active = useAtomValue(activeCustomThemeAtom);
  const setEditing = useSetAtom(themeEditorAtom);
  const openSettings = useSetAtom(settingsOpenAtom);
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const show = (id: string) => {
    setActiveId(id);
    setTheme('Custom');
  };
  const edit = (id: string) => {
    show(id);
    setEditing(id);
    openSettings(false);
  };
  const create = () => {
    const theme = newCustomTheme(
      t('settings.appearance.customThemeName', { number: themes.length + 1 })
    );
    setThemes([...themes, theme]);
    edit(theme.id);
  };

  const importFile = async (file: File | undefined) => {
    if (!file) return;
    const theme = importCustomTheme(await file.text());
    if (!theme) {
      toast.error(t('settings.appearance.importThemeFailed'));
      return;
    }
    setThemes([...themes, theme]);
    show(theme.id);
  };

  return (
    <div className={layoutCss.settingRow}>
      <div className={layoutCss.settingInfo}>
        <span className={layoutCss.settingLabel}>{t('settings.appearance.customThemes')}</span>
        <span className={layoutCss.settingNote}>
          {t('settings.appearance.customThemesNote', { count: MAX_CUSTOM_THEMES })}
        </span>
      </div>
      <div
        className={css.swatchRow}
        role="radiogroup"
        aria-label={t('settings.appearance.customThemes')}
      >
        {themes.map((theme) => (
          <div key={theme.id} className={css.slot}>
            <Tooltip content={theme.name}>
              <button
                type="button"
                role="radio"
                aria-checked={active?.id === theme.id}
                aria-label={theme.name}
                onClick={() => show(theme.id)}
                className={active?.id === theme.id ? css.swatchActive : css.swatch}
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
        {themes.length < MAX_CUSTOM_THEMES && (
          <>
            <Tooltip content={t('settings.appearance.newCustomTheme')}>
              <button
                type="button"
                aria-label={t('settings.appearance.newCustomTheme')}
                onClick={create}
                className={css.addSwatch}
              >
                <PlusIcon size={16} weight="bold" />
              </button>
            </Tooltip>
            <Tooltip content={t('settings.appearance.importTheme')}>
              <button
                type="button"
                aria-label={t('settings.appearance.importTheme')}
                onClick={() => fileRef.current?.click()}
                className={css.addSwatch}
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
          </>
        )}
      </div>
    </div>
  );
}
