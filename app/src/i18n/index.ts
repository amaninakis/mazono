import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import type { Language } from '../core/types';
import el from './locales/el.json';
import en from './locales/en.json';

/**
 * To add a language: copy locales/en.json to locales/<code>.json, translate the values,
 * import it here and add it to LANGUAGES.
 */
export const LANGUAGES: { code: Language; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'el', label: 'Ελληνικά' },
];

export function deviceLanguage(): Language {
  const nav = typeof navigator !== 'undefined' ? navigator.language : 'en';
  return nav.toLowerCase().startsWith('el') ? 'el' : 'en';
}

i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, el: { translation: el } },
  lng: deviceLanguage(),
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

export function setLanguage(lng: Language) {
  void i18n.changeLanguage(lng);
  document.documentElement.lang = lng;
}

export default i18n;
