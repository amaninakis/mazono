<script setup lang="ts">
import type { Comparison } from '../core/comparisons'
import { useTranslation } from 'i18next-vue'
import { computed, reactive } from 'vue'
import {
  comparisons,
  daySeed,
  latestYearTotals,
  METRES_BETWEEN_TREES,
} from '../core/comparisons'
import { parseISODate, seasonLabel, seasonOf, todayISO } from '../core/dates'
import { formatMoney, formatNumber, formatYield } from '../core/format'
import { farmRecords } from '../core/records'
import { unitLabel } from '../core/units'
import { formatLocale } from '../i18n'
import { canDo, useFarm } from './farm'

/** All-time records, the farm's numbers put another way, and the totals. */
const { t: translate, i18next } = useTranslation()
const farm = useFarm()

const result = computed(() =>
  farmRecords({
    fields: farm.value.fields,
    entries: farm.value.entries,
    extractions: farm.value.extractions,
    transactions: farm.value.transactions,
    units: farm.value.units,
    harvestTypeIds: new Set(
      farm.value.taskTypes.filter((x) => x.inputKind === 'harvest').map((x) => x.id),
    ),
    seasonStartMonth: farm.value.settings.seasonStartMonth,
  }),
)
const records = computed(() => result.value.records)
const totals = computed(() => result.value.totals)

function fmt(value: number, decimals = 0) {
  return formatNumber(value, formatLocale.value, decimals)
}

function kg(value: number) {
  return `${fmt(value)} ${translate('common.kg')}`
}

function day(isoDate: string) {
  return new Intl.DateTimeFormat(formatLocale.value, { dateStyle: 'medium' }).format(
    parseISODate(isoDate),
  )
}

function yieldText(olives: number, oil: number) {
  return formatYield(olives, oil, farm.value.settings.yieldFormat, formatLocale.value)
}

function fieldName(id: string) {
  return farm.value.fields.find((field) => field.id === id)?.name ?? '?'
}

function unitsText(units: Record<string, number>) {
  return Object.entries(units)
    .map(([unitId, amount]) => {
      const unit = farm.value.units.find((x) => x.id === unitId)
      return `${fmt(amount, 1)} ${unitLabel(unit, amount)}`
    })
    .join(' · ')
}

interface Card {
  key: string
  icon: string
  value: string
  detail: string
}

/** One card per record the farm already has. */
const cards = computed<Card[]>(() => {
  const best = records.value
  const list: (Card | false | undefined)[] = [
    best.bestYear && {
      key: 'bestYear',
      icon: '🏆',
      value: kg(best.bestYear.netKg),
      detail: seasonLabel(best.bestYear.year),
    },
    best.bestYieldYear && {
      key: 'bestYieldYear',
      icon: '📈',
      value: yieldText(best.bestYieldYear.oliveKg, best.bestYieldYear.oilKg),
      detail: seasonLabel(best.bestYieldYear.year),
    },
    best.bestFieldYear && {
      key: 'bestFieldYear',
      icon: '🌳',
      value: `${fmt(best.bestFieldYear.kgPerTree, 1)} ${translate('common.kg')}`,
      detail: `${fieldName(best.bestFieldYear.fieldId)} · ${seasonLabel(best.bestFieldYear.year)}`,
    },
    best.topField && {
      key: 'topField',
      icon: '🥇',
      value: fieldName(best.topField.fieldId),
      detail: kg(best.topField.oilKg),
    },
    best.bestProduction && {
      key: 'bestProduction',
      icon: '⭐',
      value: yieldText(best.bestProduction.oliveKg, best.bestProduction.oilKg),
      detail: day(best.bestProduction.date),
    },
    best.biggestProduction && {
      key: 'biggestProduction',
      icon: '🛢️',
      value: kg(best.biggestProduction.oilKg),
      detail: day(best.biggestProduction.date),
    },
    best.biggestDay && {
      key: 'biggestDay',
      icon: '🧺',
      value: unitsText(best.biggestDay.units),
      detail: day(best.biggestDay.date),
    },
    best.mostTreesDay && {
      key: 'mostTreesDay',
      icon: '💪',
      value: fmt(best.mostTreesDay.trees),
      detail: day(best.mostTreesDay.date),
    },
    best.lowestAcidity && {
      key: 'lowestAcidity',
      icon: '💎',
      value: `${fmt(best.lowestAcidity.acidity, 2)}%`,
      detail: day(best.lowestAcidity.date),
    },
    canDo(farm.value, 'money') &&
      best.bestPrice && {
        key: 'bestPrice',
        icon: '💶',
        value: translate('reports.perKg', {
          price: formatMoney(best.bestPrice.pricePerKg, formatLocale.value),
        }),
        detail: `${best.bestPrice.party} · ${day(best.bestPrice.date)}`,
      },
  ]

  return list.filter((card): card is Card => !!card)
})

const totalLines = computed(() =>
  [
    { key: 'netOil', value: kg(totals.value.netOilKg) },
    { key: 'olives', value: kg(totals.value.oliveKg) },
    { key: 'productions', value: fmt(totals.value.productions) },
    { key: 'harvestDays', value: fmt(totals.value.harvestDays) },
    { key: 'trees', value: fmt(totals.value.treesHarvested) },
    { key: 'sales', value: formatMoney(totals.value.salesAmount, formatLocale.value) },
  ].filter((line) => line.key !== 'sales' || canDo(farm.value, 'money')),
)

