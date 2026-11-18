<script setup lang="ts">
import type { CumulativeMetric, CurvePoint } from '../core/yearReport'
import { useTranslation } from 'i18next-vue'
import { computed, ref, watch } from 'vue'
import {
  addDays,
  parseISODate,
  seasonLabel,
  seasonOf,
  seasonRange,
  todayISO,
} from '../core/dates'
import { formatNumber } from '../core/format'
import { unitLabel } from '../core/units'
import {
  averageCurve,
  cumulativeCurves,
  dayOfSeason,
  oliveEstimate,
  valueOnDay,
  yearSummary,
} from '../core/yearReport'
import { formatLocale } from '../i18n'
import CumulativeChart from './CumulativeChart.vue'
import { taskName, useFarm } from './farm'
import { seasonMonthTicks } from './monthTicks'

/**
 * How this farming year is going: totals so far, work per day, trees harvested out of all,
 * and a chart of the running totals compared with an earlier year or the average of them.
 */
const { t: translate } = useTranslation()
const farm = useFarm()
const startMonth = computed(() => farm.value.settings.seasonStartMonth)
const today = todayISO()
const season = computed(() => seasonOf(today, startMonth.value))
const todayDay = computed(() => dayOfSeason(today, startMonth.value))

const harvestTypeIds = computed(
  () =>
    new Set(
      farm.value.taskTypes
        .filter((type) => type.inputKind === 'harvest' && !type.deletedAt)
        .map((type) => type.id),
    ),
)

const summary = computed(() =>
  yearSummary({
    season: season.value,
    entries: farm.value.entries,
    extractions: farm.value.extractions,
    fields: farm.value.fields,
    taskTypes: farm.value.taskTypes,
    seasonStartMonth: startMonth.value,
  }),
)

function fmt(value: number, decimals = 0) {
  return formatNumber(value, formatLocale.value, decimals)
}

function kg(value: number) {
  return `${fmt(value)} ${translate('common.kg')}`
}

function unitById(id: string) {
  return farm.value.units.find((unit) => unit.id === id)
}

/**
 * A unit's name inside a sentence: "Τσουβάλια" reads "τσουβάλια", but names written in
 * capitals ("BIG BAG") stay as they are.
 */
function inSentence(name: string) {
  const [first, second] = [...name]
  if (!second || second !== second.toLocaleLowerCase()) {
    return name
  }

  return first.toLocaleLowerCase() + name.slice(first.length)
}

function unitName(unitId: string, amount: number) {
  return inSentence(unitLabel(unitById(unitId), amount))
}

function unitAmount(unitId: string, amount: number, decimals = 0) {
  return `${fmt(amount, decimals)} ${unitName(unitId, amount)}`
}

function trees(count: number) {
  return translate('reports.year.trees', { count: Math.round(count), shown: fmt(count) })
}

/* ---------- totals ---------- */
/** Weighed olives, plus an estimate for the units not yet taken to the mill. */
const olives = computed(() =>
  oliveEstimate({
    season: season.value,
    entries: farm.value.entries,
    extractions: farm.value.extractions,
    units: farm.value.units,
    harvestTypeIds: harvestTypeIds.value,
    seasonStartMonth: startMonth.value,
  }),
)
const weighInRows = computed(() =>
  olives.value.weighIns.map((weighIn) => {
    const units = Object.entries(weighIn.units).map(([unitId, amount]) =>
      unitAmount(unitId, amount, 1),
    )

    return {
      key: weighIn.extractionId,
      name: `${shortDate(weighIn.date)} · ${kg(weighIn.oliveKg)}`,
      detail: units.length
        ? translate('reports.year.weighInUnits', { units: units.join(' + ') })
        : translate('reports.year.weighInNoUnits'),
      value: weighIn.kgPerUnit ? perUnit(weighIn.kgPerUnit.unitId, weighIn.kgPerUnit.kg) : '–',
    }
  }),
)
const pendingRows = computed(() =>
  olives.value.pending.map((row) => ({
    key: row.unitId,
    name: translate('reports.year.notWeighed', {
      units: unitAmount(row.unitId, row.amount, 1),
    }),
    detail: translate(`reports.year.from.${row.source}`, {
      perUnit: perUnit(row.unitId, row.kgPerUnit),
    }),
    value: `≈ ${kg(row.kg)}`,
  })),
)
const unknownText = computed(() =>
  Object.entries(olives.value.unknown)
    .map(([unitId, amount]) => unitAmount(unitId, amount, 1))
    .join(' + '),
)

