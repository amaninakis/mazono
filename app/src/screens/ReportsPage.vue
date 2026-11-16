<script setup lang="ts">
import type { CsvValue, FieldSeasonCell } from '../core/reports'
import { useTranslation } from 'i18next-vue'
import { computed, ref } from 'vue'
import { parseISODate, seasonLabel } from '../core/dates'
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
import { useFarm } from '../ui/farm'
import SeasonBars from '../ui/SeasonBars.vue'
import YieldChart from '../ui/YieldChart.vue'

type ReportKey = 'fields' | 'seasons' | 'yield' | 'money'
type FieldMetric = 'oil' | 'oilPerTree' | 'unitsPerTree'

const { t: translate } = useTranslation()
const farm = useFarm()
const startMonth = computed(() => farm.value.settings.seasonStartMonth)
const REPORTS: ReportKey[] = ['fields', 'seasons', 'yield', 'money']
const report = ref<ReportKey>('fields')

function fmt(value: number, decimals = 1) {
  return formatNumber(value, formatLocale.value, decimals)
}

function eur(value: number) {
  return formatMoney(value, formatLocale.value)
}

function yieldText(olives: number, oil: number) {
  return formatYield(olives, oil, farm.value.settings.yieldFormat, formatLocale.value)
}

function percent(value: number) {
  return new Intl.NumberFormat(formatLocale.value, {
    style: 'percent',
    maximumFractionDigits: 0,
  }).format(value)
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
const fieldMetric = ref<FieldMetric>('oil')
/** Details of the cell the user tapped. */
const cellInfo = ref('')
const METRICS: FieldMetric[] = ['oil', 'oilPerTree', 'unitsPerTree']

/** Number used for shading (and the CSV); null when it cannot be worked out. */
function metricValue(cell: FieldSeasonCell | undefined, metric: FieldMetric): number | null {
  if (!cell) {
    return null
  }
  if (metric === 'oil') {
    return cell.oilKg || null
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
const unitHint = computed(() => {
  if (fieldMetric.value === 'oilPerTree') {
    return translate('reports.unitHint', { unit: translate('reports.kgOil') })
  }
  const unit = onlyUnit.value
  const name = unit ? (unit.pluralName ?? unit.name) : translate('reports.units')

  return translate('reports.unitHint', { unit: name })
})

function cellText(cell: FieldSeasonCell | undefined): string {
  const value = metricValue(cell, fieldMetric.value)
  if (value == null || !cell) {
    return '–'
  }
  if (fieldMetric.value !== 'unitsPerTree') {
    return fmt(value, fieldMetric.value === 'oil' ? 0 : 1)
  }
  if (onlyUnit.value) {
    return fmt(value, 2)
  }

  return Object.entries(cell.units)
    .filter(([, amount]) => amount > 0)
    .map(([unitId, amount]) => {
      const perTree = amount / cell.perTreeOf
      return `${fmt(perTree, 2)} ${unitLabel(unitById(unitId), perTree)}`
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
const seasonBars = computed(() =>
  history.value.slice(-6).map((row) => ({
    label: season(row.season),
    value: row.netKg,
    valueText: `${fmt(row.netKg, 0)} ${translate('common.kg')}`,
    detail: translate('reports.seasonBarDetail', {
      net: fmt(row.netKg, 0),
      oil: fmt(row.oilKg, 0),
      olives: fmt(row.oliveKg, 0),
      yield: yieldText(row.oliveKg, row.oilKg),
    }),
  })),
)

/* ---------- 3. yield through the season ---------- */
const yieldSeasons = computed(() =>
  yieldThroughSeason(farm.value.extractions, startMonth.value),
)
const yieldSeries = computed(() =>
  yieldSeasons.value.slice(0, 3).map((line) => ({
    key: line.season,
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
/** Where each month starts, counted in days from the start of the season. */
const monthTicks = computed(() => {
  const start = new Date(2001, startMonth.value - 1, 1)
  const format = new Intl.DateTimeFormat(formatLocale.value, { month: 'short' })

  return Array.from({ length: 12 }, (_, i) => {
    const monthStart = new Date(2001, startMonth.value - 1 + i, 1)

    return {
      day: Math.round((monthStart.getTime() - start.getTime()) / 86_400_000),
      label: format.format(monthStart),
    }
  })
})

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

const hasData = computed(() => {
  const lookup: Record<ReportKey, boolean> = {
    fields: fieldReport.value.rows.length > 0,
    seasons: history.value.length > 0,
    yield: yieldSeasons.value.length > 0,
    money: economics.value.length > 0,
  }

  return lookup[report.value]
})
</script>

<template>
  <main class="page reports">
    <h1>{{ $t('more.reports') }}</h1>
    <div class="chips report-tabs" role="tablist">
      <button
        v-for="key in REPORTS"
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

      <p v-if="!hasData" class="empty-note">{{ $t(`reports.empty.${report}`) }}</p>

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
        <p v-if="fieldMetric !== 'oil'" class="small">{{ unitHint }}</p>
        <p class="muted small">{{ $t('reports.fieldsNote') }}</p>
      </template>

      <!-- 2. seasons -->
      <template v-else-if="report === 'seasons'">
        <SeasonBars :bars="seasonBars" :title="$t('reports.title.seasons')" />
        <div class="table-scroll">
          <table class="report-table">
            <thead>
              <tr>
                <th scope="col">{{ $t('oil.season') }}</th>
                <th scope="col">{{ $t('oil.olives') }}</th>
                <th scope="col">{{ $t('oil.oil') }}</th>
                <th scope="col">{{ $t('oil.net') }}</th>
                <th scope="col">{{ $t('oil.yield') }}</th>
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
        <YieldChart
          :series="yieldSeries"
          :months="monthTicks"
          :format-value="percent"
          :title="$t('reports.title.yield')"
        />
        <p class="muted small">{{ $t('reports.yieldNote') }}</p>
      </template>

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

      <button v-if="hasData" type="button" class="btn ghost small" @click="exportCsv">
        ⬇ {{ $t('reports.csv') }}
      </button>
    </section>
  </main>
</template>
