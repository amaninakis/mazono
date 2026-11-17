<script setup lang="ts">
import { computed } from 'vue'

/** Simple bar chart, one bar per year, each bar labelled with its exact value. */
const props = defineProps<{
  bars: { label: string; value: number; valueText: string }[]
  title: string
  /** Shown once above the chart (e.g. "in kg"), so the bar labels stay short enough to fit. */
  unit?: string
}>()

const WIDTH = 340
const HEIGHT = 180
const TOP = 22
const BOTTOM = 24
const plotHeight = HEIGHT - TOP - BOTTOM

const max = computed(() => Math.max(...props.bars.map((bar) => bar.value), 0) || 1)
const slot = computed(() => WIDTH / Math.max(props.bars.length, 1))
const barWidth = computed(() => Math.min(44, slot.value * 0.6))

function barHeight(value: number) {
  return (Math.max(value, 0) / max.value) * plotHeight
}

/** Bar with 4px rounded top corners, square at the baseline. */
function barPath(i: number) {
  const height = barHeight(props.bars[i].value)
  const left = slot.value * i + (slot.value - barWidth.value) / 2
  const base = TOP + plotHeight
  const radius = Math.min(4, height, barWidth.value / 2)
  const right = left + barWidth.value
  const top = base - height

  return `M${left},${base} V${top + radius} Q${left},${top} ${left + radius},${top} H${right - radius} Q${right},${top} ${right},${top + radius} V${base} Z`
}

function centre(i: number) {
  return slot.value * i + slot.value / 2
}

const gridLines = computed(() =>
  [0.5, 1].map((share) => TOP + plotHeight - share * plotHeight),
)
</script>

<template>
  <figure class="chart">
    <figcaption v-if="unit" class="chart-caption">{{ unit }}</figcaption>
    <svg :viewBox="`0 0 ${WIDTH} ${HEIGHT}`" role="img" :aria-label="title">
      <line
        v-for="y in gridLines"
        :key="y"
        class="chart-grid"
        x1="0"
        :x2="WIDTH"
        :y1="y"
        :y2="y"
      />
      <g v-for="(bar, i) in bars" :key="bar.label">
        <path class="chart-bar" :d="barPath(i)" />
        <text
          class="chart-value"
          :x="centre(i)"
          :y="TOP + plotHeight - barHeight(bar.value) - 6"
          text-anchor="middle"
        >
          {{ bar.valueText }}
        </text>
        <text class="chart-tick" :x="centre(i)" :y="HEIGHT - 6" text-anchor="middle">
          {{ bar.label }}
        </text>
      </g>
      <line
        class="chart-axis"
        x1="0"
        :x2="WIDTH"
        :y1="TOP + plotHeight"
        :y2="TOP + plotHeight"
      />
    </svg>
  </figure>
</template>
