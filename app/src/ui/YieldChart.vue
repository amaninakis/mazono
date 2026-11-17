<script setup lang="ts">
import { computed, ref } from 'vue'
import { ratioTicks } from '../core/format'

/**
 * Yield (oil ÷ olives) of each extraction against the day of the season, one line per season.
 * Each season keeps its colour; lines are labelled at their end, and tapping a point shows it.
 */
interface Point {
  day: number
  value: number
  detail: string
}
const props = defineProps<{
  /** `slot` (0–2) picks the colour; the page keeps a year's slot while it is shown. */
  series: { key: number; slot: number; label: string; points: Point[] }[]
  /** Date ticks: day of the year where each tick falls, its label, and whether it is a
   * mid-month tick (dropped when the chart spans too long to fit them). */
  months: { day: number; label: string; minor?: boolean }[]
  formatValue: (value: number) => string
  /** Lines at whole ratios (1/4, 1/5…) instead of whole percents, for the 1/x style. */
  ratioAxis?: boolean
  title: string
}>()

const WIDTH = 340
const HEIGHT = 200
const LEFT = 40
const RIGHT = 58
const TOP = 12
const BOTTOM = 24

const active = ref<{ series: number; point: number } | null>(null)

const allPoints = computed(() => props.series.flatMap((line) => line.points))
const dayRange = computed(() => {
  const days = allPoints.value.map((point) => point.day)
  const first = Math.max(Math.min(...days) - 7, 0)
  const last = Math.max(...days) + 7

  return [first, Math.max(last, first + 30)] as const
})
const ratioScale = computed(() => {
  const values = allPoints.value.map((point) => point.value)
  return ratioTicks(Math.min(...values), Math.max(...values))
})

/** Value axis in whole percent steps (or whole ratios), with some room above and below. */
const valueRange = computed(() => {
  if (props.ratioAxis) {
    return ratioScale.value.range
  }
  const values = allPoints.value.map((point) => point.value * 100)
  const low = Math.floor(Math.min(...values) - 1)
  const high = Math.ceil(Math.max(...values) + 1)

  return [Math.max(low, 0) / 100, high / 100] as const
})

function xOf(day: number) {
  const [first, last] = dayRange.value
  return LEFT + ((day - first) / (last - first)) * (WIDTH - LEFT - RIGHT)
}

function yOf(value: number) {
  const [low, high] = valueRange.value
  return TOP + (1 - (value - low) / (high - low)) * (HEIGHT - TOP - BOTTOM)
}

const valueTicks = computed(() => {
  if (props.ratioAxis) {
    return ratioScale.value.ticks
  }
  const [low, high] = valueRange.value
  const step = Math.max(Math.round(((high - low) * 100) / 3), 1) / 100
  const ticks: number[] = []
  for (let value = low; value <= high + 1e-9; value += step) {
    ticks.push(Math.round(value * 100) / 100)
  }

  return ticks
})
const monthTicks = computed(() => {
  const inRange = props.months.filter(
    (month) => month.day >= dayRange.value[0] && month.day <= dayRange.value[1],
  )

  // Up to about seven labels fit along the bottom of a phone screen.
  return inRange.length > 7 ? inRange.filter((month) => !month.minor) : inRange
})

function linePath(points: Point[]) {
  return points
    .map((point, i) => `${i ? 'L' : 'M'}${xOf(point.day)},${yOf(point.value)}`)
    .join(' ')
}

/** Colour of a slot (the page keeps each shown year in the same slot). */
function colourOf(slot: number) {
  return `series-${slot % 3}`
}

/** End-of-line label positions, pushed apart so labels never overlap (12px apart at least). */
const labelY = computed(() => {
  const order = props.series
    .map((line, i) => ({ i, y: yOf(line.points.at(-1)!.value) + 4 }))
    .sort((left, right) => left.y - right.y)

  for (let j = 1; j < order.length; j++) {
    order[j].y = Math.max(order[j].y, order[j - 1].y + 12)
  }
  const byIndex: number[] = []
  for (const label of order) {
    byIndex[label.i] = label.y
  }

  return byIndex
})

const tooltip = computed(() => {
  if (!active.value) {
    return null
  }
  const line = props.series[active.value.series]

  return { label: line.label, point: line.points[active.value.point] }
})
</script>

<template>
  <figure class="chart" @mouseleave="active = null">
    <svg :viewBox="`0 0 ${WIDTH} ${HEIGHT}`" role="img" :aria-label="title">
      <g v-for="value in valueTicks" :key="value">
        <line
          class="chart-grid"
          :x1="LEFT"
          :x2="WIDTH - RIGHT"
          :y1="yOf(value)"
          :y2="yOf(value)"
        />
        <text class="chart-tick" :x="LEFT - 6" :y="yOf(value) + 4" text-anchor="end">
          {{ formatValue(value) }}
        </text>
      </g>
      <text
        v-for="month in monthTicks"
        :key="month.day"
        class="chart-tick"
        :x="xOf(month.day)"
        :y="HEIGHT - 6"
        text-anchor="middle"
      >
        {{ month.label }}
      </text>
      <g v-for="(line, i) in series" :key="line.key" :class="colourOf(line.slot)">
        <path class="chart-line" :d="linePath(line.points)" />
        <circle
          v-for="point in line.points"
          :key="point.day"
          class="chart-dot"
          :cx="xOf(point.day)"
          :cy="yOf(point.value)"
          r="4"
        />
        <text class="chart-label" :x="xOf(line.points.at(-1)!.day) + 8" :y="labelY[i]">
          {{ line.label }}
        </text>
        <circle
          v-for="(point, j) in line.points"
          :key="`hit${point.day}`"
          class="chart-hit"
          :cx="xOf(point.day)"
          :cy="yOf(point.value)"
          r="14"
          @mouseenter="active = { series: i, point: j }"
          @click="active = { series: i, point: j }"
        />
      </g>
    </svg>
    <figcaption v-if="tooltip" class="chart-tooltip" role="status">
      <strong>{{ tooltip.label }}</strong> · {{ tooltip.point.detail }}
    </figcaption>
    <ul v-if="series.length > 1" class="chart-legend">
      <li v-for="line in series" :key="line.key" :class="colourOf(line.slot)">
        <span class="chart-swatch" aria-hidden="true"></span>{{ line.label }}
      </li>
    </ul>
  </figure>
</template>
