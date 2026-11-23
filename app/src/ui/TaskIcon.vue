<script setup lang="ts">
import { Icon } from '@iconify/vue'
import { computed } from 'vue'
import { taskIconName } from '../core/taskIcons'

/**
 * A task type's icon: its line icon, or the saved emoji when there is none. Decorative.
 * `ssr` draws it on the first render (the icons are bundled), so nothing jumps.
 */
const props = withDefaults(defineProps<{ icon?: string; size?: number }>(), {
  icon: '',
  size: 20,
})

const name = computed(() => taskIconName(props.icon))
</script>

<template>
  <Icon
    v-if="name"
    class="task-icon"
    aria-hidden="true"
    ssr
    :icon="name"
    :width="size"
    :height="size"
  />
  <span v-else class="task-icon emoji" aria-hidden="true">{{ icon }}</span>
</template>
