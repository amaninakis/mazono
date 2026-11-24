<script setup lang="ts">
import { useTemplateRef, watch } from 'vue'
import { formatLocale } from '../i18n'
import AppIcon from './AppIcon.vue'
import { slideIn } from './slide'
import SwipeTrack from './SwipeTrack.vue'

/**
 * Calendar header: ‹ month › and ‹ year ›, each with its own arrows, so moving a whole year
 * is as obvious as moving a month. Emits how many months to move. Dragging the month or the
 * year sideways brings in the next one (left) or the previous one, following the finger.
 */
const props = defineProps<{ year: number; month: number; forwardDisabled?: boolean }>()
const emit = defineEmits<{ shift: [months: number] }>()

/**
 * Month name as it stands alone ("Σεπτέμβριος", not "Σεπτεμβρίου"), for the shown month or
 * the one `offset` months away (while dragging).
 */
function monthName(offset: number) {
  const parts = new Intl.DateTimeFormat(formatLocale.value, {
    month: 'long',
    year: 'numeric',
  }).formatToParts(new Date(props.year, props.month - 1 + offset, 1))

  return parts.find((part) => part.type === 'month')?.value ?? ''
}

const monthLabel = useTemplateRef<HTMLElement>('monthLabel')
const yearLabel = useTemplateRef<HTMLElement>('yearLabel')

/** Later months and years can be dragged in unless the calendar ends here. */
function canGo(step: number) {
  return step < 0 || !props.forwardDisabled
}

watch(
  () => props.year * 12 + props.month,
  (shown, before) => {
    const step = shown > before ? 1 : -1
    slideIn(monthLabel.value, step)
    if (Math.floor((shown - 1) / 12) !== Math.floor((before - 1) / 12)) {
      slideIn(yearLabel.value, step)
    }
  },
  { flush: 'post' },
)
</script>

<template>
  <div class="month-nav">
    <span class="nav-group month-group">
      <button
        type="button"
        class="icon-btn"
        :aria-label="$t('journal.prevMonth')"
        @click="emit('shift', -1)"
      >
        <AppIcon name="chevronLeft" :size="20" />
      </button>
      <SwipeTrack :can-go="canGo" @step="(step) => emit('shift', step)">
        <template #default="{ offset }">
          <strong :ref="offset === 0 ? 'monthLabel' : undefined" class="cap">{{
            monthName(offset)
          }}</strong>
        </template>
      </SwipeTrack>
      <button
        type="button"
        class="icon-btn"
        :aria-label="$t('journal.nextMonth')"
        :disabled="forwardDisabled"
        @click="emit('shift', 1)"
      >
        <AppIcon name="chevronRight" :size="20" />
      </button>
    </span>
    <span class="nav-group year-group">
      <button
        type="button"
        class="icon-btn"
        :aria-label="$t('journal.prevYear')"
        @click="emit('shift', -12)"
      >
        <AppIcon name="chevronLeft" :size="20" />
      </button>
      <SwipeTrack :can-go="canGo" @step="(step) => emit('shift', step * 12)">
        <template #default="{ offset }">
          <strong :ref="offset === 0 ? 'yearLabel' : undefined">{{ year + offset }}</strong>
        </template>
      </SwipeTrack>
      <button
        type="button"
        class="icon-btn"
        :aria-label="$t('journal.nextYear')"
        :disabled="forwardDisabled"
        @click="emit('shift', 12)"
      >
        <AppIcon name="chevronRight" :size="20" />
      </button>
    </span>
  </div>
</template>
