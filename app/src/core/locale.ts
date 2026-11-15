import type { DateFormat, Language } from './types';

/** Locales that give each date and number style, per app language. */
const FORMATS: Record<Exclude<DateFormat, 'auto'>, Record<Language, string>> = {
  // 15/11/2026 · 1.234,5
  GR: { en: 'en-DE', el: 'el-GR' },
  // 15/11/2026 · 1,234.5
  GB: { en: 'en-GB', el: 'el-GR' },
  // 11/15/2026 · 1,234.5
  US: { en: 'en-US', el: 'el-GR' },
};

const GREEK_TIME_ZONES = ['Europe/Athens', 'Asia/Nicosia', 'Asia/Famagusta'];

/**
 * Guess the date and number style. Browsers do not pass on the operating system's region
 * setting (e.g. macOS "English (US)" with region Greece), so besides the language list we
 * also look at the time zone.
 */
export function detectDateFormat(
  lang: Language,
  browserLanguages: readonly string[],
  timeZone?: string,
): Exclude<DateFormat, 'auto'> {
  if (lang === 'el') return 'GR';
  const tags = browserLanguages.map((l) => l.toLowerCase());
  if (tags.some((t) => t.startsWith('el') || t.endsWith('-gr') || t.endsWith('-cy'))) return 'GR';
  if (timeZone && GREEK_TIME_ZONES.includes(timeZone)) return 'GR';
  const region = tags[0]?.split('-')[1];
  if (region === 'us') return 'US';
  return 'GB';
}

/** The locale used to format dates and numbers (text still follows the app language). */
export function formatLocaleFor(
  lang: Language,
  pref: DateFormat | undefined,
  browserLanguages: readonly string[],
  timeZone?: string,
): string {
  const f: Exclude<DateFormat, 'auto'> =
    !pref || pref === 'auto' ? detectDateFormat(lang, browserLanguages, timeZone) : pref;
  return FORMATS[f][lang];
}
