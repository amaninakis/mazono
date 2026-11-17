<script setup lang="ts">
import type { IconName } from './icons'
import { computed } from 'vue'
import { ICONS } from './icons'

/**
 * The app's line icons: drawn the same on every phone (emoji are not), in the colour of the
 * text around them. Decorative: the button or link next to them carries the words.
 */
const props = withDefaults(defineProps<{ name: IconName; size?: number }>(), { size: 22 })

const shapes = computed(() =>
  ICONS[props.name].map((shape) => {
    if (!shape.startsWith('circle:')) {
      return { path: shape }
    }
    const [cx, cy, radius] = shape.slice('circle:'.length).split(',').map(Number)

    return { circle: { cx, cy, radius } }
  }),
)
</script>

<template>
  <svg
    class="app-icon"
    aria-hidden="true"
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.8"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <template v-for="(shape, i) in shapes" :key="i">
      <path v-if="shape.path" :d="shape.path" />
      <circle
        v-else-if="shape.circle"
        :cx="shape.circle.cx"
        :cy="shape.circle.cy"
        :r="shape.circle.radius"
      />
    </template>
  </svg>
</template>
