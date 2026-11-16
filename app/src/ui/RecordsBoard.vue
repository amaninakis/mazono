<script setup lang="ts">
import type { Milestone } from '../core/records'
import { useTranslation } from 'i18next-vue'
import { computed } from 'vue'
import { parseISODate, seasonLabel } from '../core/dates'
import { formatMoney, formatNumber, formatYield } from '../core/format'
import { farmRecords, milestones } from '../core/records'
import { unitLabel } from '../core/units'
import { formatLocale } from '../i18n'
import { useFarm } from './farm'

/** All-time records and milestone badges, like achievements in a game. */
const { t: translate } = useTranslation()
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

const totalLines = computed(() => [
  { key: 'netOil', value: kg(totals.value.netOilKg) },
  { key: 'olives', value: kg(totals.value.oliveKg) },
  { key: 'productions', value: fmt(totals.value.productions) },
  { key: 'harvestDays', value: fmt(totals.value.harvestDays) },
  { key: 'trees', value: fmt(totals.value.treesHarvested) },
  { key: 'sales', value: formatMoney(totals.value.salesAmount, formatLocale.value) },
])

const BADGE_ICONS: Record<Milestone['kind'], string> = {
  oil: '🫒',
  harvestDays: '📅',
  productions: '🏭',
  years: '🎂',
}
/** Reached milestones, then the next one of each kind (the rest stay hidden until then). */
const badges = computed(() => {
  const list = milestones(totals.value)
  const reached = list.filter((x) => x.done)
  const next = (['oil', 'harvestDays', 'productions', 'years'] as const)
    .map((kind) => list.find((x) => x.kind === kind && !x.done))
    .filter((x): x is Milestone => !!x)

  return [...reached, ...next]
})

function badgeTitle(badge: Milestone) {
  return translate(`records.badge.${badge.kind}`, {
    count: badge.goal,
    goal: fmt(badge.goal),
  })
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

    <h3>{{ $t('records.badgesTitle') }}</h3>
    <ul class="badge-list">
      <li
        v-for="badge in badges"
        :key="`${badge.kind}${badge.goal}`"
        class="badge"
        :class="{ done: badge.done }"
      >
        <span class="badge-icon" aria-hidden="true">{{
          badge.done ? BADGE_ICONS[badge.kind] : '🔒'
        }}</span>
        <span class="badge-text">
          <strong>{{ badgeTitle(badge) }}</strong>
          <span
            v-if="!badge.done"
            class="badge-bar"
            role="progressbar"
            :aria-valuenow="Math.round(badge.progress * 100)"
            aria-valuemin="0"
            aria-valuemax="100"
          >
            <span :style="{ width: `${Math.round(badge.progress * 100)}%` }"></span>
          </span>
        </span>
        <span class="badge-state">{{
          badge.done ? '✓' : `${Math.round(badge.progress * 100)}%`
        }}</span>
      </li>
    </ul>

    <h3>{{ $t('records.totalsTitle') }}</h3>
    <dl class="lines">
      <div v-for="line in totalLines" :key="line.key">
        <dt>{{ $t(`records.total.${line.key}`) }}</dt>
        <dd>{{ line.value }}</dd>
      </div>
    </dl>
  </div>
</template>