/* ---------- put another way ---------- */
const harvestTypeIds = computed(
  () =>
    new Set(farm.value.taskTypes.filter((x) => x.inputKind === 'harvest').map((x) => x.id)),
)
const latestYear = computed(() =>
  latestYearTotals(
    farm.value.extractions,
    farm.value.entries,
    harvestTypeIds.value,
    farm.value.settings.seasonStartMonth,
  ),
)
/** "Show another" taps per card. */
const turns = reactive<Record<string, number>>({})
const seed = daySeed(new Date())
const compareCards = computed(() =>
  comparisons(
    {
      year: latestYear.value?.totals ?? { oliveKg: 0, netOilKg: 0, trees: 0 },
      all: {
        oliveKg: totals.value.oliveKg,
        netOilKg: totals.value.netOilKg,
        trees: totals.value.treesHarvested,
      },
    },
    seed,
    turns,
  ),
)

const FRACTION_KEYS: Record<string, string> = {
  '¼': 'quarter',
  '⅓': 'third',
  '½': 'half',
  '⅔': 'twoThirds',
  '¾': 'threeQuarters',
}

function when(card: Comparison) {
  if (card.scope === 'all') {
    return translate('compare.when.all')
  }
  const season = latestYear.value?.season ?? 0
  const thisYear = seasonOf(todayISO(), farm.value.settings.seasonStartMonth)

  return season === thisYear
    ? translate('compare.when.thisYear')
    : translate('compare.when.year', { year: seasonLabel(season) })
}

/**
 * "a bathtub" / "3 bathtubs". `after` is for "… for 3 donkeys": Greek then needs the
 * accusative (για 3 γαϊδάρους), kept as oneTo / manyTo where it differs.
 */
function objectName(reference: string, count: number, after = false) {
  const form = count === 1 ? 'one' : 'many'
  const key = `compare.ref.${reference}.${form}`
  const toKey = `${key}To`
  const chosen = after && i18next.exists(toKey) ? toKey : key

  return translate(chosen, { count: fmt(count, count % 1 ? 1 : 0) })
}

function thing(card: Comparison) {
  const amount = card.amount
  if (!card.reference || !amount) {
    return ''
  }
  if (amount.kind === 'times') {
    return objectName(card.reference, amount.count)
  }
  if (amount.kind === 'about') {
    return translate('compare.about', {
      thing: translate(`compare.ref.${card.reference}.one`),
    })
  }

  return translate(`compare.fraction.${FRACTION_KEYS[amount.part]}`, {
    of: translate(`compare.ref.${card.reference}.of`),
  })
}

function sentence(card: Comparison) {
  const count = card.count ?? 0
  if (card.measure === 'family' && count < 1) {
    return translate('compare.say.familyMonths', {
      when: when(card),
      count: Math.max(Math.round(count * 12), 1),
    })
  }

  return translate(`compare.say.${card.measure}`, {
    when: when(card),
    thing: thing(card),
    count: fmt(count, count % 1 ? 1 : 0),
  })
}

/** "18 litres more for 7 bathtubs." */
function nextLine(card: Comparison) {
  if (!card.next || !card.reference) {
    return ''
  }
  const missing =
    card.measure === 'treeLine'
      ? Math.ceil(card.next.missing / METRES_BETWEEN_TREES)
      : Math.ceil(card.next.missing)

  return translate(`compare.next.${card.measure}`, {
    missing: fmt(missing),
    thing: objectName(card.reference, card.next.count, true),
  })
}

function showAnother(card: Comparison) {
  turns[card.id] = (turns[card.id] ?? 0) + 1
}
</script>

<template>
  <div class="records">
    <h3>{{ $t('records.recordsTitle') }}</h3>
    <ul class="record-grid">
      <li v-for="card in cards" :key="card.key" class="record-card">
        <span class="record-icon" aria-hidden="true">{{ card.icon }}</span>
        <span class="record-name">{{ $t(`records.card.${card.key}`) }}</span>
        <strong class="record-value">{{ card.value }}</strong>
        <span class="record-detail">{{ card.detail }}</span>
      </li>
    </ul>

    <template v-if="compareCards.length">
      <h3>{{ $t('compare.title') }}</h3>
      <ul class="compare-list">
        <li v-for="card in compareCards" :key="card.id" class="compare-card">
          <span class="compare-icon" aria-hidden="true">{{ card.icon }}</span>
          <div class="compare-body">
            <p class="compare-text">{{ sentence(card) }}</p>
            <template v-if="card.next">
              <span
                class="badge-bar"
                role="progressbar"
                :aria-label="nextLine(card)"
                :aria-valuenow="Math.round(card.next.progress * 100)"
                aria-valuemin="0"
                aria-valuemax="100"
              >
                <span :style="{ width: `${Math.round(card.next.progress * 100)}%` }"></span>
              </span>
              <small class="muted">{{ nextLine(card) }}</small>
            </template>
            <button
              v-if="card.choices > 1"
              type="button"
              class="btn ghost small compare-another"
              @click="showAnother(card)"
            >
              {{ $t('compare.another') }}
            </button>
          </div>
        </li>
      </ul>
      <p class="muted small">{{ $t('compare.note') }}</p>
    </template>

    <h3>{{ $t('records.totalsTitle') }}</h3>
    <dl class="lines">
      <div v-for="line in totalLines" :key="line.key">
        <dt>{{ $t(`records.total.${line.key}`) }}</dt>
        <dd>{{ line.value }}</dd>
      </div>
    </dl>
  </div>
</template>
