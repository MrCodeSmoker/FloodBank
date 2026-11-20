import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { languages, resources } from './languages.js';

i18n.use(initReactI18next).init({
  resources,
  supportedLngs: languages.map(language => language.code),
  lng: typeof localStorage === 'undefined' ? 'en' : localStorage.getItem('floodbank-language') || 'en',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
  returnEmptyString: false,
  initImmediate: false
});

export default i18n;
