import { useState } from 'react';
import { useAtom, useSetAtom } from 'jotai';
import { useTranslation } from 'react-i18next';
import {
  DiceFiveIcon,
  DownloadSimpleIcon,
  MinusIcon,
  MoonIcon,
  PlusIcon,
  SunIcon,
  TrashIcon,
  XIcon,
} from '@phosphor-icons/react';
import {
  activeCustomThemeIdAtom,
  customThemesAtom,
  settingsOpenAtom,
  settingsPageAtom,
  themeAtom,
  themeEditorAtom,
} from '@/app/store/atoms';
import { Button } from '@/app/components/Button/Button';
import { Slider } from '@/app/components/Slider';
import { Tooltip } from '@/app/components/Tooltip';
import {
  MAX_THEME_COLORS,
  exportCustomTheme,
  gradientOf,
  newCustomTheme,
  randomColors,
  type CustomTheme,
} from '@/theme/customTheme';
import { downloadBlob } from '@/util/nativeApp';
import * as sidePanelCss from '@/app/pages/client/SidePanel.css';
import { ColorPicker } from './ColorPicker';
import * as css from './ThemeEditor.css';

const ANGLES = Array.from({ length: 25 }, (_, i) => i * 15);
const INTENSITIES = Array.from({ length: 21 }, (_, i) => i * 5);
const HEX = /^#[0-9a-f]{6}$/i;

