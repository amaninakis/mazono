/**
 * Read a number out of pasted text such as "255 €", "€1.234,50", "$1,234.50" or "12,5 kg".
 * Currency signs, units and other text are dropped. Thousands and decimal separators are
 * worked out from the text, using the locale's thousands separator only when it is ambiguous
 * ("1.500" is 1500 in Greek style, 1.5 in US style). Returns null when there is no number.
 */
export function parsePastedNumber(text: string, locale: string): number | null {
  // Digits with separators; a space only counts when it separates a group of three digits.
  const match = text.replaceAll('−', '-').match(/-?\d(?:[\d.,'’]|\s(?=\d{3}(?!\d)))*/)
  if (!match) {
    return null
  }

  let number = match[0].replaceAll(/[\s'’]/g, '').replace(/[.,]+$/, '')
  const lastComma = number.lastIndexOf(',')
  const lastDot = number.lastIndexOf('.')
  if (lastComma !== -1 && lastDot !== -1) {
    // Both used: the last one is the decimal separator.
    const decimal = lastComma > lastDot ? ',' : '.'
    const group = decimal === ',' ? '.' : ','
    number = number.replaceAll(group, '').replace(decimal, '.')
  } else if (lastComma !== -1 || lastDot !== -1) {
    const separator = lastComma === -1 ? '.' : ','
    const count = number.split(separator).length - 1
    const digitsAfter = number.length - number.lastIndexOf(separator) - 1
    const isGrouping = count > 1 || (digitsAfter === 3 && separator === groupSeparator(locale))
    number = isGrouping ? number.replaceAll(separator, '') : number.replace(separator, '.')
  }

  const value = Number(number)

  return Number.isFinite(value) ? value : null
}

/** The thousands separator of a locale, e.g. "." for el-GR and "," for en-US. */
function groupSeparator(locale: string): string {
  const parts = new Intl.NumberFormat(locale).formatToParts(1234567.5)
  return parts.find((part) => part.type === 'group')?.value ?? ','
}