/** "44,2 kg per sack". */
function perUnit(unitId: string, kgPerUnit: number) {
  return translate('reports.year.perUnit', {
    kg: `${fmt(kgPerUnit, 1)} ${translate('common.kg')}`,
    unit: unitName(unitId, 1),
  })
}

const unitTotals = computed(() =>
  Object.entries(summary.value.units).map(([unitId, amount]) => unitAmount(unitId, amount, 1)),
)
const perHarvestDay = computed(() =>
  Object.entries(summary.value.unitsPerHarvestDay).map(([unitId, amount]) =>
    unitAmount(unitId, amount, 1),
  ),
)
const harvestedShare = computed(() =>
  summary.value.farmTrees > 0
    ? Math.min(summary.value.treesHarvested / summary.value.farmTrees, 1)
    : null,
)
const perDayRows = computed(() =>
  summary.value.treesPerDay.map((row) => {
    const type = farm.value.taskTypes.find((each) => each.id === row.taskTypeId)

    return {
      key: row.taskTypeId,
      icon: type?.icon ?? '',
      name: type ? taskName(translate, type) : '?',
      perDay: translate('reports.year.perDayValue', { trees: trees(row.perDay) }),
      detail: translate('reports.year.daysCount', { count: row.days, trees: fmt(row.trees) }),
    }
  }),
)

/* ---------- chart ---------- */
/** Units used in any harvest, most used first; then oil and trees. */
interface MetricChoice {
  key: string
  label: string
  metric: CumulativeMetric
}
const metricChoices = computed<MetricChoice[]>(() => {
  const used = new Map<string, number>()
  for (const entry of farm.value.entries) {
    if (entry.deletedAt || !harvestTypeIds.value.has(entry.taskTypeId)) {
      continue
    }

    for (const quantity of entry.quantities ?? []) {
      used.set(quantity.unitId, (used.get(quantity.unitId) ?? 0) + quantity.amount)
    }
  }
  const units: MetricChoice[] = [...used.entries()]
    .sort(([, left], [, right]) => right - left)
    .map(([unitId]) => ({
      key: `unit:${unitId}`,
      label: unitLabel(unitById(unitId), 2),
      metric: { kind: 'unit', unitId },
    }))

  return [
    ...units,
    {
      key: 'oil',
      label: translate('reports.year.oil'),
      metric: { kind: 'oil' },
    },
    {
      key: 'trees',
      label: translate('reports.year.treesHarvested'),
      metric: { kind: 'trees' },
    },
  ]
})
const metricKey = ref<string>()
const metricChoice = computed(
  () =>
    metricChoices.value.find((choice) => choice.key === metricKey.value) ??
    metricChoices.value[0],
)

const curves = computed(() =>
  cumulativeCurves({
    metric: metricChoice.value.metric,
    entries: farm.value.entries,
    extractions: farm.value.extractions,
    harvestTypeIds: harvestTypeIds.value,
    seasonStartMonth: startMonth.value,
  }),
)
/** Earlier years with numbers for the chosen metric, newest first (four fit on a phone). */
const earlierSeasons = computed(() =>
  [...curves.value.keys()]
    .filter((year) => year < season.value)
    .sort((left, right) => right - left),
)
type CompareKey = number | 'average'
const compareChoices = computed<CompareKey[]>(() => [
  ...earlierSeasons.value.slice(0, 4),
  ...(earlierSeasons.value.length > 1 ? (['average'] as const) : []),
])
const compareKey = ref<CompareKey>()
const compare = computed<CompareKey | undefined>(() =>
  compareKey.value != null && compareChoices.value.includes(compareKey.value)
    ? compareKey.value
    : compareChoices.value[0],
)
// A year the user picked stays picked when switching what the chart shows, if it has data.
watch(metricKey, () => {
  if (compareKey.value != null && !compareChoices.value.includes(compareKey.value)) {
    compareKey.value = undefined
  }
})

const compareCurve = computed<CurvePoint[]>(() => {
  if (compare.value === 'average') {
    return averageCurve(earlierSeasons.value.map((year) => curves.value.get(year)!))
  }

  return compare.value == null ? [] : (curves.value.get(compare.value) ?? [])
})

