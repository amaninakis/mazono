<script setup lang="ts">
import { ref, watch } from 'vue';
import { parseDecimal } from '../core/progress';
import { locale } from '../i18n';

/**
 * − value + control with a typeable number in the middle. Accepts comma decimals.
 * `max` caps the value (also when typed); `half` adds a "+½" button.
 */
const props = withDefaults(
  defineProps<{ label: string; step?: number; min?: number; max?: number; half?: boolean; id?: string }>(),
  { step: 1, min: 0, max: undefined, half: false, id: undefined },
);
const model = defineModel<number | null>({ required: true });

const fmt = (n: number | null) =>
  n == null ? '' : new Intl.NumberFormat(locale.value, { maximumFractionDigits: 3, useGrouping: false }).format(n);
const round = (n: number) => Math.round(n * 1000) / 1000;

const text = ref(fmt(model.value));
let focused = false;
watch([model, locale, () => props.max], () => {
  if (props.max != null && model.value != null && model.value > props.max) model.value = props.max;
  if (!focused) text.value = fmt(model.value);
});

const clamp = (n: number) => Math.min(props.max ?? Infinity, Math.max(props.min, round(n)));

// Note: right after `model.value = x`, reading model.value still gives the old value
// until the parent passes the new one back, so keep the new value in a local variable.
function bump(by: number) {
  const next = clamp((model.value ?? 0) + by);
  model.value = next;
  text.value = fmt(next);
}

function onInput(e: Event) {
  const v = (e.target as HTMLInputElement).value;
  text.value = v;
  const n = parseDecimal(v);
  if (v.trim() === '') model.value = null;
  else if (n != null && n >= props.min) {
    const c = clamp(n);
    model.value = c;
    if (c !== n) text.value = fmt(c);
  }
}

function onFocus(e: FocusEvent) {
  focused = true;
  (e.target as HTMLInputElement).select();
}

function onBlur() {
  focused = false;
  text.value = fmt(model.value);
}
</script>

<template>
  <div class="stepper" role="group" :aria-label="label">
    <button type="button" class="step-btn" :aria-label="`− ${label}`" @click="bump(-step)">−</button>
    <input
      :id="id"
      class="step-input"
      inputmode="decimal"
      placeholder="0"
      :value="text"
      @input="onInput"
      @focus="onFocus"
      @blur="onBlur"
    />
    <button type="button" class="step-btn" :aria-label="`+ ${label}`" @click="bump(step)">+</button>
    <button v-if="half" type="button" class="half-btn" :aria-label="`+½ ${label}`" @click="bump(0.5)">+½</button>
  </div>
</template>
