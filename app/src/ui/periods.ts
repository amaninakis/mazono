import { reactive } from 'vue';

/**
 * The period shown on the Money and Oil pages. Kept outside the pages so that, after saving
 * an entry with a past date, the page can open on the season or year that contains it.
 */
export const moneyPeriod = reactive<{ kind: 'season' | 'year'; year: number | null }>({ kind: 'season', year: null });
export const oilPeriod = reactive<{ season: number | null }>({ season: null });
