<script setup lang="ts">
import { computed, useTemplateRef, watch } from 'vue'
import { slideIn } from './slide'
import SwipeTrack from './SwipeTrack.vue'

/**
 * Year selector with « » arrows that step one year back or forward, between the oldest and
 * newest year in `years`. `prefix` is shown before each year in the list (e.g. "Χρονιά").
 * Dragging it sideways brings in the next year (left) or the previous one, following the
 * finger.
 */
const props = defineProps<{ years: number[]; label: string; prefix?: string }>()
const model = defineModel<number>({ required: true })

const oldest = computed(() => Math.min(...props.years, model.value))
const newest = computed(() => Math.max(...props.years, model.value))
/** Every year from newest to oldest, so stepping never lands on a missing option. */
const options = computed(() => {
  const list: number[] = []
  for (let year = newest.value; year >= oldest.value; year--) {
    list.push(year)
  }

  return list
})

const select = useTemplateRef<HTMLSelectElement>('select')

/** A year can be dragged in while there is one that way. */
function canDrag(step: number) {
  const year = model.value + step
  return year >= oldest.value && year <= newest.value
}

function yearText(year: number) {
  return props.prefix ? `${props.prefix} ${year}` : String(year)
}
watch(model, (year, before) => slideIn(select.value, year > before ? 1 : -1), {
  flush: 'post',
})
</script>

<template>
  <div class="year-picker">
    <button
      type="button"
      class="icon-btn"
      :aria-label="$t('journal.prevYear')"
      :disabled="model <= oldest"
      @click="model -= 1"
    >
      «
    </button>
    <SwipeTrack class="year-track" :can-go="canDrag" @step="(step) => (model += step)">
      <template #default="{ offset }">
        <select
          v-if="offset === 0"
          ref="select"
          v-model="model"
          class="input select season-select"
          :aria-label="label"
        >
          <option v-for="year in options" :key="year" :value="year">
            {{ yearText(year) }}
          </option>
        </select>
        <div v-else class="input select season-select">{{ yearText(model + offset) }}</div>
      </template>
    </SwipeTrack>
    <button
      type="button"
      class="icon-btn"
      :aria-label="$t('journal.nextYear')"
      :disabled="model >= newest"
      @click="model += 1"
    >
      »
    </button>
  </div>
</template>
