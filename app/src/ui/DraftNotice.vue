<script setup lang="ts">
import { useTranslation } from 'i18next-vue'
import { computed } from 'vue'
import { formatLocale } from '../i18n'

/** Says the form was filled from an unsaved draft, with a way to start over. */
const props = defineProps<{ savedAt: number }>()
const emit = defineEmits<{ discard: [] }>()
const { t: translate } = useTranslation()

const when = computed(() =>
  new Intl.DateTimeFormat(formatLocale.value, {
    weekday: 'long',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(props.savedAt),
)
</script>

<template>
  <div class="draft-notice" role="status">
    <span>{{ translate('draft.restored', { when }) }}</span>
    <button type="button" class="btn ghost small" @click="emit('discard')">
      {{ $t('draft.discard') }}
    </button>
  </div>
</template>
