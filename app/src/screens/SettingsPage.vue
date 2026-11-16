<script setup lang="ts">
import type { DateFormat, InputKind, Language, TaskType } from '../core/types'
import { useTranslation } from 'i18next-vue'
import { computed, ref } from 'vue'
import { TASK_COLORS, TASK_ICONS } from '../core/defaults'
import { formatNumber } from '../core/format'
import { formatLocaleFor } from '../core/locale'
import { unitWeights } from '../core/oil'
import { parseDecimal } from '../core/progress'
import { db } from '../db/db'
import { importFarm } from '../db/repo'
import { formatLocale, LANGUAGES, locale, setLanguage } from '../i18n'
import AppModal from '../ui/AppModal.vue'
import { categoryName, chargeName, locationName, taskName, useFarm } from '../ui/farm'
import { showToast } from '../ui/toast'
import ToggleSwitch from '../ui/ToggleSwitch.vue'

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

function changeLang(language: Language) {
  setLanguage(language)
  void repo.value.updateSettings({ language })
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
  link.download = `harvestlog-${new Date().toISOString().slice(0, 10)}.json`
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
</script>

<template>
  <main class="page settings">
    <header class="page-head">
      <h1>{{ $t('settings.title') }}</h1>
    </header>

    <section class="card">
      <h2>{{ $t('settings.general') }}</h2>
      <label class="label" for="s-farm">{{ $t('settings.farmName') }}</label>
      <input
        id="s-farm"
        class="input"
        :value="farm.farmName"
        @blur="(e) => val(e).trim() && db.farms.update(repo.farmId, { name: val(e).trim() })"
      />
      <span class="label">{{ $t('settings.language') }}</span>
      <div class="chips">
        <button
          v-for="l in LANGUAGES"
          :key="l.code"
          type="button"
          class="chip"
          :class="[{ selected: settings.language === l.code }]"
          @click="changeLang(l.code)"
        >
          {{ l.label }}
        </button>
      </div>
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
        <option v-for="m in months" :key="m.number" :value="m.number">{{ m.long }}</option>
      </select>
      <p class="muted small">{{ $t('settings.seasonStartHelp') }}</p>
    </section>

    <section class="card">
      <h2>{{ $t('settings.modules') }}</h2>
      <ToggleSwitch
        :model-value="settings.labourEnabled"
        :label="$t('settings.labour')"
        :help="$t('settings.labourHelp')"
        @update:model-value="(v) => repo.updateSettings({ labourEnabled: v })"
      />
    </section>

    <div class="row-end">
      <ToggleSwitch v-model="showArchived" :label="$t('settings.showArchived')" />
    </div>

    <section id="fields" class="card">
      <h2>{{ $t('settings.fields') }}</h2>
      <ul class="list">
        <li
          v-for="f in fieldList"
          :key="f.id"
          class="field-row"
          :class="[{ off: f.archived }]"
        >
          <input
            class="input"
            :aria-label="$t('common.name')"
            :value="f.name"
            @blur="
              (e) => val(e).trim() && repo.update('fields', f.id, { name: val(e).trim() })
            "
          />
          <input
            class="input small"
            inputmode="numeric"
            :aria-label="$t('common.trees')"
            :placeholder="$t('common.trees')"
            :value="f.trees || ''"
            @blur="
              (e) =>
                repo.update('fields', f.id, { trees: Math.round(parseDecimal(val(e)) ?? 0) })
            "
          />
          <button
            type="button"
            class="btn ghost small"
            @click="repo.update('fields', f.id, { archived: !f.archived })"
          >
            {{ f.archived ? $t('common.unarchive') : $t('common.archive') }}
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

    <section class="card">
      <h2>{{ $t('settings.units') }}</h2>
      <p class="muted small">{{ $t('setup.unitsHelp') }}</p>
      <ul class="list">
        <li v-for="u in unitList" :key="u.id" class="unit-row" :class="[{ off: u.archived }]">
          <input
            class="input"
            :aria-label="$t('common.name')"
            :value="u.name"
            @blur="(e) => val(e).trim() && repo.update('units', u.id, { name: val(e).trim() })"
          />
          <input
            class="input"
            :aria-label="$t('setup.pluralName')"
            :placeholder="$t('setup.pluralName')"
            :value="u.pluralName ?? ''"
            @blur="
              (e) => repo.update('units', u.id, { pluralName: val(e).trim() || undefined })
            "
          />
          <input
            class="input small"
            inputmode="decimal"
            :placeholder="$t('setup.approxKg')"
            :aria-label="$t('setup.approxKg')"
            :value="u.approxKg ?? ''"
            @blur="
              (e) =>
                repo.update('units', u.id, { approxKg: parseDecimal(val(e)) ?? undefined })
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
            class="btn ghost small"
            :disabled="u.isDefault && !u.archived"
            @click="repo.update('units', u.id, { archived: !u.archived })"
          >
            {{ u.archived ? $t('common.unarchive') : $t('common.archive') }}
          </button>
        </li>
      </ul>
      <div class="inline-add">
        <input
          v-model="newUnit"
          class="input"
          :placeholder="$t('setup.unitName')"
          @keydown.enter="addUnit"
        />
        <button type="button" class="btn small" @click="addUnit">
          {{ $t('common.add') }}
        </button>
      </div>
    </section>

    <section id="oil" class="card">
      <h2>{{ $t('settings.oilSection') }}</h2>

      <span class="label">{{ $t('settings.mills') }}</span>
      <ul class="list">
        <li v-for="m in millList" :key="m.id" class="field-row" :class="[{ off: m.archived }]">
          <input
            class="input"
            :aria-label="$t('common.name')"
            :value="m.name"
            @blur="(e) => val(e).trim() && repo.update('mills', m.id, { name: val(e).trim() })"
          />
          <button
            type="button"
            class="btn ghost small"
            @click="repo.update('mills', m.id, { archived: !m.archived })"
          >
            {{ m.archived ? $t('common.unarchive') : $t('common.archive') }}
          </button>
        </li>
      </ul>
      <div class="inline-add">
        <input
          v-model="newMill"
          class="input"
          :placeholder="$t('extraction.newMillName')"
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
          <input
            :key="`${c.id}-${locale}`"
            class="input"
            :aria-label="$t('common.name')"
            :value="chargeName($t, c)"
            @blur="(e) => renameBuiltin('chargeTypes', c.id, chargeName($t, c), e)"
          />
          <input
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
            class="btn ghost small"
            @click="repo.update('chargeTypes', c.id, { archived: !c.archived })"
          >
            {{ c.archived ? $t('common.unarchive') : $t('common.archive') }}
          </button>
        </li>
      </ul>
      <div class="inline-add">
        <input
          v-model="newChargeName"
          class="input"
          :placeholder="$t('extraction.newChargeName')"
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
          <input
            :key="`${l.id}-${locale}`"
            class="input"
            :aria-label="$t('common.name')"
            :value="locationName($t, l)"
            @blur="(e) => renameBuiltin('locations', l.id, locationName($t, l), e)"
          />
          <button
            type="button"
            class="btn ghost small"
            @click="repo.update('locations', l.id, { archived: !l.archived })"
          >
            {{ l.archived ? $t('common.unarchive') : $t('common.archive') }}
          </button>
        </li>
      </ul>
      <div class="inline-add">
        <input
          v-model="newLocation"
          class="input"
          :placeholder="$t('settings.addLocation')"
          @keydown.enter="addLocation"
        />
        <button type="button" class="btn small" @click="addLocation">
          {{ $t('common.add') }}
        </button>
      </div>
    </section>

    <section id="money" class="card">
      <h2>{{ $t('settings.finance') }}</h2>
      <label class="label" for="s-tax">{{ $t('settings.taxPercent') }}</label>
      <input
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
            <input
              :key="`${c.id}-${locale}`"
              class="input"
              :aria-label="$t('common.name')"
              :value="categoryName($t, c)"
              @blur="(e) => renameBuiltin('categories', c.id, categoryName($t, c), e)"
            />
            <button
              type="button"
              class="btn ghost small"
              @click="repo.update('categories', c.id, { archived: !c.archived })"
            >
              {{ c.archived ? $t('common.unarchive') : $t('common.archive') }}
            </button>
          </li>
        </ul>
        <div class="inline-add">
          <input
            v-model="newCategory[kind]"
            class="input"
            :placeholder="$t('settings.addCategory')"
            @keydown.enter="addCategory(kind)"
          />
          <button type="button" class="btn small" @click="addCategory(kind)">
            {{ $t('common.add') }}
          </button>
        </div>
      </template>
    </section>

    <section class="card">
      <h2>{{ $t('settings.taskTypes') }}</h2>
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
            <input
              :key="`${x.id}-${locale}`"
              class="input"
              :aria-label="$t('common.name')"
              :value="taskName($t, x)"
              @blur="(e) => renameType(x, e)"
            />
            <button
              type="button"
              class="btn ghost small"
              @click="repo.update('taskTypes', x.id, { archived: !x.archived })"
            >
              {{ x.archived ? $t('common.unarchive') : $t('common.archive') }}
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
              :style="{ background: c }"
              @click="repo.update('taskTypes', x.id, { color: c })"
            ></button>
          </div>
          <select
            v-if="!x.builtin"
            class="input select"
            :value="x.inputKind"
            @change="(e) => repo.update('taskTypes', x.id, { inputKind: val(e) as InputKind })"
          >
            <option v-for="k in kinds" :key="k" :value="k">{{ $t(`inputKind.${k}`) }}</option>
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

    <section class="card">
      <h2>{{ $t('settings.data') }}</h2>
      <p class="muted small">{{ $t('settings.storageNote') }}</p>
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

    <p class="muted small center">{{ $t('settings.version', { version }) }}</p>

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
