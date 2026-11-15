<script setup lang="ts">
import { RouterLink } from 'vue-router'
</script>

<template>
  <main class="page">
    <ul class="menu">
      <li>
        <RouterLink to="/reports">📊 {{ $t('more.reports') }}</RouterLink>
      </li>
      <li>
        <RouterLink to="/settings">⚙️ {{ $t('more.settings') }}</RouterLink>
      </li>
    </ul>
  </main>
</template>
