<script setup lang="ts">
import { computed, ref } from 'vue'
import { suggestNames } from '../core/search'

/**
 * Text box that suggests names used before as you type (accents and capitals don't matter).
 * Tap a suggestion, or use the arrow keys and Enter. `done` fires when a name is picked or
 * the box is left, so the page can fill in what goes with that name.
 */
const props = defineProps<{ id: string; names: string[] }>()
const emit = defineEmits<{ done: [] }>()
const model = defineModel<string>({ required: true })

const open = ref(false)
const highlighted = ref(-1)
const suggestions = computed(() => (open.value ? suggestNames(props.names, model.value) : []))
const listId = computed(() => `${props.id}-suggestions`)

function onInput() {
  open.value = true
  highlighted.value = -1
}

function choose(name: string) {
  model.value = name
  open.value = false
  emit('done')
}

function onKey(event: KeyboardEvent) {
  const count = suggestions.value.length
  if (event.key === 'ArrowDown' && count) {
    event.preventDefault()
    open.value = true
    highlighted.value = (highlighted.value + 1) % count
  } else if (event.key === 'ArrowUp' && count) {
    event.preventDefault()
    highlighted.value = (highlighted.value - 1 + count) % count
  } else if (event.key === 'Enter' && highlighted.value >= 0 && count) {
    event.preventDefault()
    choose(suggestions.value[highlighted.value])
  } else if (event.key === 'Escape') {
    open.value = false
  }
}

function onBlur() {
  open.value = false
  emit('done')
}
</script>

<template>
  <div class="name-input">
    <input
      :id="id"
      v-model="model"
      class="input"
      autocomplete="off"
      role="combobox"
      :aria-expanded="suggestions.length > 0"
      :aria-controls="listId"
      aria-autocomplete="list"
      :aria-activedescendant="highlighted >= 0 ? `${listId}-${highlighted}` : undefined"
      @focus="open = true"
      @input="onInput"
      @keydown="onKey"
      @blur="onBlur"
    />
    <ul v-if="suggestions.length" :id="listId" class="suggestions" role="listbox">
      <li
        v-for="(name, i) in suggestions"
        :id="`${listId}-${i}`"
        :key="name"
        role="option"
        :aria-selected="i === highlighted"
        :class="{ highlighted: i === highlighted }"
        @pointerdown.prevent="choose(name)"
      >
        {{ name }}
      </li>
    </ul>
  </div>
</template>
