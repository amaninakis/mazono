<script setup lang="ts">
import type { CsvValue, FieldSeasonCell } from '../core/reports'
import { useTranslation } from 'i18next-vue'
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { parseISODate, seasonLabel, seasonOf, todayISO } from '../core/dates'
import { formatMoney, formatNumber, formatYield } from '../core/format'
import {
  fieldSeasonReport,
  seasonHistory,
  toCsv,
  yearEconomics,
  yieldThroughSeason,
} from '../core/reports'
import { unitLabel } from '../core/units'
import { formatLocale } from '../i18n'
import AppIcon from '../ui/AppIcon.vue'
import { canDo, useFarm } from '../ui/farm'
import { seasonMonthTicks } from '../ui/monthTicks'
import RecordsBoard from '../ui/RecordsBoard.vue'
import SeasonBars from '../ui/SeasonBars.vue'
import YearReport from '../ui/YearReport.vue'
import YieldChart from '../ui/YieldChart.vue'

type ReportKey = 'year' | 'fields' | 'seasons' | 'yield' | 'money' | 'records'
type FieldMetric = 'units' | 'oil' | 'unitsPerTree' | 'oilPerTree' | 'yield'
type YearMetric = 'olives' | 'oil' | 'net' | 'yield'

const { t: translate } = useTranslation()
const farm = useFarm()
/** An empty report points to where its data comes from. */
const canLogWork = computed(() => canDo(farm.value, 'work', 'change'))
const startMonth = computed(() => farm.value.settings.seasonStartMonth)
const REPORTS: ReportKey[] = ['year', 'fields', 'seasons', 'yield', 'money', 'records']
const report = ref<ReportKey>('year')

function fmt(value: number, decimals = 1) {
  return formatNumber(value, formatLocale.value, decimals)
}

function eur(value: number) {
  return formatMoney(value, formatLocale.value)
}

function yieldText(olives: number, oil: number) {
  return formatYield(olives, oil, farm.value.settings.yieldFormat, formatLocale.value)
}

/** Yield chart values (oil ÷ olives) in the farm's chosen style: 1/4,3 or 23%. */
function yieldAxis(value: number) {
  return value > 0 ? yieldText(1, value) : '–'
}

function season(year: number) {
  return seasonLabel(year)
}

function unitById(id: string) {
  return farm.value.units.find((unit) => unit.id === id)
}

function perKg(price: number | undefined) {
  return price == null ? '–' : translate('reports.perKg', { price: eur(price) })
}

function shortDate(isoDate: string) {
  return new Intl.DateTimeFormat(formatLocale.value, {
    day: 'numeric',
    month: 'short',
  }).format(parseISODate(isoDate))
}

/* ---------- 1. fields × seasons ---------- */
const harvestTypeIds = computed(
  () =>
    new Set(farm.value.taskTypes.filter((x) => x.inputKind === 'harvest').map((x) => x.id)),
)
const fieldReport = computed(() =>
  fieldSeasonReport(
    farm.value.fields,
    farm.value.entries,
    farm.value.extractions,
    farm.value.units,
    harvestTypeIds.value,
    startMonth.value,
  ),
)
/** The last five seasons fit on a phone; the CSV has all of them. */
const fieldSeasons = computed(() => fieldReport.value.seasons.slice(-5))
const fieldMetric = ref<FieldMetric>('units')
/** Details of the cell the user tapped. */
const cellInfo = ref('')
const METRICS: FieldMetric[] = ['units', 'oil', 'unitsPerTree', 'oilPerTree', 'yield']

/** Number used for shading (and the CSV); null when it cannot be worked out. */
function metricValue(cell: FieldSeasonCell | undefined, metric: FieldMetric): number | null {
  if (!cell) {
    return null
  }
  if (metric === 'oil') {
    return cell.oilKg || null
  }
  if (metric === 'yield') {
    return cell.oliveKg && cell.oilKg ? cell.oilKg / cell.oliveKg : null
  }
  if (metric === 'units') {
    return Object.values(cell.units).reduce((sum, amount) => sum + amount, 0) || null
  }
  if (!cell.perTreeOf) {
    return null
  }
  if (metric === 'oilPerTree') {
    return cell.oilKg ? cell.oilKg / cell.perTreeOf : null
  }
  const total = Object.values(cell.units).reduce((sum, amount) => sum + amount, 0)

  return total ? total / cell.perTreeOf : null
}

