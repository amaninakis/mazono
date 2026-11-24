<script setup lang="ts">
import type { TaskType } from '../core/types'
import OilDrop from './OilDrop.vue'

/**
 * One day in the Journal's month: its number, "today" under today's, and a dot for each kind
 * of work done that day (up to three, then "+"), plus a drop when olives went to the mill.
 * An empty cell when `day` is null (before the 1st).
 */
defineProps<{
  day: string | null
  selected: boolean
  isToday: boolean
  types: TaskType[]
  oil: boolean
}>()
const emit = defineEmits<{ pick: [isoDate: string] }>()
</script>

<template>
  <button
    v-if="day"
    type="button"
    class="cal-day"
    :class="{ selected, today: isToday }"
    :aria-label="day"
    :aria-current="selected ? 'date' : undefined"
    @click="emit('pick', day)"
  >
    <span class="day-number"
      >{{ Number(day.slice(8)) }}
      <small v-if="isToday" class="today-mark">{{ $t('journal.todayMark') }}</small></span
    >
    <span class="dots" aria-hidden="true">
      <i v-for="x in types.slice(0, 3)" :key="x.id" :style="{ background: x.color }"></i>
      <b v-if="types.length > 3">+</b>
      <em v-if="oil" class="oil-mark"><OilDrop /></em>
    </span>
  </button>
  <span v-else></span>
</template>
