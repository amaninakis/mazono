<script setup lang="ts">
import { computed, ref } from 'vue'

/**
 * Running totals through the farming year (units, oil or trees), one line per year, drawn
 * as steps: the total stays flat between days and rises on the days something was added.
 * This year runs up to today; a year it is compared with runs to the end, so its final
 * total is easy to read. Tapping a point shows it.
 */
interface Point {
  day: number
  value: number
  detail: string
}
const props = defineProps<{
  /** `slot` (0–2) picks the colour; `dashed` is for the average of earlier years. */
  series: {
    key: string
    slot: number
    label: string
    points: Point[]
    dashed?: boolean
    /** Carry the line on, flat, to this day (today, for this year). */
    until?: number
  }[]
  months: { day: number; label: string; minor?: boolean }[]
  /** Day of the year today, marked with a line, when the chart shows this year. */
  today?: number
  todayLabel: string
  formatValue: (value: number) => string
  title: string
}>()

const WIDTH = 340
const HEIGHT = 210
const LEFT = 44
/** Room for the end labels ("Μέσος όρος"). */
const RIGHT = 78
const TOP = 16
const BOTTOM = 24

const active = ref<{ series: number; point: number } | null>(null)

const drawn = computed(() => props.series.filter((line) => line.points.length > 0))
const dayRange = computed(() => {
  const days = drawn.value.flatMap((line) => [
    ...line.points.map((point) => point.day),
    ...(line.until == null ? [] : [line.until]),
  ])
  if (props.today != null) {
    days.push(props.today)
  }
  const first = Math.max(Math.min(...days) - 7, 0)
  const last = Math.max(...days) + 7

  return [first, Math.max(last, first + 30)] as const
})

/** 0 to a round number above the largest total, in 3–5 round steps (1, 2 or 5 × 10ⁿ). */
const valueTicks = computed(() => {
  const largest = Math.max(
    ...drawn.value.flatMap((line) => line.points.map((point) => point.value)),
    1,
  )
  const rough = largest / 4
  const power = 10 ** Math.floor(Math.log10(rough))
  const step = [1, 2, 5, 10].map((factor) => factor * power).find((each) => each >= rough)!
  const ticks: number[] = []
  for (let value = 0; value < largest + step; value += step) {
    ticks.push(value)
  }

  return ticks
})

function xOf(day: number) {
  const [first, last] = dayRange.value
  return LEFT + ((day - first) / (last - first)) * (WIDTH - LEFT - RIGHT)
}

function yOf(value: number) {
  const high = valueTicks.value.at(-1)!
  return TOP + (1 - value / high) * (HEIGHT - TOP - BOTTOM)
}

const monthTicks = computed(() => {
  const inRange = props.months.filter(
    (month) => month.day >= dayRange.value[0] && month.day <= dayRange.value[1],
  )

  // Up to about seven labels fit along the bottom of a phone screen.
  return inRange.length > 7 ? inRange.filter((month) => !month.minor) : inRange
})

/** Where a line stops: today for this year, the end of the chart for a year compared with. */
function endOf(line: (typeof props.series)[number]) {
  return line.until ?? dayRange.value[1]
}

function stepPath(line: (typeof props.series)[number]) {
  const parts = [`M${xOf(line.points[0].day)},${yOf(0)}`]
  for (const point of line.points) {
    parts.push(`H${xOf(point.day)}`, `V${yOf(point.value)}`)
  }
  parts.push(`H${xOf(Math.max(endOf(line), line.points.at(-1)!.day))}`)

  return parts.join(' ')
}

function colourOf(slot: number) {
  return `series-${slot % 3}`
}

/** End-of-line labels, pushed apart so they never overlap (12px apart at least). */
const labelY = computed(() => {
  const order = drawn.value
    .map((line, i) => ({ i, y: yOf(line.points.at(-1)!.value) + 4 }))
    .sort((left, right) => left.y - right.y)

  for (let j = 1; j < order.length; j++) {
    order[j].y = Math.max(order[j].y, order[j - 1].y + 13)
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
  const line = drawn.value[active.value.series]

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
      <g v-if="today != null" class="chart-today">
        <line :x1="xOf(today)" :x2="xOf(today)" :y1="TOP" :y2="HEIGHT - BOTTOM" />
        <text :x="xOf(today)" :y="TOP - 4" text-anchor="middle">{{ todayLabel }}</text>
      </g>
      <g
        v-for="(line, i) in drawn"
        :key="line.key"
        :class="[colourOf(line.slot), { dashed: line.dashed }]"
      >
        <path class="chart-line" :d="stepPath(line)" />
        <template v-if="!line.dashed">
          <circle
            v-for="point in line.points"
            :key="point.day"
            class="chart-dot"
            :cx="xOf(point.day)"
            :cy="yOf(point.value)"
            r="3"
          />
        </template>
        <text
          class="chart-label"
          :x="xOf(Math.max(endOf(line), line.points.at(-1)!.day)) + 6"
          :y="labelY[i]"
        >
          {{ line.label }}
        </text>
        <circle
          v-for="(point, j) in line.points"
          :key="`hit${point.day}`"
          class="chart-hit"
          :cx="xOf(point.day)"
          :cy="yOf(point.value)"
          r="12"
          @mouseenter="active = { series: i, point: j }"
          @click="active = { series: i, point: j }"
        />
      </g>
    </svg>
    <figcaption v-if="tooltip" class="chart-tooltip" role="status">
      <strong>{{ tooltip.label }}</strong> · {{ tooltip.point.detail }}
    </figcaption>
    <ul v-if="drawn.length > 1" class="chart-legend">
      <li
        v-for="line in drawn"
        :key="line.key"
        :class="[colourOf(line.slot), { dashed: line.dashed }]"
      >
        <span class="chart-swatch" aria-hidden="true"></span>{{ line.label }}
      </li>
    </ul>
  </figure>
</template>
