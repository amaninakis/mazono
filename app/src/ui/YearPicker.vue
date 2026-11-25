<script setup lang="ts">
import { computed, useTemplateRef, watch } from 'vue'
import AppIcon from './AppIcon.vue'
import { slideIn } from './slide'
import SwipeTrack from './SwipeTrack.vue'

/**
 * Year selector that looks and works like the Journal's: ‹ year › with arrows that step one
 * year back or forward, between the oldest and newest year in `years`. Dragging the year
 * sideways brings in the next one (left) or the previous one, following the finger. Tapping
 * the year opens the list of years, to jump further at once.
 */
const props = defineProps<{ years: number[]; label: string }>()
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

const yearLabel = useTemplateRef<HTMLElement>('yearLabel')

/** A year can be dragged in while there is one that way. */
function canGo(step: number) {
  const year = model.value + step
  return year >= oldest.value && year <= newest.value
}

watch(model, (year, before) => slideIn(yearLabel.value, year > before ? 1 : -1), {
  flush: 'post',
})
</script>

<template>
  <span class="year-step year-picker">
    <button
      type="button"
      class="icon-btn"
      :aria-label="$t('journal.prevYear')"
      :disabled="model <= oldest"
      @click="model -= 1"
    >
      <AppIcon name="chevronLeft" :size="20" />
    </button>
    <SwipeTrack :can-go="canGo" @step="(step) => (model += step)">
      <template #default="{ offset }">
        <span v-if="offset === 0" ref="yearLabel" class="year-choice">
          <strong>{{ model }}</strong>
          <!-- Invisible over the year: tapping it opens the list of years. -->
          <select v-model="model" class="year-list" :aria-label="label">
            <option v-for="year in options" :key="year" :value="year">{{ year }}</option>
          </select>
        </span>
        <strong v-else>{{ model + offset }}</strong>
      </template>
    </SwipeTrack>
    <button
      type="button"
      class="icon-btn"
      :aria-label="$t('journal.nextYear')"
      :disabled="model >= newest"
      @click="model += 1"
    >
      <AppIcon name="chevronRight" :size="20" />
    </button>
  </span>
</template>
