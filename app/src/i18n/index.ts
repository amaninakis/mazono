import i18n from 'i18next';
import { computed, ref } from 'vue';
import { formatLocaleFor } from '../core/locale';
import type { DateFormat, Language } from '../core/types';
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

void i18n.init({
  resources: { en: { translation: en }, el: { translation: el } },
  lng: deviceLanguage(),
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

/** Current language as a Vue ref, for number and date formatting. */
export const locale = ref<string>(i18n.language);
i18n.on('languageChanged', (lng) => (locale.value = lng));

/** The farm's date and number style setting ('auto' = detect). */
export const dateFormatPref = ref<DateFormat>('auto');

/** Locale for formatting dates and numbers. Text follows `locale`, formats follow this. */
export const formatLocale = computed(() =>
  formatLocaleFor(
    locale.value as Language,
    dateFormatPref.value,
    typeof navigator !== 'undefined' ? navigator.languages ?? [navigator.language] : [],
    Intl.DateTimeFormat().resolvedOptions().timeZone,
  ),
);

export function setLanguage(lng: Language) {
  void i18n.changeLanguage(lng);
  document.documentElement.lang = lng;
}

export default i18n;
