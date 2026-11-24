<script setup lang="ts">
import type { RouteLocationNormalizedLoaded } from 'vue-router'
import { provide } from 'vue'
import { RouterView } from 'vue-router'
import AppLogo from './AppLogo.vue'
import { PAGE_PREVIEW } from './preview'

/**
 * A page drawn beside the current one while swiping between pages: live, with its data, but
 * only to look at (no taps, not read out, saves nothing). With its own small logo, so the logo
 * moves with its page.
 */
defineProps<{ route: RouteLocationNormalizedLoaded }>()
provide(PAGE_PREVIEW, true)
</script>

<template>
  <div aria-hidden="true" inert>
    <div class="page-host">
      <header class="brand-bar"><AppLogo /></header>
      <RouterView :route="route" />
    </div>
  </div>
</template>
