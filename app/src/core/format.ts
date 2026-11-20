import type { YieldFormat } from './types'

/** A number in the user's style; `minDecimals` pads (2 → "11,70", as on a mill's slip). */
export function formatNumber(
  value: number,
  locale: string,
  maxDecimals = 2,
  minDecimals = 0,
): string {
  return new Intl.NumberFormat(locale, {
    maximumFractionDigits: maxDecimals,
    minimumFractionDigits: Math.min(minDecimals, maxDecimals),
  }).format(value)
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

/**
 * Value-axis lines for a yield chart shown as ratios (1/x): at whole ratios such as 1/4, 1/5
 * and 1/6 (halves when the range is narrow), from low to high (yields as oil ÷ olives), with
 * the axis widened to the nearest whole ratio on each side. At most `most` lines.
 */
export function ratioTicks(
  low: number,
  high: number,
  most = 5,
): { range: [number, number]; ticks: number[] } {
  const top = Math.max(Math.floor(1 / high), 1) // smallest x: highest yield
  const bottom = Math.ceil(1 / Math.max(low, 0.01)) // largest x: lowest yield
  let xs: number[] = []
  for (let x = top; x <= bottom; x++) {
    xs.push(x)
  }
  if (xs.length < 3) {
    xs = []

    for (let x = top; x <= bottom + 1e-9; x += 0.5) {
      xs.push(x)
    }
  }
  const every = Math.ceil(xs.length / most)
  const kept = xs.filter((_, i) => i % every === 0)
  const ticks = kept.map((x) => 1 / x).sort((left, right) => left - right)

  return { range: [1 / bottom, 1 / top], ticks }
}