function valueText(value: number) {
  const metric = metricChoice.value.metric
  if (metric.kind === 'oil') {
    return kg(value)
  }
  if (metric.kind === 'trees') {
    return trees(value)
  }

  // Half sacks are common: keep one decimal (24,5), but not for the averages' long tails.
  return unitAmount(metric.unitId, value, value < 100 ? 1 : 0)
}

function axisText(value: number) {
  return fmt(value)
}

function shortDate(isoDate: string) {
  return new Intl.DateTimeFormat(formatLocale.value, {
    day: 'numeric',
    month: 'short',
  }).format(parseISODate(isoDate))
}

function compareLabel(key: CompareKey) {
  return key === 'average' ? translate('reports.year.average') : seasonLabel(key)
}

const thisYearCurve = computed(() => curves.value.get(season.value) ?? [])

function pointsOf(curve: CurvePoint[], year: number) {
  const [start] = seasonRange(year, startMonth.value)

  return curve.map((point) => ({
    ...point,
    detail: `${shortDate(addDays(start, point.day))} · ${valueText(point.value)}`,
  }))
}

const series = computed(() => {
  const lines = []
  if (compare.value != null && compareCurve.value.length > 0) {
    lines.push({
      key: `compare-${compare.value}`,
      slot: 1,
      label: compareLabel(compare.value),
      // The average has no dates of its own: show it on this year's dates.
      points: pointsOf(
        compareCurve.value,
        compare.value === 'average' ? season.value : compare.value,
      ),
      dashed: compare.value === 'average',
    })
  }
  if (thisYearCurve.value.length > 0) {
    lines.push({
      key: 'this-year',
      slot: 0,
      label: translate('reports.year.thisYear'),
      points: pointsOf(thisYearCurve.value, season.value),
      until: todayDay.value,
    })
  }

  return lines
})
const monthTicks = computed(() => seasonMonthTicks(startMonth.value, formatLocale.value))

/** "By this day: this year 86 sacks, last year 64 sacks (+34%)." */
const compareNow = computed(() => {
  if (compare.value == null || compareCurve.value.length === 0) {
    return ''
  }
  const now = valueOnDay(thisYearCurve.value, todayDay.value)
  const then = valueOnDay(compareCurve.value, todayDay.value)
  let whenKey = 'year'
  if (compare.value === 'average') {
    whenKey = 'average'
  } else if (compare.value === season.value - 1) {
    whenKey = 'lastYear'
  }
  const when = translate(`reports.year.when.${whenKey}`, {
    year: compare.value === 'average' ? '' : seasonLabel(compare.value),
  })
  const change = then > 0 ? Math.round(((now - then) / then) * 100) : null
  const total = compareCurve.value.at(-1)!.value

  return {
    byNow: translate('reports.year.byNow', {
      now: valueText(now),
      when,
      then: valueText(then),
    }),
    change:
      change == null
        ? ''
        : translate('reports.year.change', { change: `${change > 0 ? '+' : ''}${change}%` }),
    total: translate('reports.year.wholeYear', { when, total: valueText(total) }),
  }
})
</script>

