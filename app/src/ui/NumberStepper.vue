<script setup lang="ts">
import { ref, watch } from 'vue'
import { parsePastedNumber } from '../core/numbers'
import { parseDecimal } from '../core/progress'
import { formatLocale } from '../i18n'

/**
 * − value + control with a typeable number in the middle. Accepts comma decimals.
 * `max` caps the value (also when typed); `half` adds a "+½" button.
 * Pasted text like "255 €" or "1.234,50 €" is cleaned up to the number it means.
 */
const props = withDefaults(
  defineProps<{
    label: string
    step?: number
    min?: number
    max?: number
    half?: boolean
    id?: string
  }>(),
  { step: 1, min: 0, max: undefined, half: false, id: undefined },
)
const model = defineModel<number | null>({ required: true })

function fmt(value: number | null) {
  return value == null
    ? ''
    : new Intl.NumberFormat(formatLocale.value, {
        maximumFractionDigits: 3,
        useGrouping: false,
      }).format(value)
}

function round(value: number) {
  return Math.round(value * 1000) / 1000
}

const text = ref(fmt(model.value))
let focused = false
watch([model, formatLocale, () => props.max], () => {
  if (props.max != null && model.value != null && model.value > props.max) {
    model.value = props.max
  }
  if (!focused) {
    text.value = fmt(model.value)
  }
})

function clamp(value: number) {
  return Math.min(props.max ?? Infinity, Math.max(props.min, round(value)))
}

// Note: right after `model.value = x`, reading model.value still gives the old value
// until the parent passes the new one back, so keep the new value in a local variable.
function bump(by: number) {
  const next = clamp((model.value ?? 0) + by)
  model.value = next
  text.value = fmt(next)
}

function onInput(event: Event) {
  const value = (event.target as HTMLInputElement).value
  text.value = value
  const parsed = parseDecimal(value)
  if (value.trim() === '') {
    model.value = null
  } else if (parsed != null && parsed >= props.min) {
    const clamped = clamp(parsed)
    model.value = clamped
    if (clamped !== parsed) {
      text.value = fmt(clamped)
    }
  }
}

/** Use the number found in pasted or leftover text (e.g. "255 €"); false if there is none. */
function useNumberFrom(raw: string) {
  const found = parsePastedNumber(raw, formatLocale.value)
  if (found == null) {
    return false
  }

  const next = clamp(found)
  model.value = next
  text.value = fmt(next)

  return true
}

function onPaste(event: ClipboardEvent) {
  const pasted = event.clipboardData?.getData('text') ?? ''
  if (parseDecimal(pasted) != null) {
    // A plain number: let the browser paste it as usual.
    return
  }
  event.preventDefault()
  useNumberFrom(pasted)
}

function onFocus(event: FocusEvent) {
  focused = true
  ;(event.target as HTMLInputElement).select()
}

function onBlur() {
  focused = false
  if (
    parseDecimal(text.value) == null &&
    text.value.trim() !== '' &&
    useNumberFrom(text.value)
  ) {
    return
  }
  text.value = fmt(model.value)
}
</script>

<template>
  <div class="stepper" role="group" :aria-label="label">
    <button type="button" class="step-btn" :aria-label="`− ${label}`" @click="bump(-step)">
      −
    </button>
    <input
      :id="id"
      class="step-input"
      :aria-label="label"
      inputmode="decimal"
      placeholder="0"
      :value="text"
      @input="onInput"
      @paste="onPaste"
      @focus="onFocus"
      @blur="onBlur"
    />
    <button type="button" class="step-btn" :aria-label="`+ ${label}`" @click="bump(step)">
      +
    </button>
    <button
      v-if="half"
      type="button"
      class="half-btn"
      :aria-label="`+½ ${label}`"
      @click="bump(0.5)"
    >
      +½
    </button>
  </div>
</template>