/** The only unit used in harvests, if there is just one (then cells show plain numbers). */
const onlyUnit = computed(() => {
  const ids = new Set(
    fieldReport.value.rows.flatMap((row) =>
      Object.values(row.cells).flatMap((cell) => Object.keys(cell.units)),
    ),
  )

  return ids.size === 1 ? unitById([...ids][0]) : undefined
})
/** What the numbers in the table are, e.g. "In sacks per tree". */
const unitCaption = computed(() => {
  if (fieldMetric.value === 'yield') {
    return translate('reports.yieldCaption')
  }
  const unit = onlyUnit.value
  const unitsName = (
    unit ? (unit.pluralName ?? unit.name) : translate('reports.units')
  ).toLocaleLowerCase(formatLocale.value)
  const isOil = fieldMetric.value === 'oil' || fieldMetric.value === 'oilPerTree'
  const name = isOil ? translate('reports.kgOil') : unitsName
  const perTree = fieldMetric.value === 'unitsPerTree' || fieldMetric.value === 'oilPerTree'

  return translate(perTree ? 'reports.unitCaptionPerTree' : 'reports.unitCaption', {
    unit: name,
  })
})

function cellText(cell: FieldSeasonCell | undefined): string {
  const value = metricValue(cell, fieldMetric.value)
  if (value == null || !cell) {
    return '–'
  }
  if (fieldMetric.value === 'oil') {
    return fmt(value, 0)
  }
  if (fieldMetric.value === 'yield') {
    return yieldText(cell.oliveKg, cell.oilKg)
  }
  if (fieldMetric.value === 'oilPerTree') {
    return fmt(value, 1)
  }
  const perTree = fieldMetric.value === 'unitsPerTree'
  if (onlyUnit.value) {
    return fmt(value, perTree ? 2 : 1)
  }

  // Several units: show each one, e.g. "0,8 sacks · 0,1 bins".
  return Object.entries(cell.units)
    .filter(([, amount]) => amount > 0)
    .map(([unitId, amount]) => {
      const shown = perTree ? amount / cell.perTreeOf : amount
      return `${fmt(shown, perTree ? 2 : 1)} ${unitLabel(unitById(unitId), shown)}`
    })
    .join(' · ')
}

function cellDetail(fieldName: string, year: number, cell: FieldSeasonCell | undefined) {
  if (!cell) {
    return `${fieldName} · ${season(year)}: –`
  }
  const units = Object.entries(cell.units)
    .map(([unitId, amount]) => `${fmt(amount)} ${unitLabel(unitById(unitId), amount)}`)
    .join(' · ')

  const details = {
    field: fieldName,
    season: season(year),
    oil: fmt(cell.oilKg, 0),
    units: units || '–',
    trees: cell.perTreeOf,
  }

  return cell.oilKg
    ? translate('reports.fieldCellDetail', details)
    : translate('reports.fieldCellNoOil', details)
}

const fieldMax = computed(() =>
  Math.max(
    ...fieldReport.value.rows.flatMap((row) =>
      fieldSeasons.value.map((year) => metricValue(row.cells[year], fieldMetric.value) ?? 0),
    ),
    0,
  ),
)
/** Darker cells for bigger values, so good and poor years stand out. */
function cellShade(cell: FieldSeasonCell | undefined) {
  const value = metricValue(cell, fieldMetric.value)
  if (!value || !fieldMax.value) {
    return undefined
  }

  return { '--shade': `${Math.round(10 + (value / fieldMax.value) * 55)}%` }
}

/* ---------- 2. seasons ---------- */
const history = computed(() => seasonHistory(farm.value.extractions, startMonth.value))
const historyNewestFirst = computed(() => [...history.value].reverse())
const YEAR_METRICS: YearMetric[] = ['olives', 'oil', 'net', 'yield']
const yearMetric = ref<YearMetric>('net')
const seasonBars = computed(() =>
  history.value.slice(-6).map((row) => {
    const kg = { olives: row.oliveKg, oil: row.oilKg, net: row.netKg, yield: 0 }
    if (yearMetric.value === 'yield') {
      return {
        label: season(row.season),
        value: row.oliveKg ? row.oilKg / row.oliveKg : 0,
        valueText: yieldText(row.oliveKg, row.oilKg),
      }
    }
    const value = kg[yearMetric.value]

    return {
      label: season(row.season),
      value,
      valueText: fmt(value, 0),
    }
  }),
)

