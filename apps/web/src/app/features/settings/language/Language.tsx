import { useSetAtom } from 'jotai';
import { useTranslation } from 'react-i18next';
import { languageAtom } from '@/app/store/atoms';
import { SUPPORTED_LANGUAGES, languageLabel } from '@/i18n/languages';
import { Select } from '@/app/components/Select';
import * as css from '../Settings.css';

export function Language() {
  const { t, i18n } = useTranslation();
  const setLanguage = useSetAtom(languageAtom);

  const handleLanguageChange = (lang: string) => {
    i18n.changeLanguage(lang);
    setLanguage(lang);
  };

  return (
    <div>
      <h2 className={css.panelTitle}>{t('settings.language.title')}</h2>

      <div className={css.section}>
        <div className={css.settingRow}>
          <div className={css.settingInfo}>
            <span className={css.settingLabel}>{t('settings.language.languageDisplay')}</span>
          </div>
          <Select
            aria-label={t('settings.language.languageDisplay')}
            value={i18n.language}
            options={SUPPORTED_LANGUAGES.map((code) => ({
              value: code,
              label: languageLabel(code),
            }))}
            onChange={handleLanguageChange}
          />
        </div>
      </div>
    </div>
  );
}
