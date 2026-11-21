<script setup lang="ts">
/**
 * The Mazono logo: the icon (an olive leaf in olive oil, on ripe olive) and the wordmark,
 * drawn in brand/ (see docs/BRAND.md). The wordmark's letters follow the phone's theme;
 * `light` keeps them light, for the ripe-olive start-up screen.
 */
withDefaults(defineProps<{ size?: 'small' | 'large'; light?: boolean }>(), {
  size: 'small',
  light: false,
})
</script>

<template>
  <span class="app-logo" :class="size">
    <img class="app-logo-icon" :src="size === 'small' ? '/favicon.svg' : '/icon.svg'" alt="" />
    <img v-if="light" class="app-logo-word" src="/wordmark-light.svg" alt="Mazono" />
    <picture v-else>
      <source srcset="/wordmark-light.svg" media="(prefers-color-scheme: dark)" />
      <img class="app-logo-word" src="/wordmark.svg" alt="Mazono" />
    </picture>
  </span>
</template>