/* ---------- 3. yield through the season ---------- */
const yieldSeasons = computed(() =>
  yieldThroughSeason(farm.value.extractions, startMonth.value),
)
/** Up to three years on the chart at once (more cannot be told apart reliably by colour). */
const MAX_YIELD_YEARS = 3
/** Shown years and their colour slot; a year keeps its colour while it stays on the chart. */
const yieldSlots = ref<Map<number, number> | null>(null)
const shownSlots = computed(() => {
  if (yieldSlots.value) {
    return yieldSlots.value
  }
  const latest = yieldSeasons.value.slice(0, MAX_YIELD_YEARS).map((line) => line.season)

  return new Map(latest.map((year, i) => [year, i]))
})

function toggleYieldYear(year: number) {
  const slots = new Map(shownSlots.value)
  if (slots.has(year)) {
    if (slots.size > 1) {
      slots.delete(year)
    }
  } else if (slots.size < MAX_YIELD_YEARS) {
    const used = new Set(slots.values())
    const free = [0, 1, 2].find((slot) => !used.has(slot)) ?? 0
    slots.set(year, free)
  }
  yieldSlots.value = slots
}

const yieldSeries = computed(() =>
  yieldSeasons.value
    .filter((line) => shownSlots.value.has(line.season))
    .map((line) => ({
      key: line.season,
      slot: shownSlots.value.get(line.season) ?? 0,
      label: season(line.season),
      points: line.points.map((point) => ({
        day: point.day,
        value: point.yield,
        detail: [
          shortDate(point.date),
          yieldText(point.oliveKg, point.oilKg),
          `${fmt(point.oliveKg, 0)} → ${fmt(point.oilKg, 0)} ${translate('common.kg')}`,
          point.acidity == null ? '' : `${translate('oil.acidity')} ${fmt(point.acidity, 2)}%`,
        ]
          .filter(Boolean)
          .join(' · '),
      })),
    })),
)
/**
 * Date ticks on the 1st and 15th of each month, counted in days from the start of the year.
 */
const monthTicks = computed(() => seasonMonthTicks(startMonth.value, formatLocale.value))

/* ---------- 4. money ---------- */
const economics = computed(() =>
  yearEconomics(farm.value.transactions, farm.value.extractions, startMonth.value).reverse(),
)

/* ---------- CSV ---------- */
/** Tells Excel the file is UTF-8, so Greek text shows correctly. */
const BYTE_ORDER_MARK = '\uFEFF'

function download(name: string, header: string[], rows: CsvValue[][]) {
  const csv = `${BYTE_ORDER_MARK}${toCsv(header, rows, formatLocale.value)}`
  const link = document.createElement('a')
  link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  link.download = `harvestlog-${name}.csv`
  link.click()
  URL.revokeObjectURL(link.href)
}

function exportCsv() {
  if (report.value === 'fields') {
    const unitIds = [
      ...new Set(
        fieldReport.value.rows.flatMap((row) =>
          Object.values(row.cells).flatMap((cell) => Object.keys(cell.units)),
        ),
      ),
    ]
    download(
      'fields',
      [
        translate('reports.field'),
        translate('oil.season'),
        translate('reports.oilKg'),
        translate('reports.netKg'),
        translate('reports.olivesKg'),
        translate('reports.col.yield'),
        translate('reports.treesCounted'),
        translate('reports.oilPerTree'),
        ...unitIds.map((id) => unitById(id)?.pluralName ?? unitById(id)?.name ?? '?'),
      ],
      fieldReport.value.rows.flatMap((row) =>
        Object.entries(row.cells).map(([year, cell]) => [
          row.field.name,
          season(Number(year)),
          cell.oilKg,
          cell.netKg,
          cell.oliveKg || null,
          cell.oliveKg ? yieldText(cell.oliveKg, cell.oilKg) : null,
          cell.perTreeOf || null,
          metricValue(cell, 'oilPerTree'),
          ...unitIds.map((id) => cell.units[id] ?? null),
        ]),
      ),
    )
  } else if (report.value === 'seasons') {
    download(
      'seasons',
      [
        translate('oil.season'),
        translate('oil.extractions'),
        translate('reports.olivesKg'),
        translate('reports.oilKg'),
        translate('reports.chargesKg'),
        translate('reports.netKg'),
        translate('oil.yield'),
      ],
      history.value.map((row) => [
        season(row.season),
        row.extractions,
        row.oliveKg,
        row.oilKg,
        row.chargesKg,
        row.netKg,
        yieldText(row.oliveKg, row.oilKg),
      ]),
    )
  } else if (report.value === 'yield') {
    download(
      'yield',
      [
        translate('oil.season'),
        translate('common.date'),
        translate('reports.olivesKg'),
        translate('reports.oilKg'),
        translate('oil.yield'),
        translate('oil.acidity'),
      ],
      yieldSeasons.value.flatMap((line) =>
        line.points.map((point) => [
          season(line.season),
          point.date,
          point.oliveKg,
          point.oilKg,
          yieldText(point.oliveKg, point.oilKg),
          point.acidity,
        ]),
      ),
    )
  } else {
    download(
      'money',
      [
        translate('money.year'),
        translate('money.sales'),
        translate('money.otherIncome'),
        translate('money.income'),
        translate('money.expenses'),
        translate('money.net'),
        translate('reports.netOilOfSeason'),
        translate('reports.costPerKg'),
        translate('reports.breakEven'),
        translate('reports.averagePrice'),
      ],
      [...economics.value]
        .reverse()
        .map((row) => [
          row.year,
          row.sales,
          row.otherIncome,
          row.income,
          row.expenses,
          row.net,
          row.netOilKg,
          row.costPerKg,
          row.breakEvenPrice,
          row.averagePrice,
        ]),
    )
  }
}