/** Discord-style editor for one custom theme, in the right-hand side panel */
export function ThemeEditorPanel() {
  const { t } = useTranslation();
  const [editingId, setEditingId] = useAtom(themeEditorAtom);
  const [themes, setThemes] = useAtom(customThemesAtom);
  const setActiveId = useSetAtom(activeCustomThemeIdAtom);
  const setTheme = useSetAtom(themeAtom);
  const openSettings = useSetAtom(settingsOpenAtom);
  const setSettingsPage = useSetAtom(settingsPageAtom);
  const [selected, setSelected] = useState(0);
  const [hexText, setHexText] = useState<string | null>(null);

  const theme = themes.find((th) => th.id === editingId);
  if (!theme) return null;

  const update = (patch: Partial<CustomTheme>) =>
    setThemes(themes.map((th) => (th.id === theme.id ? { ...th, ...patch } : th)));
  const index = Math.min(selected, theme.colors.length - 1);
  const color = theme.colors[index];
  const setColor = (value: string) =>
    update({ colors: theme.colors.map((c, i) => (i === index ? value : c)) });

  const close = () => setEditingId(null);
  const backToSettings = () => {
    close();
    setSettingsPage('appearance');
    openSettings(true);
  };
  const remove = () => {
    const rest = themes.filter((th) => th.id !== theme.id);
    setThemes(rest);
    setActiveId(rest[0]?.id ?? null);
    if (rest.length === 0) setTheme('Carbon');
    backToSettings();
  };

  return (
    <aside
      className={`${sidePanelCss.sidePanelOpen} ${css.panel}`}
      aria-label={t('themeEditor.title')}
    >
      <div className={sidePanelCss.sidePanelHeader}>
        <span className={sidePanelCss.sidePanelTitle}>{t('themeEditor.title')}</span>
        <button
          type="button"
          className={sidePanelCss.sidePanelClose}
          onClick={close}
          aria-label={t('common.close')}
        >
          <XIcon size={16} />
        </button>
      </div>

      <div className={css.body}>
        <section className={css.section}>
          <label className={css.sectionTitle} htmlFor="theme-editor-name">
            {t('themeEditor.name')}
          </label>
          <input
            id="theme-editor-name"
            className={css.textInput}
            value={theme.name}
            maxLength={32}
            onChange={(e) => update({ name: e.target.value })}
          />
        </section>

        <section className={css.section}>
          <span className={css.sectionTitle}>{t('themeEditor.appearance')}</span>
          <div className={css.segmented} role="radiogroup" aria-label={t('themeEditor.appearance')}>
            {(['dark', 'light'] as const).map((mode) => (
              <Tooltip key={mode} content={t(`themeEditor.${mode}`)}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={theme.mode === mode}
                  aria-label={t(`themeEditor.${mode}`)}
                  className={theme.mode === mode ? css.segmentActive : css.segment}
                  onClick={() => update({ mode })}
                >
                  {mode === 'dark' ? (
                    <MoonIcon size={16} weight="fill" />
                  ) : (
                    <SunIcon size={16} weight="fill" />
                  )}
                </button>
              </Tooltip>
            ))}
          </div>
        </section>

        <section className={css.section}>
          <span className={css.sectionTitle}>{t('themeEditor.colors')}</span>
          <div className={css.strip} style={{ background: gradientOf({ ...theme, angle: 90 }) }}>
            {theme.colors.map((c, i) => (
              <button
                key={i}
                type="button"
                className={i === index ? css.stopActive : css.stop}
                style={{ backgroundColor: c }}
                aria-label={t('themeEditor.colorNumber', { number: i + 1 })}
                aria-pressed={i === index}
                onClick={() => {
                  setSelected(i);
                  setHexText(null);
                }}
              />
            ))}
          </div>
          <ColorPicker value={color} onChange={setColor} label={t('themeEditor.colors')} />
          <div className={css.hexRow}>
            <span className={css.hexSwatch} style={{ backgroundColor: color }} />
            <input
              className={css.hexInput}
              value={hexText ?? color}
              maxLength={7}
              spellCheck={false}
              aria-label={t('themeEditor.hex')}
              onChange={(e) => {
                const next = e.target.value.startsWith('#') ? e.target.value : `#${e.target.value}`;
                setHexText(next);
                if (HEX.test(next)) setColor(next.toLowerCase());
              }}
              onBlur={() => setHexText(null)}
            />
            {theme.colors.length > 1 && (
              <Tooltip content={t('themeEditor.removeColor')}>
                <button
                  type="button"
                  className={css.iconButton}
                  aria-label={t('themeEditor.removeColor')}
                  onClick={() => {
                    update({ colors: theme.colors.filter((_, i) => i !== index) });
                    setSelected(Math.max(0, index - 1));
                  }}
                >
                  <MinusIcon size={16} />
                </button>
              </Tooltip>
            )}
          </div>
          {theme.colors.length < MAX_THEME_COLORS && (
            <Button
              variant="secondary"
              size="md"
              onClick={() => {
                update({ colors: [...theme.colors, color] });
                setSelected(theme.colors.length);
              }}
            >
              <PlusIcon size={14} weight="bold" /> {t('themeEditor.addColor')}
            </Button>
          )}
        </section>

        <section className={css.section}>
          <span className={css.sectionTitle}>{t('themeEditor.controls')}</span>
          <div className={css.control}>
            <span className={css.controlLabel}>
              {t('themeEditor.direction')}
              <span className={css.controlValue}>{theme.angle}°</span>
            </span>
            <Slider
              value={theme.angle}
              stops={ANGLES}
              defaultValue={135}
              onChange={(angle) => update({ angle })}
              onDoubleClick={() => update({ angle: 135 })}
              labels={false}
              className={css.slider}
              aria-label={t('themeEditor.direction')}
            />
          </div>
          <div className={css.control}>
            <span className={css.controlLabel}>
              {t('themeEditor.intensity')}
              <span className={css.controlValue}>{theme.intensity}%</span>
            </span>
            <Slider
              value={theme.intensity}
              stops={INTENSITIES}
              defaultValue={60}
              onChange={(intensity) => update({ intensity })}
              onDoubleClick={() => update({ intensity: 60 })}
              labels={false}
              className={css.slider}
              aria-label={t('themeEditor.intensity')}
            />
          </div>
        </section>

        <section className={css.section}>
          <Button
            variant="secondary"
            size="md"
            onClick={() => {
              setSelected(0);
              update({
                colors: randomColors(),
                angle: ANGLES[Math.floor(Math.random() * ANGLES.length)],
              });
            }}
          >
            <DiceFiveIcon size={16} /> {t('themeEditor.surprise')}
          </Button>
          <Button
            variant="secondary"
            size="md"
            onClick={() => {
              const fresh = newCustomTheme(theme.name);
              setSelected(0);
              update({
                mode: fresh.mode,
                colors: fresh.colors,
                angle: fresh.angle,
                intensity: fresh.intensity,
              });
            }}
          >
            {t('themeEditor.reset')}
          </Button>
          <Button
            variant="secondary"
            size="md"
            onClick={() => {
              const { blob, filename } = exportCustomTheme(theme);
              downloadBlob(blob, filename);
            }}
          >
            <DownloadSimpleIcon size={16} /> {t('themeEditor.export')}
          </Button>
          <Button variant="danger" size="md" onClick={remove}>
            <TrashIcon size={16} /> {t('themeEditor.delete')}
          </Button>
        </section>
      </div>

      <div className={css.footer}>
        <Button variant="primary" size="md" onClick={backToSettings}>
          {t('themeEditor.backToSettings')}
        </Button>
      </div>
    </aside>
  );
}
