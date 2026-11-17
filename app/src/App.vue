<script setup lang="ts">
import type { IconName } from './ui/icons'
import { useTranslation } from 'i18next-vue'
import { computed, watch } from 'vue'
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'
import { type Area, can, PRESETS } from './core/access'
import { pickLanguage } from './core/locale'
import { db } from './db/db'
import { FarmRepo } from './db/repo'
import { chosenLanguage, dateFormatPref, deviceLanguage, setLanguage } from './i18n'
import AccountScreen from './screens/AccountScreen.vue'
import NewPasswordScreen from './screens/NewPasswordScreen.vue'
import SetupWizard from './screens/SetupWizard.vue'
import { accessTo, account, retryLoad, signOut } from './sync/account'
import AppIcon from './ui/AppIcon.vue'
import AppToast from './ui/AppToast.vue'
import { type FarmData, provideFarm } from './ui/farm'
import { useLiveQuery } from './ui/live'

const { t: translate } = useTranslation()
const route = useRoute()
const router = useRouter()

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

const farm = computed<FarmData>(() => ({
  repo: repo.value!,
  ...data.value!,
  access: accessTo(farmId.value) ?? { role: 'user', permissions: PRESETS.worker },
}))
provideFarm(farm)

// The grove's language is only the starting point; a choice made on this phone wins.
watch(
  () => data.value?.settings.language,
  (lng) => setLanguage(pickLanguage(chosenLanguage(), lng, deviceLanguage())),
  { immediate: true },
)

watch(
  () => data.value?.settings.dateFormat,
  (format) => (dateFormatPref.value = format ?? 'auto'),
  { immediate: true },
)

const state = computed(() => {
  if (account.mode === 'checking') {
    return 'loading'
  }
  // With a server, nothing is shown until someone signs in…
  if (account.mode === 'server' && !account.user) {
    return 'account'
  }
  // A first sign-in with a temporary password: they choose their own first.
  if (account.mode === 'server' && account.user?.mustChangePassword) {
    return 'new-password'
  }
  // …and their data has arrived (so the first-time setup is never shown by mistake).
  if (account.mode === 'server' && account.loading !== 'idle') {
    return 'loading-data'
  }
  // Signed in, but in no grove and not allowed to start one.
  if (account.mode === 'server' && !farmId.value && !account.user?.mayCreateGrove) {
    return 'no-access'
  }
  if (farmId.value === undefined || (farmId.value && data.value === undefined)) {
    return 'loading'
  }
  if (!farmId.value || !data.value || !repo.value || !data.value.settings.setupDone) {
    return 'setup'
  }

  return 'ready'
})

/** Bottom bar: only the pages this person may use (Settings always, for their account). */
interface NavItem {
  to: string
  icon: IconName
  label: string
  exact?: boolean
  /** Needed to see the page in the bar (none: always there). */
  area?: Area
  level?: 'see' | 'change'
}
const NAV: NavItem[] = [
  { to: '/', icon: 'today', label: 'nav.today', exact: true, area: 'work', level: 'change' },
  { to: '/journal', icon: 'history', label: 'nav.journal', area: 'work', level: 'see' },
  { to: '/oil', icon: 'oil', label: 'nav.oil', area: 'oil', level: 'see' },
  { to: '/money', icon: 'money', label: 'nav.money', area: 'money', level: 'see' },
  { to: '/reports', icon: 'reports', label: 'nav.reports', area: 'reports', level: 'see' },
  { to: '/settings', icon: 'settings', label: 'nav.settings' },
]
const nav = computed(() =>
  NAV.filter((item) => !item.area || can(farm.value.access, item.area, item.level)).map(
    (item) => ({ ...item, label: translate(item.label) }),
  ),
)

/** Pages that need an area: opening one without access goes to the first page allowed. */
const PAGE_ACCESS: { prefix: string; area: Area; level: 'see' | 'change' }[] = [
  { prefix: '/entry/', area: 'work', level: 'change' },
  { prefix: '/journal', area: 'work', level: 'see' },
  { prefix: '/oil/', area: 'oil', level: 'change' },
  { prefix: '/oil', area: 'oil', level: 'see' },
  { prefix: '/money/', area: 'money', level: 'change' },
  { prefix: '/money', area: 'money', level: 'see' },
  { prefix: '/reports', area: 'reports', level: 'see' },
]
watch(
  () => [route.path, state.value, farm.value.access] as const,
  ([path, current]) => {
    if (current !== 'ready') {
      return
    }
    const rule =
      path === '/'
        ? { area: 'work' as Area, level: 'change' as const }
        : PAGE_ACCESS.find((page) => path.startsWith(page.prefix))
    if (rule && !can(farm.value.access, rule.area, rule.level)) {
      void router.replace(nav.value[0]?.to ?? '/settings')
    }
  },
  { immediate: true },
)
</script>

<template>
  <div v-if="state === 'loading'" class="splash">{{ $t('common.loading') }}</div>
  <AccountScreen v-else-if="state === 'account'" />
  <NewPasswordScreen v-else-if="state === 'new-password'" />
  <main v-else-if="state === 'no-access'" class="setup loading-data">
    <h1>{{ $t('account.noGroveTitle') }}</h1>
    <p class="muted">{{ $t('account.noGroveHelp') }}</p>
    <button type="button" class="btn ghost" @click="signOut()">
      {{ $t('account.signOut') }}
    </button>
  </main>
  <main v-else-if="state === 'loading-data'" class="setup loading-data">
    <template v-if="account.loading === 'loading'">
      <div class="spinner" aria-hidden="true"></div>
      <h1>{{ $t('account.loadingTitle') }}</h1>
      <p class="muted">{{ $t('account.loadingHelp') }}</p>
    </template>
    <template v-else>
      <h1>{{ $t('account.loadFailedTitle') }}</h1>
      <p class="muted">{{ $t('account.loadFailedHelp') }}</p>
      <button type="button" class="btn primary big block" @click="retryLoad()">
        {{ $t('account.tryAgain') }}
      </button>
    </template>
  </main>
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
          <AppIcon :name="item.icon" :size="24" />
        </span>
        <span>{{ item.label }}</span>
      </RouterLink>
    </nav>
    <AppToast />
  </div>
</template>
