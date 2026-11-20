<script setup lang="ts">
import type { DateFormat, InputKind, Language, TaskType } from '../core/types'
import type { IconName } from '../ui/icons'
import { useTranslation } from 'i18next-vue'
import { computed, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { TASK_COLORS, TASK_ICONS } from '../core/defaults'
import { formatNumber } from '../core/format'
import { formatLocaleFor } from '../core/locale'
import { unitWeights } from '../core/oil'
import { parseDecimal } from '../core/progress'
import { db } from '../db/db'
import { importFarm } from '../db/repo'
import { chooseLanguage, formatLocale, LANGUAGES, locale } from '../i18n'
import { account } from '../sync/account'
import AccountCard from '../ui/AccountCard.vue'
import AppIcon from '../ui/AppIcon.vue'
import AppLogo from '../ui/AppLogo.vue'
import AppModal from '../ui/AppModal.vue'
import { canDo, categoryName, chargeName, locationName, taskName, useFarm } from '../ui/farm'
import ServerAccountsCard from '../ui/ServerAccountsCard.vue'
import SettingInput from '../ui/SettingInput.vue'
import { showToast } from '../ui/toast'
import ToggleSwitch from '../ui/ToggleSwitch.vue'
import UsersCard from '../ui/UsersCard.vue'

const { t: translate } = useTranslation()
const farm = useFarm()
const repo = computed(() => farm.value.repo)
const settings = computed(() => farm.value.settings)
const showArchived = ref(false)
const newField = ref({ name: '', trees: '' })
const newUnit = ref('')
const kinds: InputKind[] = ['harvest', 'trees', 'quantity', 'done']
const version = APP_VERSION

const months = computed(() =>
  Array.from({ length: 12 }, (_, i) => ({
    number: i + 1,
    short: new Intl.DateTimeFormat(formatLocale.value, { month: 'short' }).format(
      new Date(2024, i, 1),
    ),
    long: new Intl.DateTimeFormat(formatLocale.value, { month: 'long' }).format(
      new Date(2024, i, 1),
    ),
  })),
)

/** Example "15/11/2026 · 1.234,5" for each date and number style. */
const formatOptions = computed(() =>
  (['auto', 'GR', 'GB', 'US'] as DateFormat[]).map((dateFormat) => {
    const loc =
      dateFormat === 'auto'
        ? formatLocaleFor(
            locale.value as Language,
            'auto',
            navigator.languages ?? [navigator.language],
            new Intl.DateTimeFormat().resolvedOptions().timeZone,
          )
        : formatLocaleFor(locale.value as Language, dateFormat, [])
    const example = `${new Intl.DateTimeFormat(loc, { day: 'numeric', month: 'numeric', year: 'numeric' }).format(new Date(2026, 10, 15))} · ${new Intl.NumberFormat(loc).format(1234.5)}`

    return { dateFormat, example }
  }),
)

function visible<T extends { archived: boolean }>(rows: T[]) {
  return rows.filter((row) => showArchived.value || !row.archived)
}
const fieldList = computed(() =>
  visible(farm.value.fields).sort((left, right) => left.order - right.order),
)
const unitList = computed(() => visible(farm.value.units))
const typeList = computed(() =>
  visible(farm.value.taskTypes).sort((left, right) => left.order - right.order),
)
const millList = computed(() => visible(farm.value.mills))
const chargeList = computed(() =>
  visible(farm.value.chargeTypes).sort((left, right) => left.order - right.order),
)
const locationList = computed(() =>
  visible(farm.value.locations).sort((left, right) => left.order - right.order),
)
const weights = computed(() => unitWeights(farm.value.units, farm.value.extractions))
const newMill = ref('')
const newCategory = ref<Record<'expense' | 'income', string>>({ expense: '', income: '' })
function categoryList(kind: 'expense' | 'income') {
  return visible(farm.value.categories.filter((category) => category.kind === kind)).sort(
    (left, right) => left.order - right.order,
  )
}

async function addCategory(kind: 'expense' | 'income') {
  const name = newCategory.value[kind].trim()
  if (!name) {
    return
  }
  await repo.value.put('categories', {
    kind,
    name,
    archived: false,
    order: farm.value.categories.length,
  })
  newCategory.value[kind] = ''
}
const newChargeName = ref('')
const newLocation = ref('')

async function addMill() {
  if (!newMill.value.trim()) {
    return
  }
  await repo.value.put('mills', { name: newMill.value.trim(), archived: false })
  newMill.value = ''
}

async function addChargeType() {
  if (!newChargeName.value.trim()) {
    return
  }
  await repo.value.put('chargeTypes', {
    name: newChargeName.value.trim(),
    archived: false,
    order: farm.value.chargeTypes.length,
  })
  newChargeName.value = ''
}

async function addLocation() {
  if (!newLocation.value.trim()) {
    return
  }
  await repo.value.put('locations', {
    name: newLocation.value.trim(),
    archived: false,
    order: farm.value.locations.length,
  })
  newLocation.value = ''
}

function renameBuiltin(
  table: 'chargeTypes' | 'locations' | 'categories',
  id: string,
  current: string,
  event: Event,
) {
  const value = val(event).trim()
  if (value && value !== current) {
    void repo.value.update(table, id, { name: value })
  }
}

function val(event: Event) {
  return (event.target as HTMLInputElement).value
}

async function addField() {
  if (!newField.value.name.trim()) {
    return
  }
  await repo.value.addField({
    name: newField.value.name.trim(),
    trees: Math.round(parseDecimal(newField.value.trees) ?? 0),
    archived: false,
    order: farm.value.fields.length,
  })
  newField.value = { name: '', trees: '' }
}

async function addUnit() {
  if (!newUnit.value.trim()) {
    return
  }
  await repo.value.addUnit({
    name: newUnit.value.trim(),
    isDefault: farm.value.units.length === 0,
    archived: false,
  })
  newUnit.value = ''
}

async function addTaskType() {
  const value = farm.value.taskTypes.length
  await repo.value.addTaskType({
    name: translate('task.new'),
    inputKind: 'trees',
    color: TASK_COLORS[value % TASK_COLORS.length],
    icon: TASK_ICONS[(value + 4) % TASK_ICONS.length],
    activeMonths: [],
    archived: false,
    order: value,
  })
}

function renameType(x: TaskType, event: Event) {
  const value = val(event).trim()
  if (value && value !== taskName(translate, x)) {
    void repo.value.update('taskTypes', x.id, { name: value })
  }
}

function toggleMonth(x: TaskType, month: number) {
  const on = x.activeMonths.includes(month)
  void repo.value.update('taskTypes', x.id, {
    activeMonths: on
      ? x.activeMonths.filter((value) => value !== month)
      : [...x.activeMonths, month].sort((left, right) => left - right),
  })
}

async function exportData() {
  const data = await repo.value.exportAll()
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = `mazono-${new Date().toISOString().slice(0, 10)}.json`
  link.click()
  URL.revokeObjectURL(link.href)
}

/** Backup file waiting for the user to confirm the restore. */
const pendingImport = ref<File | null>(null)

function importData(event: Event) {
  const input = event.target as HTMLInputElement
  pendingImport.value = input.files?.[0] ?? null
  input.value = ''
}

async function confirmImport() {
  const file = pendingImport.value
  pendingImport.value = null
  if (!file) {
    return
  }

  try {
    await importFarm(JSON.parse(await file.text()))
    showToast({ title: translate('settings.importDone') })
  } catch {
    showToast({ title: translate('settings.importFailed') })
  }
}

const canSeeSettings = computed(() => canDo(farm.value, 'settings'))
const canEditSettings = computed(() => canDo(farm.value, 'settings', 'change'))

function changeLang(language: Language) {
  chooseLanguage(language)
  if (canEditSettings.value) {
    // Also the starting language for phones of this grove that have not chosen one.
    void repo.value.updateSettings({ language })
  }
}

/** Backups and people are for the grove's administrators. */
const isAdmin = computed(() => farm.value.access.role === 'admin')

/* ---------- sections: a short list first, one section per page ---------- */
const route = useRoute()
const router = useRouter()
const section = computed(() => (route.params.section as string | undefined) || undefined)

type SectionKey =
  'account' | 'people' | 'fields' | 'units' | 'oil' | 'money' | 'tasks' | 'general' | 'data'

interface SectionItem {
  key: SectionKey
  icon: IconName
  title: string
  summary: string
}

/** Sections of the grove's own settings (need settings access). */
const GROVE_SECTIONS: SectionKey[] = ['fields', 'units', 'oil', 'money', 'tasks', 'general']

function activeCount(rows: { archived: boolean }[]) {
  return rows.filter((row) => !row.archived).length
}

function count(key: string, value: number) {
  return translate(key, { count: value })
}

const sections = computed<SectionItem[]>(() => {
  const list: SectionItem[] = []
  const server = account.mode === 'server'
  if (server && account.user) {
    list.push({
      key: 'account',
      icon: 'user',
      title: translate('account.title'),
      summary: account.user.username,
    })
  }
  if (server && isAdmin.value) {
    list.push({
      key: 'people',
      icon: 'users',
      title: translate('users.title'),
      summary: translate('settings.summary.people'),
    })
  }
  if (canSeeSettings.value) {
    const fields = farm.value.fields.filter((field) => !field.archived)
    const trees = fields.reduce((sum, field) => sum + (field.trees ?? 0), 0)
    const units = farm.value.units.filter((unit) => !unit.archived).map((unit) => unit.name)
    list.push(
      {
        key: 'fields',
        icon: 'fields',
        title: translate('settings.fields'),
        summary: `${count('settings.summary.fields', fields.length)} · ${count('settings.summary.trees', trees)}`,
      },
      {
        key: 'units',
        icon: 'sack',
        title: translate('settings.units'),
        summary: units.join(', '),
      },
      {
        key: 'oil',
        icon: 'oil',
        title: translate('settings.oilSection'),
        summary: [
          count('settings.summary.mills', activeCount(farm.value.mills)),
          count('settings.summary.charges', activeCount(farm.value.chargeTypes)),
          count('settings.summary.locations', activeCount(farm.value.locations)),
        ].join(' · '),
      },
      {
        key: 'money',
        icon: 'money',
        title: translate('settings.finance'),
        summary: count('settings.summary.categories', activeCount(farm.value.categories)),
      },
      {
        key: 'tasks',
        icon: 'tasks',
        title: translate('settings.taskTypes'),
        summary: farm.value.taskTypes
          .filter((type) => !type.archived)
          .sort((left, right) => left.order - right.order)
          .map((type) => taskName(translate, type))
          .join(', '),
      },
      {
        key: 'general',
        icon: 'settings',
        title: translate('settings.general'),
        summary: farm.value.farmName,
      },
    )
  }
  if (isAdmin.value) {
    list.push({
      key: 'data',
      icon: 'backup',
      title: translate('settings.data'),
      summary: translate(
        server && account.user?.isOwner
          ? 'settings.summary.dataOwner'
          : 'settings.summary.data',
      ),
    })
  }

  return list
})

const current = computed(() => sections.value.find((item) => item.key === section.value))
const isGroveSection = computed(() => GROVE_SECTIONS.includes(section.value as SectionKey))

// A section that is not there (old link, or no access to it): back to the list.
watch(
  [section, current],
  ([key, item]) => {
    if (key && !item) {
      void router.replace('/settings')
    }
  },
  { immediate: true },
)
</script>

<template>
  <main class="page settings" :class="{ 'in-section': section }">
    <header class="page-head">
      <RouterLink v-if="section" to="/settings" class="back-link">
        <AppIcon name="chevronLeft" :size="20" />{{ $t('settings.title') }}
      </RouterLink>
      <h1>{{ current?.title ?? $t('settings.title') }}</h1>
    </header>

    <AccountCard v-if="section === 'account' && account.mode === 'server' && account.user" />
    <UsersCard v-if="section === 'people' && account.mode === 'server' && isAdmin" />

    <section v-if="!section" class="card">
      <h2>{{ $t('settings.language') }}</h2>
      <div class="chips" role="radiogroup" :aria-label="$t('settings.language')">
        <button
          v-for="l in LANGUAGES"
          :key="l.code"
          type="button"
          role="radio"
          class="chip"
          :class="[{ selected: locale === l.code }]"
          :aria-checked="locale === l.code"
          @click="changeLang(l.code)"
        >
          {{ l.label }}
        </button>
      </div>
      <p class="hint">{{ $t('settings.languageHelp') }}</p>
    </section>

    <nav class="settings-nav" :aria-label="$t('settings.sections')">
      <RouterLink
        v-for="item in sections"
        :key="item.key"
        :to="`/settings/${item.key}`"
        class="settings-row"
        :aria-current="section === item.key ? 'page' : undefined"
      >
        <span class="settings-icon"><AppIcon :name="item.icon" :size="20" /></span>
        <span class="settings-text">
          <span class="settings-name">{{ item.title }}</span>
          <small class="muted">{{ item.summary }}</small>
        </span>
        <AppIcon name="chevronRight" :size="20" class="chevron" />
      </RouterLink>
    </nav>

    <!-- The grove's settings: hidden, or shown read-only, for people without access to them. -->
    <fieldset
      v-if="canSeeSettings && isGroveSection"
      class="plain"
      :disabled="!canEditSettings"
    >
      <section v-if="section === 'general'" class="card">
        <label class="label" for="s-farm">{{ $t('settings.farmName') }}</label>
        <SettingInput
          id="s-farm"
          class="input"
          :value="farm.farmName"
          @blur="(e) => val(e).trim() && db.farms.update(repo.farmId, { name: val(e).trim() })"
        />
        <span class="label">{{ $t('settings.yieldFormat') }}</span>
        <div class="chips">
          <button
            v-for="f in ['ratio', 'percent'] as const"
            :key="f"
            type="button"
            class="chip"
            :class="[{ selected: settings.yieldFormat === f }]"
            @click="repo.updateSettings({ yieldFormat: f })"
          >
            {{ $t(f === 'ratio' ? 'settings.yieldRatio' : 'settings.yieldPercent') }}
          </button>
        </div>
        <label class="label" for="s-dateformat">{{ $t('settings.dateFormat') }}</label>
        <select
          id="s-dateformat"
          class="input select"
          :value="settings.dateFormat ?? 'auto'"
          @change="(e) => repo.updateSettings({ dateFormat: val(e) as DateFormat })"
        >
          <option v-for="o in formatOptions" :key="o.dateFormat" :value="o.dateFormat">
            {{ $t(`settings.format_${o.dateFormat}`) }} ({{ o.example }})
          </option>
        </select>
        <label class="label" for="s-season">{{ $t('settings.seasonStart') }}</label>
        <select
          id="s-season"
          class="input select"
          :value="settings.seasonStartMonth"
          @change="(e) => repo.updateSettings({ seasonStartMonth: Number(val(e)) })"
        >
          <option v-for="m in months" :key="m.number" :value="m.number">
            {{ m.long }}
          </option>
        </select>
        <p class="muted small">{{ $t('settings.seasonStartHelp') }}</p>
      </section>

      <section v-if="section === 'general'" class="card">
        <h2>{{ $t('settings.modules') }}</h2>
        <ToggleSwitch
          :model-value="settings.labourEnabled"
          :label="$t('settings.labour')"
          :help="$t('settings.labourHelp')"
          @update:model-value="(v) => repo.updateSettings({ labourEnabled: v })"
        />
      </section>

      <div v-if="section !== 'general'" class="row-end">
        <ToggleSwitch v-model="showArchived" :label="$t('settings.showArchived')" />
      </div>

      <section v-if="section === 'fields'" id="fields" class="card">
        <ul class="list">
          <li
            v-for="f in fieldList"
            :key="f.id"
            class="field-row"
            :class="[{ off: f.archived }]"
          >
            <SettingInput
              class="input"
              :aria-label="$t('common.name')"
              :value="f.name"
              @blur="
                (e) => val(e).trim() && repo.update('fields', f.id, { name: val(e).trim() })
              "
            />
            <SettingInput
              class="input small"
              inputmode="numeric"
              :aria-label="$t('common.trees')"
              :placeholder="$t('common.trees')"
              :value="f.trees || ''"
              @blur="
                (e) =>
                  repo.update('fields', f.id, {
                    trees: Math.round(parseDecimal(val(e)) ?? 0),
                  })
              "
            />
            <button
              type="button"
              class="btn ghost small archive-btn"
              :aria-label="f.archived ? $t('common.unarchive') : $t('common.archive')"
              @click="repo.update('fields', f.id, { archived: !f.archived })"
            >
              <AppIcon :name="f.archived ? 'restore' : 'archive'" :size="20" />
              <span class="wide-only">{{
                f.archived ? $t('common.unarchive') : $t('common.archive')
              }}</span>
            </button>
          </li>
          <li class="field-row">
            <input
              v-model="newField.name"
              class="input"
              :placeholder="$t('setup.fieldName')"
              :aria-label="$t('setup.fieldName')"
              @keydown.enter="addField"
            />
            <input
              v-model="newField.trees"
              class="input small"
              inputmode="numeric"
              :placeholder="$t('common.trees')"
              :aria-label="$t('common.trees')"
              @keydown.enter="addField"
            />
            <button type="button" class="btn small" @click="addField">
              {{ $t('common.add') }}
            </button>
          </li>
        </ul>
      </section>

      <section v-if="section === 'units'" class="card">
        <p class="muted small">{{ $t('setup.unitsHelp') }}</p>
        <ul class="list">
          <li
            v-for="u in unitList"
            :key="u.id"
            class="unit-row"
            :class="[{ off: u.archived }]"
          >
            <SettingInput
              class="input"
              :aria-label="$t('common.name')"
              :value="u.name"
              @blur="
                (e) => val(e).trim() && repo.update('units', u.id, { name: val(e).trim() })
              "
            />
            <SettingInput
              class="input"
              :aria-label="$t('setup.pluralName')"
              :placeholder="$t('setup.pluralName')"
              :value="u.pluralName ?? ''"
              @blur="
                (e) => repo.update('units', u.id, { pluralName: val(e).trim() || undefined })
              "
            />
            <SettingInput
              class="input small"
              inputmode="decimal"
              :placeholder="$t('setup.approxKg')"
              :aria-label="$t('setup.approxKg')"
              :value="u.approxKg ?? ''"
              @blur="
                (e) =>
                  repo.update('units', u.id, {
                    approxKg: parseDecimal(val(e)) ?? undefined,
                  })
              "
            />
            <small v-if="weights[u.id]?.source === 'learned'" class="muted learned">
              {{
                $t('settings.learnedWeight', {
                  kg: formatNumber(weights[u.id].kg, formatLocale, 1),
                  count: weights[u.id].batches,
                })
              }}
            </small>
            <label class="radio">
              <input
                type="radio"
                name="s-default-unit"
                :checked="u.isDefault"
                @change="repo.setDefaultUnit(u.id)"
              />
              <span>{{ $t('setup.default') }}</span>
            </label>
            <button
              type="button"
              class="btn ghost small archive-btn"
              :disabled="u.isDefault && !u.archived"
              :aria-label="u.archived ? $t('common.unarchive') : $t('common.archive')"
              @click="repo.update('units', u.id, { archived: !u.archived })"
            >
              <AppIcon :name="u.archived ? 'restore' : 'archive'" :size="20" />
              <span class="wide-only">{{
                u.archived ? $t('common.unarchive') : $t('common.archive')
              }}</span>
            </button>
          </li>
        </ul>
        <div class="inline-add">
          <input
            v-model="newUnit"
            class="input"
            :placeholder="$t('setup.unitName')"
            :aria-label="$t('setup.unitName')"
            @keydown.enter="addUnit"
          />
          <button type="button" class="btn small" @click="addUnit">
            {{ $t('common.add') }}
          </button>
        </div>
      </section>

      <section v-if="section === 'oil'" id="oil" class="card">
        <span class="label">{{ $t('settings.mills') }}</span>
        <ul class="list">
          <li
            v-for="m in millList"
            :key="m.id"
            class="field-row"
            :class="[{ off: m.archived }]"
          >
            <SettingInput
              class="input"
              :aria-label="$t('common.name')"
              :value="m.name"
              @blur="
                (e) => val(e).trim() && repo.update('mills', m.id, { name: val(e).trim() })
              "
            />
            <button
              type="button"
              class="btn ghost small archive-btn"
              :aria-label="m.archived ? $t('common.unarchive') : $t('common.archive')"
              @click="repo.update('mills', m.id, { archived: !m.archived })"
            >
              <AppIcon :name="m.archived ? 'restore' : 'archive'" :size="20" />
              <span class="wide-only">{{
                m.archived ? $t('common.unarchive') : $t('common.archive')
              }}</span>
            </button>
          </li>
        </ul>
        <div class="inline-add">
          <input
            v-model="newMill"
            class="input"
            :placeholder="$t('extraction.newMillName')"
            :aria-label="$t('extraction.newMillName')"
            @keydown.enter="addMill"
          />
          <button type="button" class="btn small" @click="addMill">
            {{ $t('common.add') }}
          </button>
        </div>

        <span class="label">{{ $t('settings.chargeTypes') }}</span>
        <ul class="list">
          <li
            v-for="c in chargeList"
            :key="c.id"
            class="field-row"
            :class="[{ off: c.archived }]"
          >
            <SettingInput
              :key="`${c.id}-${locale}`"
              class="input"
              :aria-label="$t('common.name')"
              :value="chargeName($t, c)"
              @blur="(e) => renameBuiltin('chargeTypes', c.id, chargeName($t, c), e)"
            />
            <SettingInput
              class="input small"
              inputmode="decimal"
              :aria-label="$t('settings.defaultPercent')"
              :placeholder="$t('settings.defaultPercent')"
              :value="c.defaultPercent ?? ''"
              @blur="
                (e) =>
                  repo.update('chargeTypes', c.id, {
                    defaultPercent: parseDecimal(val(e)) ?? undefined,
                  })
              "
            />
            <span class="muted">%</span>
            <button
              type="button"
              class="btn ghost small archive-btn"
              :aria-label="c.archived ? $t('common.unarchive') : $t('common.archive')"
              @click="repo.update('chargeTypes', c.id, { archived: !c.archived })"
            >
              <AppIcon :name="c.archived ? 'restore' : 'archive'" :size="20" />
              <span class="wide-only">{{
                c.archived ? $t('common.unarchive') : $t('common.archive')
              }}</span>
            </button>
          </li>
        </ul>
        <div class="inline-add">
          <input
            v-model="newChargeName"
            class="input"
            :placeholder="$t('extraction.newChargeName')"
            :aria-label="$t('extraction.newChargeName')"
            @keydown.enter="addChargeType"
          />
          <button type="button" class="btn small" @click="addChargeType">
            {{ $t('common.add') }}
          </button>
        </div>

        <span class="label">{{ $t('settings.locations') }}</span>
        <ul class="list">
          <li
            v-for="l in locationList"
            :key="l.id"
            class="field-row"
            :class="[{ off: l.archived }]"
          >
            <SettingInput
              :key="`${l.id}-${locale}`"
              class="input"
              :aria-label="$t('common.name')"
              :value="locationName($t, l)"
              @blur="(e) => renameBuiltin('locations', l.id, locationName($t, l), e)"
            />
            <button
              type="button"
              class="btn ghost small archive-btn"
              :aria-label="l.archived ? $t('common.unarchive') : $t('common.archive')"
              @click="repo.update('locations', l.id, { archived: !l.archived })"
            >
              <AppIcon :name="l.archived ? 'restore' : 'archive'" :size="20" />
              <span class="wide-only">{{
                l.archived ? $t('common.unarchive') : $t('common.archive')
              }}</span>
            </button>
          </li>
        </ul>
        <div class="inline-add">
          <input
            v-model="newLocation"
            class="input"
            :placeholder="$t('settings.addLocation')"
            :aria-label="$t('settings.addLocation')"
            @keydown.enter="addLocation"
          />
          <button type="button" class="btn small" @click="addLocation">
            {{ $t('common.add') }}
          </button>
        </div>
      </section>

      <section v-if="section === 'money'" id="money" class="card">
        <label class="label" for="s-tax">{{ $t('settings.taxPercent') }}</label>
        <SettingInput
          id="s-tax"
          class="input small"
          inputmode="decimal"
          :value="settings.taxPercent ?? ''"
          placeholder="%"
          @blur="(e) => repo.updateSettings({ taxPercent: parseDecimal(val(e)) ?? undefined })"
        />
        <template v-for="kind in ['expense', 'income'] as const" :key="kind">
          <span class="label">{{
            kind === 'expense'
              ? $t('settings.expenseCategories')
              : $t('settings.incomeCategories')
          }}</span>
          <ul class="list">
            <li
              v-for="c in categoryList(kind)"
              :key="c.id"
              class="field-row"
              :class="[{ off: c.archived }]"
            >
              <SettingInput
                :key="`${c.id}-${locale}`"
                class="input"
                :aria-label="$t('common.name')"
                :value="categoryName($t, c)"
                @blur="(e) => renameBuiltin('categories', c.id, categoryName($t, c), e)"
              />
              <button
                type="button"
                class="btn ghost small archive-btn"
                :aria-label="c.archived ? $t('common.unarchive') : $t('common.archive')"
                @click="repo.update('categories', c.id, { archived: !c.archived })"
              >
                <AppIcon :name="c.archived ? 'restore' : 'archive'" :size="20" />
                <span class="wide-only">{{
                  c.archived ? $t('common.unarchive') : $t('common.archive')
                }}</span>
              </button>
            </li>
          </ul>
          <div class="inline-add">
            <input
              v-model="newCategory[kind]"
              class="input"
              :placeholder="$t('settings.addCategory')"
              :aria-label="$t('settings.addCategory')"
              @keydown.enter="addCategory(kind)"
            />
            <button type="button" class="btn small" @click="addCategory(kind)">
              {{ $t('common.add') }}
            </button>
          </div>
        </template>
      </section>

      <section v-if="section === 'tasks'" class="card">
        <ul class="list task-types">
          <li
            v-for="x in typeList"
            :key="x.id"
            class="tt"
            :class="[{ off: x.archived }]"
            :style="{ '--c': x.color }"
          >
            <div class="tt-head">
              <select
                class="input select icon-select"
                :aria-label="$t('settings.icon')"
                :value="x.icon"
                @change="(e) => repo.update('taskTypes', x.id, { icon: val(e) })"
              >
                <option v-for="i in [...new Set([x.icon, ...TASK_ICONS])]" :key="i">
                  {{ i }}
                </option>
              </select>
              <SettingInput
                :key="`${x.id}-${locale}`"
                class="input"
                :aria-label="$t('common.name')"
                :value="taskName($t, x)"
                @blur="(e) => renameType(x, e)"
              />
              <button
                type="button"
                class="btn ghost small archive-btn"
                :aria-label="x.archived ? $t('common.unarchive') : $t('common.archive')"
                @click="repo.update('taskTypes', x.id, { archived: !x.archived })"
              >
                <AppIcon :name="x.archived ? 'restore' : 'archive'" :size="20" />
                <span class="wide-only">{{
                  x.archived ? $t('common.unarchive') : $t('common.archive')
                }}</span>
              </button>
            </div>
            <div class="swatches" role="radiogroup" :aria-label="$t('settings.color')">
              <button
                v-for="c in TASK_COLORS"
                :key="c"
                type="button"
                role="radio"
                :aria-checked="x.color === c"
                :aria-label="c"
                class="swatch"
                :class="[{ selected: x.color === c }]"
                :style="{ backgroundColor: c }"
                @click="repo.update('taskTypes', x.id, { color: c })"
              ></button>
            </div>
            <select
              v-if="!x.builtin"
              class="input select"
              :value="x.inputKind"
              @change="(e) => repo.update('taskTypes', x.id, { inputKind: val(e) as InputKind })"
            >
              <option v-for="k in kinds" :key="k" :value="k">
                {{ $t(`inputKind.${k}`) }}
              </option>
            </select>
            <span class="label small">{{ $t('settings.activeMonths') }}</span>
            <div class="months">
              <button
                v-for="m in months"
                :key="m.number"
                type="button"
                :aria-pressed="x.activeMonths.includes(m.number)"
                class="month"
                :class="[{ on: x.activeMonths.includes(m.number) }]"
                @click="toggleMonth(x, m.number)"
              >
                {{ m.short }}
              </button>
            </div>
          </li>
        </ul>
        <button type="button" class="btn small" @click="addTaskType">
          + {{ $t('settings.addTaskType') }}
        </button>
      </section>
    </fieldset>

    <section v-if="section === 'data' && isAdmin" class="card">
      <p class="muted small">
        {{
          $t(account.mode === 'server' ? 'settings.storageNoteServer' : 'settings.storageNote')
        }}
      </p>
      <div class="actions wrap">
        <button type="button" class="btn" @click="exportData">
          {{ $t('settings.export') }}
        </button>
        <label class="btn ghost file-btn">
          {{ $t('settings.import') }}
          <input type="file" accept="application/json" @change="importData" />
        </label>
      </div>
    </section>

    <ServerAccountsCard
      v-if="section === 'data' && account.mode === 'server' && account.user?.isOwner"
    />

    <section v-if="!section" class="about" :aria-label="$t('settings.aboutTitle')">
      <AppLogo size="large" />
      <p class="about-line">{{ $t('brand.line') }}</p>
      <p class="muted small">{{ $t('settings.about') }}</p>
      <p class="muted small">{{ $t('settings.version', { version }) }}</p>
    </section>

    <AppModal
      v-if="pendingImport"
      :title="$t('settings.import')"
      @close="pendingImport = null"
    >
      <p>{{ $t('settings.importConfirm') }}</p>
      <div class="actions">
        <button type="button" class="btn ghost" @click="pendingImport = null">
          {{ $t('common.cancel') }}
        </button>
        <button type="button" class="btn primary" @click="confirmImport">
          {{ $t('settings.import') }}
        </button>
      </div>
    </AppModal>
  </main>
</template>
