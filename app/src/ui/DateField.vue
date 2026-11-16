<script setup lang="ts">
import { useTranslation } from 'i18next-vue'
import { computed, ref, useTemplateRef, watch } from 'vue'
import { isCompleteTypedDate, parseISODate, parseTypedDate, todayISO } from '../core/dates'
import { formatLocale } from '../i18n'
import CalendarPicker from './CalendarPicker.vue'

/**
 * A date box: type the date in the app's format (e.g. 15/11/2026), or tap the calendar button.
 * Tapping the box selects the date in it, so typing or pasting replaces it. A date is used as
 * soon as it is fully typed (with its year), so the rest of the page updates straight away.
 */
const props = defineProps<{ id?: string; max?: string; label?: string }>()
const model = defineModel<string>({ required: true })
const { t: translate } = useTranslation()
const input = useTemplateRef<HTMLInputElement>('input')
const wrap = useTemplateRef<HTMLElement>('wrap')
/** Open the calendar towards the side of the screen that has room for it. */
const openToRight = ref(false)

function formatDate(isoDate: string) {
  if (!isoDate) {
    return ''
  }

  return new Intl.DateTimeFormat(formatLocale.value, {
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
  }).format(parseISODate(isoDate))
}

const text = ref(formatDate(model.value))
const error = ref('')
const calendarOpen = ref(false)
let typing = false
watch([model, formatLocale], () => {
  // Keep what the user is typing (e.g. "16/2/26") instead of reformatting it under them.
  if (!typing) {
    text.value = formatDate(model.value)
  }
  error.value = ''
})

/** Shown in the empty box and in the error message, e.g. "15/11/2026". */
const example = computed(() => formatDate(todayISO()))

/** The typed date, or an error message key when it cannot be used. */
function readTyped(): { date?: string; error?: string } {
  const typed = parseTypedDate(text.value, formatLocale.value, todayISO())
  if (!typed) {
    return { error: translate('common.dateInvalid', { example: example.value }) }
  }
  if (props.max && typed > props.max) {
    return { error: translate('common.dateTooLate', { max: formatDate(props.max) }) }
  }

  return { date: typed }
}

/** While typing: use the date as soon as it is complete and valid. */
function onInput() {
  typing = true
  error.value = ''
  if (isCompleteTypedDate(text.value, formatLocale.value)) {
    const { date, error: problem } = readTyped()
    if (date && date !== model.value) {
      model.value = date
    }
    // Say straight away if a whole date cannot be used (e.g. a future harvest day).
    error.value = problem ?? ''
  }
}

/**
 * On Enter or leaving the box: use the date, or say what is wrong and keep the last good one.
 */
function commit() {
  typing = false
  const { date, error: problem } = readTyped()
  if (!date) {
    error.value = problem ?? ''
    text.value = formatDate(model.value)

    return
  }

  error.value = ''
  model.value = date
  text.value = formatDate(date)
}

// Select the whole date on every tap, so typing or pasting replaces it. Without this the tap
// would put the cursor (or part of a selection) where the finger landed. If the finger moved,
// the user is selecting text on purpose, so that selection is kept.
let pressedAt: [number, number] | null = null
function onFocus() {
  input.value?.select()
}

function onPress(event: PointerEvent) {
  pressedAt = [event.clientX, event.clientY]
}

function onTap(event: MouseEvent) {
  const moved =
    !!pressedAt && Math.hypot(event.clientX - pressedAt[0], event.clientY - pressedAt[1]) > 8
  const before = text.value
  // After the browser has handled this tap, unless typing has already begun.
  setTimeout(() => {
    const box = input.value
    if (!moved && box && text.value === before && document.activeElement === box) {
      box.select()
    }
  })
}

function toggleCalendar() {
  if (!calendarOpen.value && typing) {
    commit()
  }
  const box = wrap.value?.getBoundingClientRect()
  openToRight.value = !!box && box.right < Math.min(330, window.innerWidth - 16)
  calendarOpen.value = !calendarOpen.value
}

function onPick(isoDate: string) {
  typing = false
  model.value = isoDate
  text.value = formatDate(isoDate)
  error.value = ''
  calendarOpen.value = false
}
</script>

<template>
  <div ref="wrap" class="date-wrap">
    <div class="date-field" :class="{ invalid: error }">
      <input
        :id="id"
        ref="input"
        v-model="text"
        type="text"
        class="date-text"
        autocomplete="off"
        :placeholder="example"
        :aria-label="label"
        :aria-invalid="!!error"
        @focus="onFocus"
        @pointerdown="onPress"
        @click="onTap"
        @input="onInput"
        @change="commit"
        @keydown.enter.prevent="commit"
      />
      <button
        type="button"
        class="date-button"
        :aria-label="$t('common.openCalendar')"
        :aria-expanded="calendarOpen"
        :title="$t('common.openCalendar')"
        @click="toggleCalendar"
      >
        <span aria-hidden="true">📅</span>
      </button>
    </div>
    <CalendarPicker
      v-if="calendarOpen"
      :class="{ 'open-right': openToRight }"
      :selected="model"
      :max="max"
      @pick="onPick"
      @close="calendarOpen = false"
    />
    <small v-if="error" class="error" role="alert">{{ error }}</small>
  </div>
</template>
