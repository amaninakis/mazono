<script setup lang="ts">
import { computed, useTemplateRef, watch } from 'vue'
import { isFutureMonth } from '../core/months'
import { formatLocale } from '../i18n'
import AppIcon from './AppIcon.vue'
import ScrollRow from './ScrollRow.vue'
import { nudge, slideIn } from './slide'
import SwipeTrack from './SwipeTrack.vue'

/**
 * The Journal's month chooser: ‹ year › with its own arrows, then the twelve months as chips
 * in a row that scrolls sideways (the same as the task chips). A dot marks months with work;
 * months after today cannot be chosen. Dragging the year sideways brings in the next one
 * (left) or the previous one, following the finger. Emits the chosen year and month.
 */
const props = defineProps<{
  year: number
  month: number
  today: string
  withWork: Set<number>
}>()
const emit = defineEmits<{ pick: [year: number, month: number] }>()

const thisYear = computed(() => Number(props.today.slice(0, 4)))

function monthName(month: number, style: 'short' | 'long') {
  return new Intl.DateTimeFormat(formatLocale.value, { month: style }).format(
    new Date(props.year, month - 1, 1),
  )
}

const months = computed(() =>
  Array.from({ length: 12 }, (_, i) => ({
    number: i + 1,
    short: monthName(i + 1, 'short'),
    long: monthName(i + 1, 'long'),
    future: isFutureMonth(props.year, i + 1, props.today),
  })),
)

const yearLabel = useTemplateRef<HTMLElement>('yearLabel')

function stepYear(step: number) {
  if (props.year + step > thisYear.value) {
    nudge(yearLabel.value, 1)
    return
  }
  emit('pick', props.year + step, props.month)
}

watch(
  () => props.year,
  (shown, before) => slideIn(yearLabel.value, shown > before ? 1 : -1),
  { flush: 'post' },
)
</script>

<template>
  <div class="month-strip">
    <span class="year-step">
      <button
        type="button"
        class="icon-btn"
        :aria-label="$t('journal.prevYear')"
        @click="stepYear(-1)"
      >
        <AppIcon name="chevronLeft" :size="20" />
      </button>
      <SwipeTrack :can-go="(step) => year + step <= thisYear" @step="stepYear">
        <template #default="{ offset }">
          <strong :ref="offset === 0 ? 'yearLabel' : undefined">{{ year + offset }}</strong>
        </template>
      </SwipeTrack>
      <button
        type="button"
        class="icon-btn"
        :aria-label="$t('journal.nextYear')"
        :disabled="year >= thisYear"
        @click="stepYear(1)"
      >
        <AppIcon name="chevronRight" :size="20" />
      </button>
    </span>
    <ScrollRow
      class="month-chips"
      :aria-label="$t('journal.month')"
      :selected-key="`${year}-${month}`"
    >
      <button
        v-for="x in months"
        :key="x.number"
        type="button"
        class="chip month-chip"
        :class="[{ selected: x.number === month }]"
        :aria-pressed="x.number === month"
        :aria-label="
          withWork.has(x.number)
            ? `${x.long} ${year}, ${$t('journal.hasWork')}`
            : `${x.long} ${year}`
        "
        :disabled="x.future"
        @click="emit('pick', year, x.number)"
      >
        <span class="cap">{{ x.short }}</span>
        <i v-if="withWork.has(x.number)" class="month-dot" aria-hidden="true"></i>
      </button>
    </ScrollRow>
  </div>
</template>
