import type { YieldFormat } from './types';

export function formatNumber(n: number, locale: string, maxDecimals = 2): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: maxDecimals }).format(n);
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
  if (!oliveKg || !oilKg) return '–';
  if (format === 'percent') {
    return new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 1 }).format(
      oilKg / oliveKg,
    );
  }
  return `1/${formatNumber(oliveKg / oilKg, locale, 1)}`;
}
