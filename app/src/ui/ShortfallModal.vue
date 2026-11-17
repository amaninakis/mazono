<script setup lang="ts">
import type { Shortfall } from '../core/oil'
import { useTranslation } from 'i18next-vue'
import { seasonLabel } from '../core/dates'
import { formatNumber } from '../core/format'
import { formatLocale } from '../i18n'
import AppModal from './AppModal.vue'
import { locationName, useFarm } from './farm'

/**
 * A change would leave less oil somewhere than was already sold or moved out. Says where and
 * how much, and lets the person go back or go ahead.
 */
defineProps<{ missing: Shortfall[]; confirmLabel: string }>()
const emit = defineEmits<{ confirm: []; close: [] }>()
const { t: translate } = useTranslation()
const farm = useFarm()

function line(short: Shortfall) {
  const location = farm.value.locations.find((entry) => entry.id === short.locationId)

  return translate('shortfall.line', {
    place: location ? locationName(translate, location) : '?',
    season: seasonLabel(short.vintage),
    kg: formatNumber(short.kg, formatLocale.value, 3),
    count: short.kg,
  })
}
</script>

<template>
  <AppModal :title="$t('shortfall.title')" @close="emit('close')">
    <p>{{ $t('shortfall.help') }}</p>
    <ul class="shortfall-list">
      <li v-for="short in missing" :key="`${short.vintage}-${short.locationId}`">
        {{ line(short) }}
      </li>
    </ul>
    <p class="hint">{{ $t('shortfall.fix') }}</p>
    <div class="actions">
      <button type="button" class="btn ghost" @click="emit('close')">
        {{ $t('common.cancel') }}
      </button>
      <button type="button" class="btn primary" @click="emit('confirm')">
        {{ confirmLabel }}
      </button>
    </div>
  </AppModal>
</template>
