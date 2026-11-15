<script setup lang="ts">
import { useTranslation } from 'i18next-vue';

defineProps<{ textKey: string }>();
const { t } = useTranslation();
</script>

<template>
  <main class="page">
    <div class="empty">
      <h1>{{ t('soon.title') }}</h1>
      <p class="muted">{{ t(textKey) }}</p>
    </div>
  </main>
</template>
