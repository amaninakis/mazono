<script setup lang="ts">
import type { Shortfall } from '../core/oil'
import type { Extraction, TaskEntry, UnitAmount } from '../core/types'
import { useTranslation } from 'i18next-vue'
import { computed, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { byNewest, parseISODate, seasonOf, todayISO } from '../core/dates'
import { formatNumber, formatYield } from '../core/format'
import {
  allocatedUnits,
  availableUnits,
  batchTrees,
  chargeFromPercent,
  chargeShare,
  newShortfalls,
  previousExtractionDate,
  stockLevels,
} from '../core/oil'
import { unitLabel } from '../core/units'
import { formatLocale } from '../i18n'
import AppModal from '../ui/AppModal.vue'
import DateField from '../ui/DateField.vue'
import { chargeName, locationName, useFarm } from '../ui/farm'
import NumberStepper from '../ui/NumberStepper.vue'
import { oilPeriod } from '../ui/periods'
import { useSaving } from '../ui/saving'
import ShortfallModal from '../ui/ShortfallModal.vue'
import { showToast } from '../ui/toast'

const { t: translate } = useTranslation()
const farm = useFarm()
const route = useRoute()
const router = useRouter()
const today = todayISO()

const editId = route.params.id as string | undefined
const editing = editId ? farm.value.extractions.find((x) => x.id === editId) : undefined

function fmt(value: number, decimals = 1) {
  return formatNumber(value, formatLocale.value, decimals)
}

function r3(value: number) {
  return Math.round(value * 1000) / 1000
}

/* ---------- reference data ---------- */
const mills = computed(() =>
  farm.value.mills.filter((mill) => !mill.archived || mill.id === editing?.millId),
)
const chargeTypes = computed(() =>
  farm.value.chargeTypes
    .filter(
      (chargeType) =>
        !chargeType.archived || editing?.charges.some((x) => x.chargeTypeId === chargeType.id),
    )
    .sort((left, right) => left.order - right.order),
)
const locations = computed(() =>
  farm.value.locations
    .filter((location) => !location.archived)
    .sort((left, right) => left.order - right.order),
)
const mainLocation = computed(() => locations.value[0])
const otherLocations = computed(() => locations.value.slice(1))
function unitById(id: string) {
  return farm.value.units.find((unit) => unit.id === id)
}

function fieldName(id: string) {
  return farm.value.fields.find((field) => field.id === id)?.name ?? '?'
}
const harvestTypeIds = computed(
  () =>
    new Set(farm.value.taskTypes.filter((x) => x.inputKind === 'harvest').map((x) => x.id)),
)

/* ---------- form state ---------- */
const lastMill = [...farm.value.extractions]
  .sort((left, right) => (left.date < right.date ? 1 : -1))
  .find((x) => x.millId)?.millId
const date = ref(editing?.date ?? today)
const millId = ref(editing?.millId ?? lastMill ?? mills.value[0]?.id ?? '')
const receiptNo = ref(editing?.receiptNo ?? '')
const oliveKg = ref<number | null>(editing?.oliveKg ?? null)
const oilKg = ref<number | null>(editing?.oilKg ?? null)
const acidity = ref<number | null>(editing?.acidity ?? null)
const notes = ref(editing?.notes ?? '')
const error = ref('')
const newMill = ref(false)
const newMillName = ref('')
const newCharge = ref(false)
const newChargeName = ref('')

/** kg per charge type, and which ones the user typed (those are not recalculated from %). */
const charges = reactive<Record<string, number | null>>({})
const manualCharge = new Set<string>()
for (const charge of editing?.charges ?? []) {
  charges[charge.chargeTypeId] = charge.kg
  manualCharge.add(charge.chargeTypeId)
}
watch(
  [oilKg, chargeTypes],
  () => {
    for (const chargeType of chargeTypes.value) {
      if (manualCharge.has(chargeType.id) || !chargeType.defaultPercent) {
        continue
      }
      charges[chargeType.id] = oilKg.value
        ? chargeFromPercent(chargeType.defaultPercent, oilKg.value)
        : null
    }
  },
  { immediate: true },
)

function setCharge(id: string, value: number | null) {
  charges[id] = value
  manualCharge.add(id)
}

const totalCharges = computed(() =>
  Object.values(charges).reduce<number>((sum, value) => sum + (value ?? 0), 0),
)
const net = computed(() => Math.max((oilKg.value ?? 0) - totalCharges.value, 0))

/** Oil kept in the other locations; the main location gets the rest. */
const stored = reactive<Record<string, number | null>>({})
for (const kept of editing?.storage ?? []) {
  if (kept.locationId !== mainLocation.value?.id) {
    stored[kept.locationId] = kept.kg
  }
}
const storedElsewhere = computed(() =>
  otherLocations.value.reduce((sum, location) => sum + (stored[location.id] ?? 0), 0),
)
const storedMain = computed(() => r3(net.value - storedElsewhere.value))

const yieldText = computed(() =>
  formatYield(
    oliveKg.value ?? 0,
    oilKg.value ?? 0,
    farm.value.settings.yieldFormat,
    formatLocale.value,
  ),
)

/* ---------- harvest days ---------- */
interface Row {
  entry: TaskEntry
  available: UnitAmount[]
  selected: boolean
  partial: boolean
  take: UnitAmount[]
}

function seasonOfDate(isoDate: string) {
  return seasonOf(isoDate, farm.value.settings.seasonStartMonth)
}

/**
 * Harvest days that can go into a production on `forDate`: the days of that farming year with
 * olives not yet sent to the mill (plus days this production already holds when editing).
 * Days since the previous production are pre-ticked, with leftovers of days already partly
 * milled.
 */
function buildRows(forDate: string): Row[] {
  const previous = previousExtractionDate(farm.value.extractions, forDate, editing?.id)
  const season = seasonOfDate(forDate)

  return farm.value.entries
    .filter(
      (entry) =>
        harvestTypeIds.value.has(entry.taskTypeId) &&
        entry.quantities?.some((quantity) => quantity.amount > 0),
    )
    .map((entry) => {
      const available = availableUnits(entry, farm.value.extractions, editing?.id)
      const mine = editing?.allocations.find((allocation) => allocation.entryId === entry.id)
      const partlyMilled =
        Object.keys(allocatedUnits(entry.id, farm.value.extractions, editing?.id)).length > 0
      const sameSeason = seasonOfDate(entry.date) === season
      const preTick =
        !editing &&
        sameSeason &&
        entry.date <= forDate &&
        (!previous || entry.date >= previous || partlyMilled)

      return {
        entry,
        available,
        selected: mine ? true : preTick && available.length > 0,
        partial: mine ? !sameUnits(mine.quantities, available) : false,
        take: mine ? copyUnits(mine.quantities) : copyUnits(available),
      }
    })
    .filter(
      (row) =>
        row.selected || (row.available.length > 0 && seasonOfDate(row.entry.date) === season),
    )
    .sort((left, right) => byNewest(left.entry, right.entry))
}

const rows = ref<Row[]>(buildRows(date.value))
/** True once the user ticks, unticks or splits a day by hand. */
let rowsTouched = false
function markTouched() {
  rowsTouched = true
}

// A different date (e.g. a past production) lists the harvest days of its own farming year.
// Ticks made by hand are kept while the date stays in the same year.
watch(date, (next, before) => {
  if (rowsTouched && seasonOfDate(next) === seasonOfDate(before)) {
    return
  }
  rows.value = buildRows(next)
  rowsTouched = false
})

/** Copy of a list of unit amounts (so editing a row never changes the saved entry). */
function copyUnits(quantities: UnitAmount[]) {
  return quantities.map((x) => ({ ...x }))
}

/** "3 sacks", or "3 sacks (of 7 sacks)" when part of the day already went to the mill. */
function availableText(row: Row) {
  const total = row.entry.quantities ?? []
  const text = unitsText(row.available)

  return sameUnits(row.available, total)
    ? text
    : `${text} (${translate('extraction.of', { total: unitsText(total) })})`
}

function sameUnits(first: UnitAmount[], second: UnitAmount[]) {
  return (
    first.length === second.length &&
    first.every((quantity) =>
      second.some((x) => x.unitId === quantity.unitId && x.amount === quantity.amount),
    )
  )
}

function unitsText(qs: UnitAmount[]) {
  return qs
    .filter((quantity) => quantity.amount > 0)
    .map(
      (quantity) =>
        `${fmt(quantity.amount, 2)} ${unitLabel(unitById(quantity.unitId), quantity.amount)}`,
    )
    .join(' + ')
}

function rowDate(isoDate: string) {
  return new Intl.DateTimeFormat(formatLocale.value, {
    day: 'numeric',
    month: 'short',
  }).format(parseISODate(isoDate))
}

function togglePart(row: Row) {
  rowsTouched = true
  row.partial = !row.partial
  if (!row.partial) {
    row.take = row.available.map((quantity) => ({ ...quantity }))
  }
  row.selected = true
}

const allocations = computed(() =>
  rows.value
    .filter((row) => row.selected)
    .map((row) => ({
      entryId: row.entry.id,
      quantities: (row.partial ? row.take : row.available)
        .filter((quantity) => quantity.amount > 0)
        .map((quantity) => ({ ...quantity })),
    }))
    .filter((allocation) => allocation.quantities.length),
)
const selectedUnits = computed(() => {
  const out: Record<string, number> = {}
  for (const quantity of allocations.value.flatMap((allocation) => allocation.quantities)) {
    out[quantity.unitId] = (out[quantity.unitId] ?? 0) + quantity.amount
  }

  return Object.entries(out).map(([unitId, amount]) => ({ unitId, amount }))
})
const perUnit = computed(() => {
  const quantity = selectedUnits.value
  if (quantity.length !== 1 || !oliveKg.value || !quantity[0].amount) {
    return ''
  }

  return translate('extraction.perUnit', {
    kg: fmt(oliveKg.value / quantity[0].amount),
    unit: unitLabel(unitById(quantity[0].unitId), 1).toLowerCase(),
  })
})

/* ---------- actions ---------- */
async function addMill() {
  const name = newMillName.value.trim()
  if (!name) {
    return
  }
  const mill = await farm.value.repo.put('mills', { name, archived: false })
  millId.value = mill.id
  newMill.value = false
  newMillName.value = ''
}

async function addCharge() {
  const name = newChargeName.value.trim()
  if (!name) {
    return
  }
  await farm.value.repo.put('chargeTypes', {
    name,
    archived: false,
    order: farm.value.chargeTypes.length,
  })
  newCharge.value = false
  newChargeName.value = ''
}

function onMillChange(event: Event) {
  const sel = event.target as HTMLSelectElement
  if (sel.value === '__new') {
    sel.value = millId.value
    newMill.value = true
  } else {
    millId.value = sel.value
  }
}

const { saving, once } = useSaving()

async function save() {
  await once(saveExtraction)
}

/* ---------- oil already sold or moved out ---------- */
/** Places a change would leave short; shown before saving or deleting. */
const missing = ref<Shortfall[]>([])
const missingAction = ref<'save' | 'delete'>('save')

function stockWith(extractions: Extraction[]) {
  return stockLevels(
    extractions,
    farm.value.stockMovements,
    farm.value.settings.seasonStartMonth,
    farm.value.transactions,
  )
}

/** What would be missing if the productions were these instead. */
function missingWith(extractions: Extraction[]) {
  return newShortfalls(stockWith(farm.value.extractions), stockWith(extractions))
}

async function goAhead() {
  missing.value = []
  await (missingAction.value === 'save'
    ? once(async () => await saveExtraction(true))
    : remove(true))
}

async function saveExtraction(confirmed = false) {
  if (!oliveKg.value || !oilKg.value) {
    error.value = translate('extraction.nothingToSave')
    return
  }
  if (storedMain.value < 0) {
    error.value = translate('extraction.storedTooMuch')
    return
  }
  error.value = ''
  const storage = [
    ...(mainLocation.value
      ? [{ locationId: mainLocation.value.id, kg: storedMain.value }]
      : []),
    ...otherLocations.value.map((location) => ({
      locationId: location.id,
      kg: stored[location.id] ?? 0,
    })),
  ].filter((share) => share.kg > 0)
  if (!confirmed) {
    const draft: Extraction = {
      id: editing?.id ?? 'draft',
      farmId: farm.value.repo.farmId,
      updatedAt: 0,
      date: date.value,
      oliveKg: oliveKg.value,
      oilKg: oilKg.value,
      charges: [],
      storage,
      allocations: [],
    }
    const others = farm.value.extractions.filter((x) => x.id !== editing?.id)
    missing.value = missingWith([...others, draft])
    if (missing.value.length > 0) {
      missingAction.value = 'save'
      return
    }
  }
  const saved = await farm.value.repo.saveExtraction({
    id: editing?.id,
    date: date.value,
    millId: millId.value || undefined,
    receiptNo: receiptNo.value.trim() || undefined,
    oliveKg: oliveKg.value,
    oilKg: oilKg.value,
    acidity: acidity.value ?? undefined,
    charges: Object.entries(charges)
      .filter(([, kg]) => (kg ?? 0) > 0)
      .map(([chargeTypeId, kg]) => ({ chargeTypeId, kg: kg! })),
    storage,
    allocations: allocations.value,
    notes: notes.value.trim() || undefined,
  })

  const lines = [
    translate('extraction.summaryNet', { yield: yieldText.value, net: fmt(net.value) }),
  ]
  if (perUnit.value) {
    lines.push(perUnit.value)
  }
  const trees = batchTrees(saved, farm.value.entries)
  if (trees > 0) {
    lines.push(translate('extraction.summaryTree', { kg: fmt(saved.oilKg / trees, 2) }))
  }
  oilPeriod.season = seasonOf(date.value, farm.value.settings.seasonStartMonth)
  showToast({
    title: editing ? translate('extraction.updated') : translate('extraction.saved'),
    lines,
  })
  void router.push('/oil')
}

async function remove(confirmed = false) {
  if (!editing) {
    return
  }
  if (!confirmed) {
    missing.value = missingWith(farm.value.extractions.filter((x) => x.id !== editing.id))
    if (missing.value.length > 0) {
      missingAction.value = 'delete'
      return
    }
  }
  const repo = farm.value.repo
  await repo.softDelete('extractions', editing.id)
  showToast({
    title: translate('extraction.deleted'),
    action: {
      label: translate('common.undo'),
      run: () => void repo.restore('extractions', editing.id),
    },
  })
  void router.push('/oil')
}
</script>

<template>
  <main class="page extraction">
    <header class="page-head">
      <h1>{{ editing ? $t('extraction.editTitle') : $t('extraction.title') }}</h1>
    </header>

    <!-- 1. Basics -->
    <section class="card">
      <div class="row-between">
        <label class="label" for="x-date">{{ $t('common.date') }}</label>
        <DateField id="x-date" v-model="date" :max="today" :label="$t('common.date')" />
      </div>
      <label class="label" for="x-mill">{{ $t('extraction.mill') }}</label>
      <select id="x-mill" class="input select" :value="millId" @change="onMillChange">
        <option value="">–</option>
        <option v-for="m in mills" :key="m.id" :value="m.id">{{ m.name }}</option>
        <option value="__new">{{ $t('extraction.newMill') }}</option>
      </select>
      <label class="label" for="x-receipt">{{ $t('extraction.receiptNo') }}</label>
      <input id="x-receipt" v-model="receiptNo" class="input" />
      <label class="label" for="x-olives">{{ $t('extraction.oliveKg') }}</label>
      <NumberStepper
        id="x-olives"
        v-model="oliveKg"
        :label="$t('extraction.oliveKg')"
        :step="10"
      />
      <label class="label" for="x-oil">{{ $t('extraction.oilKg') }}</label>
      <NumberStepper id="x-oil" v-model="oilKg" :label="$t('extraction.oilKg')" />
      <p class="result" aria-live="polite">
        {{ $t('extraction.yieldValue', { value: yieldText }) }}
      </p>
      <label class="label" for="x-acidity">{{ $t('extraction.acidity') }}</label>
      <NumberStepper
        id="x-acidity"
        v-model="acidity"
        :label="$t('extraction.acidity')"
        :step="0.1"
      />
    </section>

    <!-- 2. Charges -->
    <section class="card">
      <h2>{{ $t('extraction.chargesTitle') }}</h2>
      <p class="muted small">{{ $t('extraction.chargesHelp') }}</p>
      <div v-for="c in chargeTypes" :key="c.id" class="charge-row">
        <span class="label">{{ chargeName($t, c) }}</span>
        <div class="qty-row">
          <NumberStepper
            :model-value="charges[c.id] ?? null"
            :label="chargeName($t, c)"
            @update:model-value="(v) => setCharge(c.id, v)"
          />
          <span
            class="pct"
            >{{ oilKg && charges[c.id] ? `${formatNumber(chargeShare(charges[c.id]!, oilKg) * 100, formatLocale, 1)  }%` : '' }}</span
          >
        </div>
      </div>
      <button type="button" class="btn ghost small" @click="newCharge = true">
        + {{ $t('extraction.addCharge') }}
      </button>
      <p class="result">
        {{ $t('extraction.netOil') }}: <strong>{{ fmt(net) }} {{ $t('common.kg') }}</strong>
      </p>
    </section>

    <!-- 3. Where the oil went -->
    <section class="card">
      <h2>{{ $t('extraction.whereTitle') }}</h2>
      <div v-for="l in otherLocations" :key="l.id">
        <span class="label">{{ locationName($t, l) }}</span>
        <NumberStepper v-model="stored[l.id]" :label="locationName($t, l)" :max="net" />
      </div>
      <p v-if="mainLocation" class="result">
        {{ locationName($t, mainLocation) }} ({{ $t('extraction.rest') }}):
        <strong>{{ fmt(Math.max(storedMain, 0)) }} {{ $t('common.kg') }}</strong>
      </p>
    </section>

    <!-- 4. Harvest days -->
    <section class="card">
      <h2>{{ $t('extraction.harvestTitle') }}</h2>
      <p class="muted small">{{ $t('extraction.harvestHelp') }}</p>
      <p v-if="rows.length === 0" class="muted">{{ $t('extraction.noHarvest') }}</p>
      <ul v-else class="list harvest-rows">
        <li
          v-for="r in rows"
          :key="r.entry.id"
          class="harvest-row"
          :class="[{ on: r.selected }]"
        >
          <div class="hr-main">
            <label class="check">
              <input v-model="r.selected" type="checkbox" @change="markTouched" />
              <span>
                <strong>{{ rowDate(r.entry.date) }} · {{ fieldName(r.entry.fieldId) }}</strong>
                <small class="muted">{{ availableText(r) }}</small>
              </span>
            </label>
            <button
              type="button"
              class="btn small"
              :class="[r.partial ? 'primary' : 'ghost']"
              @click="togglePart(r)"
            >
              {{ $t('extraction.part') }}
            </button>
          </div>
          <div v-if="r.partial && r.selected" class="hr-part">
            <div v-for="(q, i) in r.take" :key="q.unitId">
              <span class="label small"
                >{{ unitLabel(unitById(q.unitId), 2) }} ({{
                  $t('extraction.of', { total: fmt(r.available[i]?.amount ?? 0, 2) })
                }})</span
              >
              <NumberStepper
                v-model="q.amount"
                :label="unitById(q.unitId)?.name ?? ''"
                :max="r.available[i]?.amount"
                half
              />
            </div>
          </div>
        </li>
      </ul>
      <p v-if="selectedUnits.length" class="result">
        {{ $t('extraction.selected', { units: unitsText(selectedUnits) }) }}
        <br v-if="perUnit" />
        <span v-if="perUnit" class="muted">{{ perUnit }}</span>
      </p>
    </section>

    <section class="card">
      <label class="label" for="x-notes">{{ $t('common.notes') }}</label>
      <textarea id="x-notes" v-model="notes" class="input" rows="2"></textarea>
      <button v-if="editing" type="button" class="btn ghost small danger" @click="remove()">
        {{ $t('common.delete') }}
      </button>
    </section>

    <p v-if="error" class="error">{{ error }}</p>

    <div class="save-bar">
      <button type="button" class="btn ghost" @click="router.push('/oil')">
        {{ $t('common.cancel') }}
      </button>
      <button type="button" class="btn primary big" :disabled="saving" @click="save">
        {{ $t('common.save') }}
      </button>
    </div>

    <AppModal v-if="newMill" :title="$t('extraction.newMill')" @close="newMill = false">
      <label class="label" for="nm-name">{{ $t('extraction.newMillName') }}</label>
      <input
        id="nm-name"
        v-model="newMillName"
        class="input"
        autofocus
        @keydown.enter="addMill"
      />
      <div class="actions">
        <button type="button" class="btn ghost" @click="newMill = false">
          {{ $t('common.cancel') }}
        </button>
        <button type="button" class="btn primary" @click="addMill">
          {{ $t('today.create') }}
        </button>
      </div>
    </AppModal>
    <AppModal v-if="newCharge" :title="$t('extraction.addCharge')" @close="newCharge = false">
      <label class="label" for="nc-name">{{ $t('extraction.newChargeName') }}</label>
      <input
        id="nc-name"
        v-model="newChargeName"
        class="input"
        autofocus
        @keydown.enter="addCharge"
      />
      <div class="actions">
        <button type="button" class="btn ghost" @click="newCharge = false">
          {{ $t('common.cancel') }}
        </button>
        <button type="button" class="btn primary" @click="addCharge">
          {{ $t('today.create') }}
        </button>
      </div>
    </AppModal>
    <ShortfallModal
      v-if="missing.length > 0"
      :missing="missing"
      :confirm-label="
        missingAction === 'save' ? $t('shortfall.saveAnyway') : $t('shortfall.deleteAnyway')
      "
      @confirm="goAhead"
      @close="missing = []"
    />
  </main>
</template>
