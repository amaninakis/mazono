<script setup lang="ts">
import { RouterLink } from 'vue-router'
import AppIcon from './AppIcon.vue'
import { sheetBackdrop } from './sheet'

/** The × at the top left of a form opened as a sheet: back to the page beneath. */
</script>

<template>
  <RouterLink :to="sheetBackdrop" class="back-link sheet-close">
    <AppIcon name="clear" :size="22" /><span class="back-text">{{ $t('common.close') }}</span>
  </RouterLink>
</template>