/** Anything logged in the current farming year. */
const hasThisYear = computed(() => {
  const current = seasonOf(todayISO(), startMonth.value)
  function inYear(row: { date: string; deletedAt?: number }) {
    return !row.deletedAt && seasonOf(row.date, startMonth.value) === current
  }

  return farm.value.entries.some(inYear) || farm.value.extractions.some(inYear)
})

const hasData = computed(() => {
  const lookup: Record<ReportKey, boolean> = {
    year: hasThisYear.value,
    fields: fieldReport.value.rows.length > 0,
    seasons: history.value.length > 0,
    yield: yieldSeasons.value.length > 0,
    money: economics.value.length > 0,
    records: farm.value.extractions.some((x) => !x.deletedAt) || farm.value.entries.length > 0,
  }

  return lookup[report.value]
})

/** The cost report needs access to money. */
const visibleReports = computed(() =>
  REPORTS.filter((key) => key !== 'money' || canDo(farm.value, 'money')),
)
</script>

<template>
  <main class="page reports">
    <h1>{{ $t('nav.reports') }}</h1>
    <div class="chips report-tabs" role="tablist">
      <button
        v-for="key in visibleReports"
        :key="key"
        type="button"
        role="tab"
        class="chip"
        :class="{ selected: report === key }"
        :aria-selected="report === key"
        @click="report = key"
      >
        {{ $t(`reports.tab.${key}`) }}
      </button>
    </div>

    <section class="card">
      <h2>{{ $t(`reports.title.${report}`) }}</h2>
      <p class="muted small">{{ $t(`reports.about.${report}`) }}</p>

      <div v-if="!hasData" class="empty-note">
        <p>{{ $t(`reports.empty.${report}`) }}</p>
        <RouterLink v-if="canLogWork" to="/" class="btn small">
          {{ $t('reports.logHarvest') }}
        </RouterLink>
      </div>

      <!-- 1. fields × seasons -->
      <template v-else-if="report === 'fields'">
        <div class="chips tight">
          <button
            v-for="metric in METRICS"
            :key="metric"
            type="button"
            class="chip small"
            :class="{ selected: fieldMetric === metric }"
            @click="fieldMetric = metric"
          >
            {{ $t(`reports.metric.${metric}`) }}
          </button>
        </div>
        <div class="table-scroll">
          <table class="heat-table">
            <thead>
              <!-- The unit sits on the right, over the years; a long one runs on to the left. -->
              <tr>
                <th
                  :colspan="fieldSeasons.length + 1"
                  scope="colgroup"
                  class="unit-caption unit-over-years"
                >
                  {{ unitCaption }}
                </th>
              </tr>
              <tr>
                <th scope="col">{{ $t('reports.field') }}</th>
                <th v-for="year in fieldSeasons" :key="year" scope="col">
                  {{ season(year) }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in fieldReport.rows" :key="row.field.id">
                <th scope="row">{{ row.field.name }}</th>
                <td
                  v-for="year in fieldSeasons"
                  :key="year"
                  :class="{ shaded: cellShade(row.cells[year]) }"
                  :style="cellShade(row.cells[year])"
                  :title="cellDetail(row.field.name, year, row.cells[year])"
                  @click="cellInfo = cellDetail(row.field.name, year, row.cells[year])"
                >
                  {{ cellText(row.cells[year]) }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-if="cellInfo" class="chart-tooltip" role="status">{{ cellInfo }}</p>
        <p class="muted small">{{ $t('reports.fieldsNote') }}</p>
      </template>

      <!-- 2. seasons -->
      <template v-else-if="report === 'seasons'">
        <div class="chips tight">
          <button
            v-for="metric in YEAR_METRICS"
            :key="metric"
            type="button"
            class="chip small"
            :class="{ selected: yearMetric === metric }"
            :aria-pressed="yearMetric === metric"
            @click="yearMetric = metric"
          >
            {{ $t(`reports.col.${metric}`) }}
          </button>
        </div>
        <SeasonBars
          :bars="seasonBars"
          :title="$t(`reports.col.${yearMetric}`)"
          :unit="yearMetric === 'yield' ? undefined : $t('reports.inKg')"
        />
        <div class="table-scroll">
          <table class="report-table">
            <thead>
              <tr>
                <th scope="col">{{ $t('oil.season') }}</th>
                <th scope="col">{{ $t('reports.col.olives') }}</th>
                <th scope="col">{{ $t('reports.col.oil') }}</th>
                <th scope="col">{{ $t('reports.col.net') }}</th>
                <th scope="col">{{ $t('reports.col.yield') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in historyNewestFirst" :key="row.season">
                <th scope="row">{{ season(row.season) }}</th>
                <td>{{ fmt(row.oliveKg, 0) }}</td>
                <td>{{ fmt(row.oilKg, 0) }}</td>
                <td>{{ fmt(row.netKg, 0) }}</td>
                <td>{{ yieldText(row.oliveKg, row.oilKg) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p class="muted small">{{ $t('reports.kgNote') }}</p>
      </template>

      <!-- 3. yield through the season -->
      <template v-else-if="report === 'yield'">
        <div v-if="yieldSeasons.length > 1" class="chips tight">
          <button
            v-for="line in yieldSeasons"
            :key="line.season"
            type="button"
            class="chip small"
            :class="{ selected: shownSlots.has(line.season) }"
            :aria-pressed="shownSlots.has(line.season)"
            :disabled="!shownSlots.has(line.season) && shownSlots.size >= MAX_YIELD_YEARS"
            @click="toggleYieldYear(line.season)"
          >
            {{ season(line.season) }}
          </button>
        </div>
        <YieldChart
          :series="yieldSeries"
          :months="monthTicks"
          :format-value="yieldAxis"
          :ratio-axis="farm.settings.yieldFormat === 'ratio'"
          :title="$t('reports.title.yield')"
        />
        <p class="muted small">{{ $t('reports.yieldNote') }}</p>
      </template>

      <!-- 0. this year -->
      <YearReport v-else-if="report === 'year'" />

      <!-- 5. records -->
      <RecordsBoard v-else-if="report === 'records'" />

      <!-- 4. money -->
      <template v-else>
        <article v-for="row in economics" :key="row.year" class="year-card">
          <h3>{{ row.year }}</h3>
          <div class="hero-row">
            <div>
              <span class="muted small">{{ $t('reports.costPerKg') }}</span>
              <strong>{{ perKg(row.costPerKg) }}</strong>
            </div>
            <div>
              <span class="muted small">{{ $t('reports.breakEven') }}</span>
              <strong>{{ perKg(row.breakEvenPrice) }}</strong>
            </div>
          </div>
          <dl class="lines">
            <div>
              <dt>{{ $t('money.income') }}</dt>
              <dd>{{ eur(row.income) }}</dd>
            </div>
            <div>
              <dt>{{ $t('money.expenses') }}</dt>
              <dd>− {{ eur(row.expenses) }}</dd>
            </div>
            <div class="total">
              <dt>{{ $t('money.net') }}</dt>
              <dd>{{ eur(row.net) }}</dd>
            </div>
            <div>
              <dt>{{ $t('reports.netOilOfSeason') }}</dt>
              <dd>{{ row.netOilKg ? `${fmt(row.netOilKg, 0)} ${$t('common.kg')}` : '–' }}</dd>
            </div>
            <div v-if="row.averagePrice != null">
              <dt>{{ $t('reports.averagePrice') }}</dt>
              <dd>{{ perKg(row.averagePrice) }}</dd>
            </div>
          </dl>
        </article>
        <p class="muted small">{{ $t('reports.moneyNote') }}</p>
      </template>

      <button
        v-if="hasData && report !== 'records' && report !== 'year'"
        type="button"
        class="btn ghost small"
        @click="exportCsv"
      >
        <AppIcon name="download" :size="18" /> {{ $t('reports.csv') }}
      </button>
    </section>
  </main>
</template>
