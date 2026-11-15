import type { Unit } from './types'
import el from '../i18n/locales/el.json'
import en from '../i18n/locales/en.json'

/**
 * Unit name for an amount: the plural form for amounts above one ("8,5 τσουβάλια"),
 * the singular otherwise ("1 τσουβάλι", "0,5 τσουβάλι"). Falls back to the singular
 * when no plural is stored.
 */
export function unitLabel(
  unit: Pick<Unit, 'name' | 'pluralName'> | undefined,
  amount: number,
): string {
  if (!unit) {
    return '?'
  }

  return amount > 1 && unit.pluralName ? unit.pluralName : unit.name
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
