<script setup lang="ts">
import { closeToast, currentToast } from './toast';

function act() {
  currentToast.value?.action?.run();
  closeToast();
}
</script>

<template>
  <div v-if="currentToast" :key="currentToast.id" class="toast" role="status">
    <div class="toast-body">
      <strong>{{ currentToast.title }}</strong>
      <div v-for="line in currentToast.lines" :key="line">{{ line }}</div>
    </div>
    <button v-if="currentToast.action" type="button" class="toast-action" @click="act">
      {{ currentToast.action.label }}
    </button>
  </div>
</template>
