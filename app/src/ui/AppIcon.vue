<script setup lang="ts">
import type { IconName } from './icons'
import { Icon } from '@iconify/vue'
import { ICONS } from './icons'

/**
 * One of the app's line icons (see icons.ts), in the colour of the text around it.
 * Decorative: the button or link next to it carries the words. `ssr` draws it on the first
 * render (the icons are bundled into the app), so nothing jumps while the page opens.
 */
withDefaults(defineProps<{ name: IconName; size?: number }>(), { size: 22 })
</script>

<template>
  <Icon
    class="app-icon"
    aria-hidden="true"
    ssr
    :icon="ICONS[name]"
    :width="size"
    :height="size"
  />
</template>
