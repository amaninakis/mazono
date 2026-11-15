<script setup lang="ts">
defineProps<{ textKey: string }>()
</script>

<template>
  <main class="page">
    <div class="empty">
      <h1>{{ $t('soon.title') }}</h1>
      <p class="muted">{{ $t(textKey) }}</p>
    </div>
  </main>
</template>
