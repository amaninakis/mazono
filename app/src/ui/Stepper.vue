<script setup lang="ts">
import { ref, watch } from 'vue';
import { parseDecimal } from '../core/progress';
import { locale } from '../i18n';

/** − value + control with a typeable number in the middle. Accepts comma decimals. */
const props = withDefaults(defineProps<{ label: string; step?: number; min?: number; id?: string }>(), {
  step: 1,
  min: 0,
});
const model = defineModel<number | null>({ required: true });

const fmt = (n: number | null) =>
  n == null ? '' : new Intl.NumberFormat(locale.value, { maximumFractionDigits: 3, useGrouping: false }).format(n);
const round = (n: number) => Math.round(n * 1000) / 1000;

const text = ref(fmt(model.value));
let focused = false;
watch([model, locale], () => {
  if (!focused) text.value = fmt(model.value);
});

function bump(dir: 1 | -1) {
  model.value = Math.max(props.min, round((model.value ?? 0) + dir * props.step));
}

function onInput(e: Event) {
  const v = (e.target as HTMLInputElement).value;
  text.value = v;
  const n = parseDecimal(v);
  if (v.trim() === '') model.value = null;
  else if (n != null && n >= props.min) model.value = n;
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
    <button type="button" class="step-btn" :aria-label="`− ${label}`" @click="bump(-1)">−</button>
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
    <button type="button" class="step-btn" :aria-label="`+ ${label}`" @click="bump(1)">+</button>
  </div>
</template>
