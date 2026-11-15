import { reactive } from 'vue'

/**
 * The period shown on the Money and Oil pages. Kept outside the pages so that, after saving
 * an entry with a past date, the page can open on the season or year that contains it.
 */
/** Money is shown per calendar year; field work and extractions per harvest season. */
export const moneyPeriod = reactive<{ year: number | null }>({ year: null })
export const oilPeriod = reactive<{ season: number | null }>({ season: null })
