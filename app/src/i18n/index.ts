import type { DateFormat, Language } from '../core/types'
import i18n from 'i18next'
import { computed, ref } from 'vue'
import { formatLocaleFor, pickLanguage } from '../core/locale'
import { STORE_NAME } from '../core/names'
import el from './locales/el.json'
import en from './locales/en.json'

/**
 * To add a language: copy locales/en.json to locales/<code>.json, translate the values,
 * import it here and add it to LANGUAGES.
 */
export const LANGUAGES: { code: Language; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'el', label: 'Ελληνικά' },
]

export function deviceLanguage(): Language {
  const nav = typeof navigator !== 'undefined' ? navigator.language : 'en'
  return nav.toLowerCase().startsWith('el') ? 'el' : 'en'
}

const CHOSEN_KEY = `${STORE_NAME}.language`

/** The language chosen on this phone, if any (kept when signing out). */
export function chosenLanguage(): string | null {
  try {
    return localStorage.getItem(CHOSEN_KEY)
  } catch {
    return null // storage blocked (e.g. some private modes)
  }
}

void i18n.init({
  resources: { en: { translation: en }, el: { translation: el } },
  lng: pickLanguage(chosenLanguage(), undefined, deviceLanguage()),
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
})

/** Current language as a Vue ref, for number and date formatting. */
export const locale = ref<string>(i18n.language)
i18n.on('languageChanged', (lng) => (locale.value = lng))

/** The farm's date and number style setting ('auto' = detect). */
export const dateFormatPref = ref<DateFormat>('auto')

/** Locale for formatting dates and numbers. Text follows `locale`, formats follow this. */
export const formatLocale = computed(() =>
  formatLocaleFor(
    locale.value as Language,
    dateFormatPref.value,
    typeof navigator !== 'undefined' ? (navigator.languages ?? [navigator.language]) : [],
    new Intl.DateTimeFormat().resolvedOptions().timeZone,
  ),
)

export function setLanguage(lng: Language) {
  void i18n.changeLanguage(lng)
  document.documentElement.lang = lng
}

/** Someone picked a language: use it and remember it on this phone. */
export function chooseLanguage(lng: Language) {
  try {
    localStorage.setItem(CHOSEN_KEY, lng)
  } catch {
    // Not remembered, but still used until the app is closed.
  }
  setLanguage(lng)
}

export default i18n
