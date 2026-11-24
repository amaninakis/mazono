<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, useTemplateRef, watch } from 'vue'
import { monthGrid, todayISO } from '../core/dates'
import { formatLocale } from '../i18n'
import MonthYearNav from './MonthYearNav.vue'
import { slideIn } from './slide'
import SwipeTrack from './SwipeTrack.vue'

/**
 * Month calendar that opens under a date box. The current date is selected, days after `max`
 * cannot be picked, and "Today" is always one tap away. Dragging the days sideways brings in
 * the next month (left) or the previous one, following the finger.
 */
const props = defineProps<{ selected: string; max?: string }>()
const emit = defineEmits<{ pick: [isoDate: string]; close: [] }>()
const panel = useTemplateRef<HTMLElement>('panel')

const today = todayISO()
const start = props.selected || today
const shown = ref<[number, number]>([Number(start.slice(0, 4)), Number(start.slice(5, 7))])

/** The days of the shown month, or of the one `offset` months away (while dragging). */
function gridFor(offset: number) {
  const index = shown.value[0] * 12 + (shown.value[1] - 1) + offset
  return monthGrid(Math.floor(index / 12), (index % 12) + 1)
}
const weekdays = computed(() =>
  Array.from({ length: 7 }, (_, i) =>
    new Intl.DateTimeFormat(formatLocale.value, { weekday: 'narrow' }).format(
      new Date(2024, 0, 1 + i),
    ),
  ),
)
const title = computed(() =>
  new Intl.DateTimeFormat(formatLocale.value, { month: 'long', year: 'numeric' }).format(
    new Date(shown.value[0], shown.value[1] - 1, 1),
  ),
)
/** No going to months that only hold days after `max`. */
const canGoForward = computed(() => {
  if (!props.max) {
    return true
  }
  const [year, month] = shown.value

  return year * 12 + month < Number(props.max.slice(0, 4)) * 12 + Number(props.max.slice(5, 7))
})

function shiftMonth(delta: number) {
  let index = shown.value[0] * 12 + (shown.value[1] - 1) + delta
  if (props.max) {
    // Never past the month of the last allowed day.
    index = Math.min(
      index,
      Number(props.max.slice(0, 4)) * 12 + Number(props.max.slice(5, 7)) - 1,
    )
  }
  shown.value = [Math.floor(index / 12), (index % 12) + 1]
}

const days = useTemplateRef<HTMLElement>('days')
/** Dragging the days sideways shows the next month (left) or the previous one (right). */
function canShiftMonth(step: number) {
  return step < 0 || canGoForward.value
}
watch(
  () => shown.value[0] * 12 + shown.value[1],
  (now, before) => slideIn(days.value, now > before ? 1 : -1),
  { flush: 'post' },
)

function isDisabled(isoDate: string) {
  return !!props.max && isoDate > props.max
}

function pick(isoDate: string) {
  if (!isDisabled(isoDate)) {
    emit('pick', isoDate)
  }
}

function dayLabel(isoDate: string) {
  return new Intl.DateTimeFormat(formatLocale.value, { dateStyle: 'full' }).format(
    new Date(`${isoDate}T12:00:00`),
  )
}

/** Close when tapping anywhere outside the calendar (and its date box), or on Escape. */
function onPointerDown(event: PointerEvent) {
  const target = event.target as Node
  if (!panel.value?.parentElement?.contains(target)) {
    emit('close')
  }
}

function onKey(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    emit('close')
  }
}
onMounted(() => {
  document.addEventListener('pointerdown', onPointerDown)
  document.addEventListener('keydown', onKey)
})
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onPointerDown)
  document.removeEventListener('keydown', onKey)
})
</script>

<template>
  <div ref="panel" class="calendar-pop" role="dialog" :aria-label="title">
    <MonthYearNav
      :year="shown[0]"
      :month="shown[1]"
      :forward-disabled="!canGoForward"
      @shift="shiftMonth"
    />
    <div class="cal-grid cal-head">
      <span v-for="(weekday, i) in weekdays" :key="`w${i}`" class="cal-wd">{{ weekday }}</span>
    </div>
    <SwipeTrack :can-go="canShiftMonth" @step="shiftMonth">
      <template #default="{ offset }">
        <div :ref="offset === 0 ? 'days' : undefined" class="cal-grid">
          <template v-for="(day, i) in gridFor(offset)" :key="day ?? `x${i}`">
            <button
              v-if="day"
              type="button"
              class="cal-day"
              :class="{ selected: day === selected, today: day === today }"
              :disabled="isDisabled(day)"
              :aria-label="dayLabel(day)"
              :aria-pressed="day === selected"
              @click="pick(day)"
            >
              <span>{{ Number(day.slice(8)) }}</span>
            </button>
            <span v-else></span>
          </template>
        </div>
      </template>
    </SwipeTrack>
    <div class="calendar-foot">
      <button type="button" class="btn ghost small" @click="emit('close')">
        {{ $t('common.cancel') }}
      </button>
      <button type="button" class="btn primary small" @click="pick(today)">
        {{ $t('common.today') }}
      </button>
    </div>
  </div>
</template>
