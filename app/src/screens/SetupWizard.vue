<script setup lang="ts">
import type { Language } from '../core/types'
import { useTranslation } from 'i18next-vue'
import { computed, ref } from 'vue'
import { UNIT_PRESETS } from '../core/defaults'
import { parseDecimal } from '../core/progress'
import { createFarm, importFarm } from '../db/repo'
import { LANGUAGES, setLanguage } from '../i18n'

interface UnitDraft {
  key: string
  name: string
  selected: boolean
  approxKg: string
}
interface FieldDraft {
  name: string
  trees: string
}

const { t: translate, i18next } = useTranslation()
const step = ref(0)
const lang = ref<Language>(i18next.language as Language)
const farmName = ref('')
const units = ref<UnitDraft[]>(
  UNIT_PRESETS.map((preset, i) => ({
    key: preset.key,
    name: '',
    selected: i === 0,
    approxKg: '',
  })),
)
const defaultKey = ref('sack')
const customUnit = ref('')
const fields = ref<FieldDraft[]>([{ name: '', trees: '' }])
const error = ref('')
const busy = ref(false)
/** Offline mode and installing need https (or localhost). */
const insecure = typeof window !== 'undefined' && !window.isSecureContext

function unitLabel(draft: UnitDraft) {
  return draft.name || translate(`unitPreset.${draft.key}`)
}
const selected = computed(() => units.value.filter((draft) => draft.selected))

function chooseLang(language: Language) {
  lang.value = language
  setLanguage(language)
}

function toggleUnit(draft: UnitDraft) {
  draft.selected = !draft.selected
  error.value = ''
}

function addCustomUnit() {
  const name = customUnit.value.trim()
  if (!name) {
    return
  }
  units.value.push({ key: `custom-${Date.now()}`, name, selected: true, approxKg: '' })
  customUnit.value = ''
}

function nextFromUnits() {
  if (!selected.value.length) {
    error.value = translate('setup.unitsRequired')
    return
  }
  if (!selected.value.some((draft) => draft.key === defaultKey.value)) {
    defaultKey.value = selected.value[0].key
  }
  step.value = 2
}

async function finish() {
  busy.value = true
  error.value = ''

  try {
    await saveSetup()
  } catch (caught) {
    console.error(caught)
    error.value = translate('setup.saveFailed')
  } finally {
    busy.value = false
  }
}

async function saveSetup() {
  const repo = await createFarm(
    farmName.value.trim() || translate('setup.farmNamePlaceholder'),
    lang.value,
  )
  const def = selected.value.some((draft) => draft.key === defaultKey.value)
    ? defaultKey.value
    : selected.value[0].key

  for (const draft of selected.value) {
    await repo.addUnit({
      name: unitLabel(draft),
      pluralName: draft.name ? undefined : translate(`unitPresetPlural.${draft.key}`),
      approxKg: parseDecimal(draft.approxKg) ?? undefined,
      isDefault: draft.key === def,
      archived: false,
    })
  }
  let order = 0
  for (const draft of fields.value) {
    if (!draft.name.trim()) {
      continue
    }
    await repo.addField({
      name: draft.name.trim(),
      trees: Math.round(parseDecimal(draft.trees) ?? 0),
      archived: false,
      order: order++,
    })
  }
  await repo.updateSettings({ setupDone: true })
}

async function restore(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) {
    return
  }

  try {
    await importFarm(JSON.parse(await file.text()))
  } catch {
    error.value = translate('settings.importFailed')
  }
}
</script>

<template>
  <main class="setup">
    <div class="setup-progress" aria-hidden="true">
      <span v-for="s in [0, 1, 2]" :key="s" :class="{ on: s <= step }"></span>
    </div>

    <section v-if="step === 0">
      <h1>{{ $t('setup.welcome') }}</h1>
      <p class="tagline">{{ $t('setup.tagline') }}</p>
      <p class="muted">{{ $t('setup.intro') }}</p>
      <label class="label">{{ $t('setup.language') }}</label>
      <div class="chips">
        <button
          v-for="l in LANGUAGES"
          :key="l.code"
          type="button"
          class="chip"
          :class="[{ selected: lang === l.code }]"
          @click="chooseLang(l.code)"
        >
          {{ l.label }}
        </button>
      </div>
      <label class="label" for="farm-name">{{ $t('setup.farmName') }}</label>
      <input
        id="farm-name"
        v-model="farmName"
        class="input"
        :placeholder="$t('setup.farmNamePlaceholder')"
      />
      <div class="actions">
        <label class="btn ghost file-btn">
          {{ $t('setup.restore') }}
          <input type="file" accept="application/json" @change="restore" />
        </label>
        <button type="button" class="btn primary" @click="step = 1">
          {{ $t('common.next') }}
        </button>
      </div>
      <p v-if="error" class="error">{{ error }}</p>
      <p v-if="insecure" class="notice">{{ $t('setup.notSecure') }}</p>
    </section>

    <section v-else-if="step === 1">
      <h1>{{ $t('setup.unitsTitle') }}</h1>
      <p class="muted">{{ $t('setup.unitsHelp') }}</p>
      <ul class="list">
        <li v-for="u in units" :key="u.key" class="unit-row" :class="[{ off: !u.selected }]">
          <label class="check">
            <input type="checkbox" :checked="u.selected" @change="toggleUnit(u)" />
            <span>{{ unitLabel(u) }}</span>
          </label>
          <template v-if="u.selected">
            <input
              v-model="u.approxKg"
              class="input small"
              inputmode="decimal"
              :placeholder="$t('setup.approxKg')"
              :aria-label="`${unitLabel(u)} ${$t('setup.approxKg')}`"
            />
            <label class="radio">
              <input v-model="defaultKey" type="radio" name="default-unit" :value="u.key" />
              <span>{{ $t('setup.default') }}</span>
            </label>
          </template>
        </li>
      </ul>
      <div class="inline-add">
        <input
          v-model="customUnit"
          class="input"
          :placeholder="$t('setup.unitName')"
          @keydown.enter="addCustomUnit"
        />
        <button type="button" class="btn" @click="addCustomUnit">
          {{ $t('common.add') }}
        </button>
      </div>
      <p v-if="error" class="error">{{ error }}</p>
      <div class="actions">
        <button type="button" class="btn ghost" @click="step = 0">
          {{ $t('common.back') }}
        </button>
        <button type="button" class="btn primary" @click="nextFromUnits">
          {{ $t('common.next') }}
        </button>
      </div>
    </section>

    <section v-else>
      <h1>{{ $t('setup.fieldsTitle') }}</h1>
      <p class="muted">{{ $t('setup.fieldsHelp') }}</p>
      <ul class="list">
        <li v-for="(f, i) in fields" :key="i" class="field-row">
          <input
            v-model="f.name"
            class="input"
            :placeholder="$t('setup.fieldName')"
            :aria-label="$t('setup.fieldName')"
          />
          <input
            v-model="f.trees"
            class="input small"
            inputmode="numeric"
            :placeholder="$t('common.trees')"
            :aria-label="$t('common.trees')"
          />
        </li>
      </ul>
      <button type="button" class="btn" @click="fields.push({ name: '', trees: '' })">
        + {{ $t('setup.addField') }}
      </button>
      <div class="actions">
        <button type="button" class="btn ghost" @click="step = 1">
          {{ $t('common.back') }}
        </button>
        <button type="button" class="btn primary" :disabled="busy" @click="finish">
          {{ $t('setup.finish') }}
        </button>
      </div>
      <p v-if="error" class="error">{{ error }}</p>
    </section>
  </main>
</template>
