<script setup lang="ts">
import { computed, useTemplateRef, watch } from 'vue'
import { formatLocale } from '../i18n'
import AppIcon from './AppIcon.vue'
import { nudge, slideIn } from './slide'
import { useSwipe } from './swipe'

/**
 * Calendar header: ‹ month › and ‹ year ›, each with its own arrows, so moving a whole year
 * is as obvious as moving a month. Emits how many months to move. Swiping the month or the
 * year sideways moves it one (left: the next one), and the new name slides in.
 */
const props = defineProps<{ year: number; month: number; forwardDisabled?: boolean }>()
const emit = defineEmits<{ shift: [months: number] }>()

/** Month name as it stands alone ("Σεπτέμβριος", not "Σεπτεμβρίου"). */
const monthName = computed(() => {
  const parts = new Intl.DateTimeFormat(formatLocale.value, {
    month: 'long',
    year: 'numeric',
  }).formatToParts(new Date(props.year, props.month - 1, 1))

  return parts.find((part) => part.type === 'month')?.value ?? ''
})

const monthGroup = useTemplateRef<HTMLElement>('monthGroup')
const yearGroup = useTemplateRef<HTMLElement>('yearGroup')
const monthLabel = useTemplateRef<HTMLElement>('monthLabel')
const yearLabel = useTemplateRef<HTMLElement>('yearLabel')

function swipe(months: number, label: HTMLElement | null) {
  if (months > 0 && props.forwardDisabled) {
    nudge(label, 1)
    return
  }
  emit('shift', months)
}

useSwipe(monthGroup, (step) => swipe(step, monthLabel.value))
useSwipe(yearGroup, (step) => swipe(step * 12, yearLabel.value))

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
    <span ref="monthGroup" class="nav-group month-group">
      <button
        type="button"
        class="icon-btn"
        :aria-label="$t('journal.prevMonth')"
        @click="emit('shift', -1)"
      >
        <AppIcon name="chevronLeft" :size="20" />
      </button>
      <strong ref="monthLabel" class="cap">{{ monthName }}</strong>
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
    <span ref="yearGroup" class="nav-group year-group">
      <button
        type="button"
        class="icon-btn"
        :aria-label="$t('journal.prevYear')"
        @click="emit('shift', -12)"
      >
        <AppIcon name="chevronLeft" :size="20" />
      </button>
      <strong ref="yearLabel">{{ year }}</strong>
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
