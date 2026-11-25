import type { Extraction, TaskEntry, Unit } from './types'
import el from '../i18n/locales/el.json'
import en from '../i18n/locales/en.json'

/**
 * Unit name for an amount: the plural form for amounts above one ("8,5 τσουβάλια"),
 * the singular otherwise ("1 τσουβάλι", "0,5 τσουβάλι").
 */
export function unitLabel(
  unit: Pick<Unit, 'name' | 'pluralName'> | undefined,
  amount: number,
): string {
  if (!unit) {
    return '?'
  }

  return amount > 1 ? unitPlural(unit) : unit.name
}

/** The plural of a unit: the one saved with it (older units), or made from its name. */
export function unitPlural(unit: Pick<Unit, 'name' | 'pluralName'>): string {
  return unit.pluralName || pluralOf(unit.name)
}

const GREEK_LETTER = /[\u0370-\u03FF\u1F00-\u1FFF]/
const GREEK_JOINING_WORDS = new Set([
  'με',
  'για',
  'από',
  'σε',
  'του',
  'της',
  'των',
  'το',
  'τα',
  'και',
  'χωρίς',
])

/**
 * The plural of a unit name, so nobody has to type it. Greek words follow the endings of
 * Greek nouns and adjectives, word by word up to a joining word ("Μισό τσουβάλι" → "Μισά
 * τσουβάλια", "Κάσα με λαβές" → "Κάσες με λαβές"); a name in Latin letters gets an English
 * plural on its last word ("Pallet bin" → "Pallet bins", "Box" → "Boxes"). Words it cannot
 * tell stay as they are.
 */
export function pluralOf(name: string): string {
  const trimmed = name.trim()
  if (!trimmed) {
    return trimmed
  }
  if (GREEK_LETTER.test(trimmed)) {
    const words = trimmed.split(/\s+/)
    const stop = words.findIndex(
      (word, index) => index > 0 && GREEK_JOINING_WORDS.has(word.toLowerCase()),
    )
    const end = stop === -1 ? words.length : stop

    return words.map((word, index) => (index < end ? greekPlural(word) : word)).join(' ')
  }
  const words = trimmed.split(/\s+/)
  words[words.length - 1] = englishPlural(words.at(-1)!)

  return words.join(' ')
}

/**
 * Greek endings, longest first: [singular ending, plural ending]. Covers neuter nouns and
 * adjectives (τσουβάλι, σακί, τελάρο, μισό, κιβώτιο, δέμα, δίχτυ), masculine (κάδος, κουβάς,
 * τενεκές) and feminine (κάσα, σακούλα).
 */
const GREEK_ENDINGS: [string, string][] = [
  ['μα', 'ματα'],
  ['άς', 'άδες'],
  ['ές', 'έδες'],
  ['ούς', 'ούδες'],
  ['ής', 'ήδες'],
  ['ός', 'οί'],
  ['ος', 'οι'],
  ['ας', 'ες'],
  ['ης', 'ες'],
  ['ί', 'ιά'],
  ['ι', 'ια'],
  ['ό', 'ά'],
  ['ο', 'α'],
  ['ά', 'ές'],
  ['α', 'ες'],
  ['ή', 'ές'],
  ['η', 'ες'],
  ['υ', 'υα'],
]

function greekPlural(word: string): string {
  if (!GREEK_LETTER.test(word)) {
    return word
  }
  const upper = word === word.toUpperCase() && word.length > 1
  const lower = word.toLowerCase().replace(/σ$/, 'ς')
  for (const [singular, plural] of GREEK_ENDINGS) {
    if (lower.endsWith(singular)) {
      const result = word.slice(0, word.length - singular.length) + plural
      return upper ? result.toUpperCase() : result
    }
  }

  return word
}

function englishPlural(word: string): string {
  if (!/[a-z]$/i.test(word)) {
    return word
  }
  const upper = word === word.toUpperCase() && word.length > 1
  const lower = word.toLowerCase()
  let plural: string
  if (/(?:[sxz]|ch|sh)$/.test(lower)) {
    plural = `${word}es`
  } else if (/[^aeiou]y$/.test(lower)) {
    plural = `${word.slice(0, -1)}ies`
  } else {
    plural = `${word}s`
  }

  return upper ? plural.toUpperCase() : plural
}

/** Whether any work or pressing (not deleted) uses the unit: then it can only be archived. */
export function unitInUse(
  unitId: string,
  entries: Pick<TaskEntry, 'quantities' | 'deletedAt'>[],
  extractions: Pick<Extraction, 'allocations' | 'deletedAt'>[],
): boolean {
  return (
    entries.some(
      (entry) =>
        !entry.deletedAt && entry.quantities?.some((quantity) => quantity.unitId === unitId),
    ) ||
    extractions.some(
      (extraction) =>
        !extraction.deletedAt &&
        extraction.allocations.some((allocation) =>
          allocation.quantities.some((quantity) => quantity.unitId === unitId),
        ),
    )
  )
}

/**
 * Plural for a unit created from a preset, in any shipped language ("Τσουβάλι" → "Τσουβάλια").
 */
export function presetPlural(name: string): string | undefined {
  for (const lang of [en, el]) {
    for (const [key, singular] of Object.entries(lang.unitPreset)) {
      if (singular.toLowerCase() === name.trim().toLowerCase()) {
        return (lang.unitPresetPlural as Record<string, string>)[key]
      }
    }
  }

  return undefined
}
