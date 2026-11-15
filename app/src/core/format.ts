import type { YieldFormat } from './types'

export function formatNumber(value: number, locale: string, maxDecimals = 2): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: maxDecimals }).format(value)
}

/**
 * Oil yield. 'ratio' gives 1/x where x = olives ÷ oil (e.g. 1/4.3);
 * 'percent' gives oil ÷ olives (e.g. 23.2%).
 */
export function formatYield(
  oliveKg: number,
  oilKg: number,
  format: YieldFormat,
  locale: string,
): string {
  if (!oliveKg || !oilKg) {
    return '–'
  }
  if (format === 'percent') {
    return new Intl.NumberFormat(locale, {
      style: 'percent',
      maximumFractionDigits: 1,
    }).format(oilKg / oliveKg)
  }

  return `1/${formatNumber(oliveKg / oilKg, locale, 1)}`
}

/**
 * Euros in the user's number style: "1.234,50 €" where a comma is the decimal separator
 * (Greek style), "€1,234.50" otherwise. Built from the plain number format because some
 * locales mix styles for currency (en-DE gives "1.234,5" but "€1,234.50").
 */
export function formatMoney(value: number, locale: string): string {
  const nf = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  const commaDecimal =
    nf.formatToParts(1.5).find((part) => part.type === 'decimal')?.value === ','
  const abs = nf.format(Math.abs(value))
  const sign = value < 0 ? '−' : ''

  return commaDecimal ? `${sign}${abs} €` : `${sign}€${abs}`
}
