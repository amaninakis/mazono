<script setup lang="ts">
import { useTranslation } from 'i18next-vue';

const { t } = useTranslation();
</script>

<template>
  <main class="page">
    <ul class="menu">
      <li>
        <RouterLink to="/reports">📊 {{ t('more.reports') }}</RouterLink>
      </li>
      <li>
        <RouterLink to="/settings">⚙️ {{ t('more.settings') }}</RouterLink>
      </li>
    </ul>
  </main>
</template>
