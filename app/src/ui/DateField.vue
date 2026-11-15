<script setup lang="ts">
import { computed, useTemplateRef } from 'vue'
import { parseISODate } from '../core/dates'
import { formatLocale } from '../i18n'

/**
 * A date picker that shows the date in the app's format (e.g. 15/11/2026), not the browser's.
 * The native date input sits invisibly on top, so tapping still opens the phone's date picker.
 */
defineProps<{ id?: string; max?: string; label?: string }>()
const model = defineModel<string>({ required: true })
const input = useTemplateRef<HTMLInputElement>('input')

const shown = computed(() =>
  model.value
    ? new Intl.DateTimeFormat(formatLocale.value, {
        day: 'numeric',
        month: 'numeric',
        year: 'numeric',
      }).format(parseISODate(model.value))
    : '',
)

function open() {
  try {
    input.value?.showPicker()
  } catch {
    input.value?.focus()
  }
}

function onChange(event: Event) {
  const value = (event.target as HTMLInputElement).value
  if (value) {
    model.value = value
  }
}
</script>

<template>
  <div class="date-field" @click="open">
    <span class="date-shown">{{ shown }}</span>
    <span aria-hidden="true">📅</span>
    <input
      :id="id"
      ref="input"
      type="date"
      class="date-native"
      :value="model"
      :max="max"
      :aria-label="label"
      @change="onChange"
    />
  </div>
</template>
