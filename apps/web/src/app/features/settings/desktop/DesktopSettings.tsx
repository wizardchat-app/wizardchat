import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ToggleRow } from '@/app/components/Toggle';
import * as css from '../Settings.css';
import * as desktopCss from './DesktopSettings.css';

export function DesktopSettings() {
  const { t } = useTranslation();
  const [settings, setSettings] = useState<DesktopWindowSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isMac = window.desktopAPI?.getPlatform?.() === 'darwin';

  useEffect(() => {
    void window.desktopAPI
      ?.getWindowSettings?.()
      .then(setSettings)
      .catch(() => {});
  }, []);

  const update = (patch: Partial<DesktopWindowSettings>) => {
    if (!settings) return;
    setSettings({ ...settings, ...patch });
    setError(null);
    void window.desktopAPI
      ?.setWindowSettings?.(patch)
      .then(setSettings)
      .catch((reason: unknown) => {
        setError(t('settings.desktop.saveFailed', { error: String(reason) }));
        void window.desktopAPI?.getWindowSettings?.().then(setSettings);
      });
  };

  return (
    <div>
      <h2 className={css.panelTitle}>{t('settings.desktop.title')}</h2>
      {settings && (
        <div className={css.section}>
          <ToggleRow
            label={t('settings.desktop.launchAtLogin')}
            description={t('settings.desktop.launchAtLoginNote')}
            checked={settings.launchAtLogin}
            onChange={(on) => update({ launchAtLogin: on })}
          />
          <ToggleRow
            label={t('settings.desktop.startMinimized')}
            description={t('settings.desktop.startMinimizedNote')}
            checked={settings.startMinimized}
            disabled={!settings.launchAtLogin}
            onChange={(on) => update({ startMinimized: on })}
          />
          {!isMac && (
            <ToggleRow
              label={t('settings.desktop.closeToTray')}
              description={t('settings.desktop.closeToTrayNote')}
              checked={settings.closeToTray}
              onChange={(on) => update({ closeToTray: on })}
            />
          )}
          {error && <p className={desktopCss.errorText}>{error}</p>}
        </div>
      )}
    </div>
  );
}
