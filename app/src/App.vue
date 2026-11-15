<script setup lang="ts">
import { useTranslation } from 'i18next-vue';
import { computed, watch } from 'vue';
import { useRoute } from 'vue-router';
import { db } from './db/db';
import { FarmRepo } from './db/repo';
import { setLanguage } from './i18n';
import Setup from './screens/Setup.vue';
import { provideFarm, type FarmData } from './ui/farm';
import { useLiveQuery } from './ui/live';
import Toast from './ui/Toast.vue';

const { t } = useTranslation();
const route = useRoute();

const notDeleted = <T extends { deletedAt?: number }>(rows: T[]) => rows.filter((r) => !r.deletedAt);

const farmId = useLiveQuery(async () => (await db.meta.get('currentFarmId'))?.value ?? '');

const data = useLiveQuery(
  async () => {
    const id = farmId.value;
    if (!id) return null;
    const [farm, settings, fields, units, taskTypes, entries, mills, chargeTypes, locations, extractions, stockMovements] =
      await Promise.all([
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
      ]);
    if (!farm || !settings) return null;
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
    };
  },
  () => farmId.value,
);

const repo = computed(() => (farmId.value ? new FarmRepo(farmId.value) : null));

const farm = computed<FarmData>(() => ({ repo: repo.value!, ...data.value! }));
provideFarm(farm);

watch(
  () => data.value?.settings.language,
  (lng) => lng && setLanguage(lng),
  { immediate: true },
);

const state = computed(() => {
  if (farmId.value === undefined || (farmId.value && data.value === undefined)) return 'loading';
  if (!farmId.value || !data.value || !repo.value || !data.value.settings.setupDone) return 'setup';
  return 'ready';
});

const nav = computed(() => [
  { to: '/', icon: '✚', label: t('nav.today'), exact: true },
  { to: '/journal', icon: '📅', label: t('nav.journal') },
  { to: '/oil', icon: '💧', label: t('nav.oil') },
  { to: '/money', icon: '€', label: t('nav.money') },
  { to: '/more', icon: '☰', label: t('nav.more') },
]);
</script>

<template>
  <div v-if="state === 'loading'" class="splash">{{ t('common.loading') }}</div>
  <Setup v-else-if="state === 'setup'" />
  <div v-else class="shell">
    <RouterView :key="route.path" />
    <nav class="bottom-nav">
      <RouterLink
        v-for="item in nav"
        :key="item.to"
        :to="item.to"
        :class="{ active: item.exact ? route.path === '/' : route.path.startsWith(item.to) }"
      >
        <span class="nav-icon" aria-hidden="true">{{ item.icon }}</span>
        <span>{{ item.label }}</span>
      </RouterLink>
    </nav>
    <Toast />
  </div>
</template>
