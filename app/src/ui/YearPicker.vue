<script setup lang="ts">
import { computed } from 'vue'

/**
 * Year selector with « » arrows that step one year back or forward, between the oldest and
 * newest year in `years`. `prefix` is shown before each year in the list (e.g. "Χρονιά").
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
    <select v-model="model" class="input select season-select" :aria-label="label">
      <option v-for="year in options" :key="year" :value="year">
        {{ prefix ? `${prefix} ${year}` : year }}
      </option>
    </select>
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
