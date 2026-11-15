<script setup lang="ts">
defineProps<{ title: string }>();
const emit = defineEmits<{ close: [] }>();
</script>

<template>
  <div class="modal-backdrop" @click="emit('close')">
    <div class="modal" role="dialog" :aria-label="title" @click.stop>
      <h2>{{ title }}</h2>
      <slot />
    </div>
  </div>
</template>