<template>
  <div class="year-report">
    <h3>{{ $t('reports.year.season', { season: seasonLabel(season) }) }}</h3>
    <ul class="year-stats">
      <li class="year-stat">
        <span class="year-stat-name">{{ $t('reports.year.collected') }}</span>
        <strong class="year-stat-value">{{
          unitTotals.length ? unitTotals.join(' · ') : '0'
        }}</strong>
        <span class="year-stat-detail">
          {{ $t('reports.year.harvestDays', { count: summary.harvestDays }) }}
        </span>
      </li>
      <li class="year-stat">
        <span class="year-stat-name">{{ $t('reports.year.olives') }}</span>
        <strong class="year-stat-value">
          {{ olives.estimatedKg ? `≈ ${kg(olives.totalKg)}` : kg(olives.weighedKg) }}
        </strong>
        <span v-if="olives.estimatedKg" class="year-stat-detail">
          {{
            $t('reports.year.weighedAndEstimated', {
              weighed: kg(olives.weighedKg),
              estimated: kg(olives.estimatedKg),
            })
          }}
        </span>
        <span v-else class="year-stat-detail">
          {{ $t('reports.year.productions', { count: summary.productions }) }}
        </span>
      </li>
      <li class="year-stat">
        <span class="year-stat-name">{{ $t('reports.year.oil') }}</span>
        <strong class="year-stat-value">{{ kg(summary.oilKg) }}</strong>
        <span v-if="summary.oilKg" class="year-stat-detail">
          {{ $t('reports.year.afterCharges', { kg: kg(summary.netOilKg) }) }}
        </span>
      </li>
      <li class="year-stat">
        <span class="year-stat-name">{{ $t('reports.year.perHarvestDay') }}</span>
        <strong class="year-stat-value">{{
          perHarvestDay.length ? perHarvestDay.join(' · ') : '–'
        }}</strong>
        <span class="year-stat-detail">{{ $t('reports.year.perHarvestDayNote') }}</span>
      </li>
    </ul>

    <div class="year-progress">
      <div class="row-between">
        <strong>{{ $t('reports.year.treesHarvested') }}</strong>
        <span v-if="harvestedShare != null" class="muted"
          >{{ Math.round(harvestedShare * 100) }}%</span
        >
      </div>
      <template v-if="harvestedShare != null">
        <span
          class="badge-bar"
          role="progressbar"
          :aria-label="$t('reports.year.treesHarvested')"
          :aria-valuenow="Math.round(harvestedShare * 100)"
          aria-valuemin="0"
          aria-valuemax="100"
        >
          <span :style="{ width: `${Math.round(harvestedShare * 100)}%` }"></span>
        </span>
        <small class="muted">
          {{
            $t('reports.year.treesOf', {
              harvested: fmt(summary.treesHarvested),
              total: fmt(summary.farmTrees),
            })
          }}
        </small>
      </template>
      <p v-else class="muted small">
        {{ trees(summary.treesHarvested) }} · {{ $t('reports.year.noTreeCounts') }}
      </p>
    </div>

    <template v-if="weighInRows.length || pendingRows.length || unknownText">
      <h3>{{ $t('reports.year.olivesTitle') }}</h3>
      <dl class="lines per-day">
        <div v-for="row in [...weighInRows, ...pendingRows]" :key="row.key">
          <dt>
            {{ row.name }}
            <small class="muted per-day-detail">{{ row.detail }}</small>
          </dt>
          <dd>{{ row.value }}</dd>
        </div>
      </dl>
      <p v-if="unknownText" class="muted small">
        {{ $t('reports.year.unknownWeight', { units: unknownText }) }}
      </p>
    </template>

    <template v-if="perDayRows.length">
      <h3>{{ $t('reports.year.perDayTitle') }}</h3>
      <dl class="lines per-day">
        <div v-for="row in perDayRows" :key="row.key">
          <dt>
            <span aria-hidden="true">{{ row.icon }}</span> {{ row.name }}
            <small class="muted per-day-detail">{{ row.detail }}</small>
          </dt>
          <dd>{{ row.perDay }}</dd>
        </div>
      </dl>
    </template>

    <h3>{{ $t('reports.year.chartTitle') }}</h3>
    <div class="chips tight" role="group" :aria-label="$t('reports.year.show')">
      <button
        v-for="choice in metricChoices"
        :key="choice.key"
        type="button"
        class="chip small"
        :class="{ selected: metricChoice.key === choice.key }"
        :aria-pressed="metricChoice.key === choice.key"
        @click="metricKey = choice.key"
      >
        {{ choice.label }}
      </button>
    </div>
    <div
      v-if="compareChoices.length"
      class="chips tight"
      role="group"
      :aria-label="$t('reports.year.compareWith')"
    >
      <span class="muted small">{{ $t('reports.year.compareWith') }}</span>
      <button
        v-for="key in compareChoices"
        :key="key"
        type="button"
        class="chip small"
        :class="{ selected: compare === key }"
        :aria-pressed="compare === key"
        @click="compareKey = key"
      >
        {{ compareLabel(key) }}
      </button>
    </div>
    <CumulativeChart
      v-if="series.length"
      :series="series"
      :months="monthTicks"
      :today="thisYearCurve.length ? todayDay : undefined"
      :today-label="$t('common.today')"
      :format-value="axisText"
      :title="$t('reports.year.chartTitle')"
    />
    <p v-else class="muted small">{{ $t('reports.year.nothingYet') }}</p>
    <template v-if="compareNow">
      <p class="compare-now">
        {{ compareNow.byNow }}
        <strong v-if="compareNow.change">{{ compareNow.change }}</strong>
      </p>
      <p class="muted small">{{ compareNow.total }}</p>
    </template>
  </div>
</template>
