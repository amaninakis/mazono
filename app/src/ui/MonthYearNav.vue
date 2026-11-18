<script setup lang="ts">
import { computed } from 'vue'
import { formatLocale } from '../i18n'

/**
 * Calendar header: ‹ month › and ‹ year ›, each with its own arrows, so moving a whole year
 * is as obvious as moving a month. Emits how many months to move.
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
        ‹
      </button>
      <strong class="cap">{{ monthName }}</strong>
      <button
        type="button"
        class="icon-btn"
        :aria-label="$t('journal.nextMonth')"
        :disabled="forwardDisabled"
        @click="emit('shift', 1)"
      >
        ›
      </button>
    </span>
    <span class="nav-group year-group">
      <button
        type="button"
        class="icon-btn"
        :aria-label="$t('journal.prevYear')"
        @click="emit('shift', -12)"
      >
        ‹
      </button>
      <strong>{{ year }}</strong>
      <button
        type="button"
        class="icon-btn"
        :aria-label="$t('journal.nextYear')"
        :disabled="forwardDisabled"
        @click="emit('shift', 12)"
      >
        ›
      </button>
    </span>
  </div>
</template>
