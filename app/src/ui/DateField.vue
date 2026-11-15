<script setup lang="ts">
import { useTranslation } from 'i18next-vue'
import { computed, ref, useTemplateRef, watch } from 'vue'
import { parseISODate, parseTypedDate, todayISO } from '../core/dates'
import { formatLocale } from '../i18n'

/**
 * A date box: type the date in the app's format (e.g. 15/11/2026), or tap the calendar button
 * to pick it from the phone's date picker.
 */
const props = defineProps<{ id?: string; max?: string; label?: string }>()
const model = defineModel<string>({ required: true })
const { t: translate } = useTranslation()
const picker = useTemplateRef<HTMLInputElement>('picker')

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
watch([model, formatLocale], () => {
  text.value = formatDate(model.value)
  error.value = ''
})

/** Shown in the empty box and in the error message, e.g. "15/11/2026". */
const example = computed(() => formatDate(todayISO()))

/** Save what was typed; if it is not a valid date, say so and keep the last good date. */
function commit() {
  const typed = parseTypedDate(text.value, formatLocale.value, todayISO())
  if (!typed) {
    error.value = translate('common.dateInvalid', { example: example.value })
    text.value = formatDate(model.value)

    return
  }
  if (props.max && typed > props.max) {
    error.value = translate('common.dateTooLate', { max: formatDate(props.max) })
    text.value = formatDate(model.value)

    return
  }

  error.value = ''
  model.value = typed
  text.value = formatDate(typed)
}

function openCalendar() {
  try {
    picker.value?.showPicker()
  } catch {
    picker.value?.focus()
    picker.value?.click()
  }
}

function onPick(event: Event) {
  const value = (event.target as HTMLInputElement).value
  if (value) {
    model.value = value
  }
}
</script>

<template>
  <div class="date-wrap">
    <div class="date-field" :class="{ invalid: error }">
      <input
        :id="id"
        v-model="text"
        type="text"
        class="date-text"
        autocomplete="off"
        :placeholder="example"
        :aria-label="label"
        :aria-invalid="!!error"
        @change="commit"
        @keydown.enter.prevent="commit"
      />
      <button
        type="button"
        class="date-button"
        :aria-label="$t('common.openCalendar')"
        :title="$t('common.openCalendar')"
        @click="openCalendar"
      >
        <span aria-hidden="true">📅</span>
        <input
          ref="picker"
          type="date"
          class="date-native"
          tabindex="-1"
          aria-hidden="true"
          :value="model"
          :max="max"
          @change="onPick"
        />
      </button>
    </div>
    <small v-if="error" class="error" role="alert">{{ error }}</small>
  </div>
</template>
