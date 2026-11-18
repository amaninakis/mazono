<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'

/**
 * A text box for a stored value that is saved when the person leaves it (names, tree counts,
 * kilos…). While they are in it, what they type is kept, even when the page redraws because
 * something else changed (e.g. a sync came in): a plain `:value` box would jump back to the
 * stored value and then save that, losing the edit. It saves only when the text changed,
 * so leaving a box untouched never writes an old value over a newer one from another phone.
 *
 * Use like an input: `<SettingInput :value="field.trees" @blur="(e) => save(e)" />`;
 * `blur` is the native event, sent only when the text changed. Enter also saves.
 */
const props = defineProps<{ value?: string | number | null }>()
const emit = defineEmits<{ blur: [event: FocusEvent] }>()

function shown(value: string | number | null | undefined) {
  return value == null ? '' : String(value)
}

const text = ref('')
let focused = false
let resync: ReturnType<typeof setTimeout> | undefined

// Follow the stored value, except while the person is typing in the box.
watch(
  () => props.value,
  (next) => {
    if (!focused) {
      text.value = shown(next)
    }
  },
  { immediate: true },
)

function onFocus() {
  focused = true
  clearTimeout(resync)
}

function onBlur(event: FocusEvent) {
  focused = false
  if (text.value !== shown(props.value)) {
    emit('blur', event)
    // If the change was not taken (e.g. an empty name), show the stored value again.
    resync = setTimeout(() => {
      if (!focused) {
        text.value = shown(props.value)
      }
    }, 1500)
  }
}

onBeforeUnmount(() => clearTimeout(resync))
</script>

<template>
  <input
    :value="text"
    @input="text = ($event.target as HTMLInputElement).value"
    @focus="onFocus"
    @blur="onBlur"
    @keydown.enter="($event.target as HTMLInputElement).blur()"
  />
</template>
