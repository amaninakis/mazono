<script setup lang="ts">
defineProps<{ label: string; help?: string }>()
const model = defineModel<boolean>({ required: true })
</script>

<template>
  <label class="toggle">
    <span class="toggle-text">
      <span>{{ label }}</span>
      <small v-if="help">{{ help }}</small>
    </span>
    <input v-model="model" type="checkbox" />
    <span class="toggle-track" aria-hidden="true"></span>
  </label>
</template>
