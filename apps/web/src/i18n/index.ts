import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { STORAGE_KEY_LANGUAGE } from '@/const/storageKeys';
import { LOCALES, detectBrowserLanguage } from '@/i18n/languages';

const STORAGE_KEY = STORAGE_KEY_LANGUAGE;
const savedLang = localStorage.getItem(STORAGE_KEY) ?? detectBrowserLanguage();

void i18n.use(initReactI18next).init({
  resources: Object.fromEntries(
    Object.entries(LOCALES).map(([code, translation]) => [code, { translation }])
  ),
  lng: savedLang,
  fallbackLng: 'en',
  interpolation: {
    escapeValue: false,
  },
});

export { STORAGE_KEY };
export default i18n;
