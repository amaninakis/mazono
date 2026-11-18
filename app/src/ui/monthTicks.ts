/**
 * Date labels for charts drawn against the day of the farming year: the 1st and the 15th of
 * each month ("1 Νοε", "15 Νοε"). Mid-month ticks are marked so a long chart can drop them.
 */
export function seasonMonthTicks(startMonth: number, locale: string) {
  const start = new Date(2001, startMonth - 1, 1)
  const format = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' })
  const ticks: { day: number; label: string; minor: boolean }[] = []
  for (let i = 0; i < 12; i++) {
    for (const dayOfMonth of [1, 15]) {
      const tick = new Date(2001, startMonth - 1 + i, dayOfMonth)
      ticks.push({
        day: Math.round((tick.getTime() - start.getTime()) / 86_400_000),
        label: format.format(tick),
        minor: dayOfMonth === 15,
      })
    }
  }

  return ticks
}
