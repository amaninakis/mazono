<script setup lang="ts">
import { useTranslation } from 'i18next-vue'
import { computed, watch } from 'vue'
import { RouterLink, RouterView, useRoute } from 'vue-router'
import { db } from './db/db'
import { FarmRepo } from './db/repo'
import { dateFormatPref, setLanguage } from './i18n'
import SetupWizard from './screens/SetupWizard.vue'
import AppToast from './ui/AppToast.vue'
import { type FarmData, provideFarm } from './ui/farm'
import { useLiveQuery } from './ui/live'
import OilDrop from './ui/OilDrop.vue'

const { t: translate } = useTranslation()
const route = useRoute()

function notDeleted<T extends { deletedAt?: number }>(rows: T[]) {
  return rows.filter((row) => !row.deletedAt)
}

const farmId = useLiveQuery(async () => (await db.meta.get('currentFarmId'))?.value ?? '')

const data = useLiveQuery(
  async () => {
    const id = farmId.value
    if (!id) {
      return null
    }
    const [
      farm,
      settings,
      fields,
      units,
      taskTypes,
      entries,
      mills,
      chargeTypes,
      locations,
      extractions,
      stockMovements,
      categories,
      transactions,
    ] = await Promise.all([
      db.farms.get(id),
      db.settings.get(id),
      db.fields.where('farmId').equals(id).toArray(),
      db.units.where('farmId').equals(id).toArray(),
      db.taskTypes.where('farmId').equals(id).toArray(),
      db.entries.where('farmId').equals(id).toArray(),
      db.mills.where('farmId').equals(id).toArray(),
      db.chargeTypes.where('farmId').equals(id).toArray(),
      db.locations.where('farmId').equals(id).toArray(),
      db.extractions.where('farmId').equals(id).toArray(),
      db.stockMovements.where('farmId').equals(id).toArray(),
      db.categories.where('farmId').equals(id).toArray(),
      db.transactions.where('farmId').equals(id).toArray(),
    ])
    if (!farm || !settings) {
      return null
    }

    return {
      farmName: farm.name,
      settings,
      fields: notDeleted(fields),
      units: notDeleted(units),
      taskTypes: notDeleted(taskTypes),
      entries: notDeleted(entries),
      mills: notDeleted(mills),
      chargeTypes: notDeleted(chargeTypes),
      locations: notDeleted(locations),
      extractions: notDeleted(extractions),
      stockMovements: notDeleted(stockMovements),
      categories: notDeleted(categories),
      transactions: notDeleted(transactions),
    }
  },
  () => farmId.value,
)

const repo = computed(() => (farmId.value ? new FarmRepo(farmId.value) : null))

const farm = computed<FarmData>(() => ({ repo: repo.value!, ...data.value! }))
provideFarm(farm)

watch(
  () => data.value?.settings.language,
  (lng) => lng && setLanguage(lng),
  { immediate: true },
)

watch(
  () => data.value?.settings.dateFormat,
  (format) => (dateFormatPref.value = format ?? 'auto'),
  { immediate: true },
)

const state = computed(() => {
  if (farmId.value === undefined || (farmId.value && data.value === undefined)) {
    return 'loading'
  }
  if (!farmId.value || !data.value || !repo.value || !data.value.settings.setupDone) {
    return 'setup'
  }

  return 'ready'
})

const nav = computed(() => [
  { to: '/', icon: '✚', label: translate('nav.today'), exact: true },
  { to: '/journal', icon: '📅', label: translate('nav.journal') },
  { to: '/oil', icon: 'oil', label: translate('nav.oil') },
  { to: '/money', icon: '€', label: translate('nav.money') },
  { to: '/reports', icon: '📊', label: translate('nav.reports') },
  { to: '/settings', icon: '⚙️', label: translate('nav.settings') },
])
</script>

<template>
  <div v-if="state === 'loading'" class="splash">{{ $t('common.loading') }}</div>
  <SetupWizard v-else-if="state === 'setup'" />
  <div v-else class="shell">
    <RouterView :key="route.path" />
    <nav class="bottom-nav">
      <RouterLink
        v-for="item in nav"
        :key="item.to"
        :to="item.to"
        :class="{ active: item.exact ? route.path === '/' : route.path.startsWith(item.to) }"
      >
        <span class="nav-icon" aria-hidden="true">
          <OilDrop v-if="item.icon === 'oil'" />
          <template v-else>{{ item.icon }}</template>
        </span>
        <span>{{ item.label }}</span>
      </RouterLink>
    </nav>
    <AppToast />
  </div>
</template>
