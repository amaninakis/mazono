<script setup lang="ts">
import type { FormValues } from '../core/drafts'
import type { TransactionKind } from '../core/types'
import { useTranslation } from 'i18next-vue'
import { computed, nextTick, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { seasonLabel, seasonOf, todayISO } from '../core/dates'
import { formatMoney, formatNumber } from '../core/format'
import {
  categoryForParty,
  countsForTax,
  defaultSaleSource,
  feeForBuyer,
  lastSaleAcidity,
  partyNames,
  saleAmounts,
  taxChoiceFor,
} from '../core/money'
import { stockLevels, trackedVintages } from '../core/oil'
import { formatLocale } from '../i18n'
import AppModal from '../ui/AppModal.vue'
import DateField from '../ui/DateField.vue'
import { useDraft } from '../ui/draft'
import DraftNotice from '../ui/DraftNotice.vue'
import { categoryName, locationName, useFarm } from '../ui/farm'
import NameInput from '../ui/NameInput.vue'
import NumberStepper from '../ui/NumberStepper.vue'
import { moneyPeriod } from '../ui/periods'
import { useSaving } from '../ui/saving'
import { sheetBackdrop } from '../ui/sheet'
import SheetClose from '../ui/SheetClose.vue'
import { showToast } from '../ui/toast'

const { t: translate } = useTranslation()
const farm = useFarm()
const route = useRoute()
const router = useRouter()
const today = todayISO()

const editing = route.params.id
  ? farm.value.transactions.find((x) => x.id === route.params.id)
  : undefined
const kind: TransactionKind =
  editing?.kind ?? ((route.params.kind as TransactionKind) || 'expense')
const startMonth = farm.value.settings.seasonStartMonth
function fmt(value: number, decimals = 1) {
  return formatNumber(value, formatLocale.value, decimals)
}

const title = computed(() => {
  const kindLabel = { sale: 'Sale', income: 'Income', expense: 'Expense' }[kind]
  return translate(editing ? `tx.edit${kindLabel}` : `tx.new${kindLabel}`)
})
const partyLabel = { sale: 'tx.buyer', income: 'tx.source', expense: 'tx.business' }[kind]

/* ---------- form ---------- */
const date = ref(editing?.date ?? today)
const party = ref(editing?.party ?? '')
const categoryId = ref(editing?.categoryId ?? '')
let categoryChosen = !!editing?.categoryId
const amount = ref<number | null>(editing && kind !== 'sale' ? editing.amount : null)
const invoiceNo = ref(editing?.invoiceNo ?? '')
const notes = ref(editing?.notes ?? '')
/**
 * Counts in the tax estimate (shown only when one is set in Settings). A new entry starts as
 * the last one with this buyer, business or source, else of this category; once the user
 * ticks or unticks it, it stays as they left it.
 */
const taxEnabled = computed(() => !!farm.value.settings.taxPercent)
const taxCounted = ref(
  editing
    ? countsForTax(editing)
    : taxChoiceFor(farm.value.transactions, kind, '', categoryId.value || undefined),
)
let taxChosen = !!editing
function rememberedTaxChoice() {
  if (!taxChosen) {
    taxCounted.value = taxChoiceFor(
      farm.value.transactions,
      kind,
      party.value,
      kind === 'sale' ? undefined : categoryId.value || undefined,
    )
  }
}
const error = ref('')
const newCategory = ref(false)
const newCategoryName = ref('')

/**
 * Names used before: this kind first (most used first), then, once something is typed,
 * names from the other kinds too (a business may both buy oil and sell supplies).
 */
const names = computed(() => {
  const own = partyNames(farm.value.transactions, kind)
  if (!party.value.trim()) {
    return own
  }
  const others = (['expense', 'sale', 'income'] as const)
    .filter((other) => other !== kind)
    .flatMap((other) => partyNames(farm.value.transactions, other))

  return [...new Set([...own, ...others])]
})
const categories = computed(() =>
  kind === 'sale'
    ? []
    : farm.value.categories
        .filter(
          (category) =>
            category.kind === kind &&
            (!category.archived || category.id === editing?.categoryId),
        )
        .sort((left, right) => left.order - right.order),
)
if (!categoryId.value && categories.value.length) {
  categoryId.value = categories.value[0].id
}

/** Optional fee kept from the sale (e.g. the mill's 1%), as % of kg × price or in euros. */
const feeKind = ref<'percent' | 'euro'>(
  editing?.fee && editing.feePercent == null ? 'euro' : 'percent',
)
const feeValue = ref<number | null>(editing?.fee ? (editing.feePercent ?? editing.fee) : null)
let feeChosen = !!editing?.fee

/** Fill in the category last used with this business. */
function onPartyChange() {
  if (kind === 'sale') {
    // Fill in the fee used last time with this buyer.
    const lastFee = !feeChosen ? feeForBuyer(farm.value.transactions, party.value) : undefined
    if (lastFee) {
      feeKind.value = lastFee.kind
      feeValue.value = lastFee.value
    }
    rememberedTaxChoice()

    return
  }
  const lastCategory = categoryChosen
    ? undefined
    : categoryForParty(farm.value.transactions, party.value, kind)
  if (lastCategory) {
    categoryId.value = lastCategory
  }
  rememberedTaxChoice()
}

function onCategoryChange(event: Event) {
  const sel = event.target as HTMLSelectElement
  if (sel.value === '__new') {
    sel.value = categoryId.value
    newCategory.value = true

    return
  }
  categoryId.value = sel.value
  categoryChosen = true
  rememberedTaxChoice()
}

async function addCategory() {
  const name = newCategoryName.value.trim()
  if (!name || kind === 'sale') {
    return
  }
  const category = await farm.value.repo.put('categories', {
    kind,
    name,
    archived: false,
    order: farm.value.categories.length,
  })
  categoryId.value = category.id
  categoryChosen = true
  rememberedTaxChoice()
  newCategory.value = false
  newCategoryName.value = ''
}

/* ---------- sales ---------- */
/** Stock without this sale, so editing a sale can keep its own kg. */
const stock = computed(() =>
  stockLevels(
    farm.value.extractions,
    farm.value.stockMovements,
    startMonth,
    farm.value.transactions.filter((x) => x.id !== editing?.id),
  ),
)
const mainLocation = computed(
  () => farm.value.locations.slice().sort((left, right) => left.order - right.order)[0],
)
const sources = computed(() =>
  Object.entries(stock.value)
    .flatMap(([value, byLoc]) =>
      Object.entries(byLoc).map(([locationId, kg]) => ({
        vintage: Number(value),
        locationId,
        kg,
      })),
    )
    .filter(
      (isoDate) =>
        isoDate.kg > 0 ||
        (isoDate.vintage === editing?.vintage && isoDate.locationId === editing?.locationId),
    )
    .sort((left, right) => left.vintage - right.vintage),
)
/**
 * Seasons whose oil is not in the app (no extractions recorded), e.g. oil from before the
 * user started. Selling it counts as income but does not reduce stock until that season's
 * extractions are entered.
 */
const tracked = computed(() => trackedVintages(farm.value.extractions, startMonth))
const untrackedSeasons = computed(() => {
  const latest = seasonOf(date.value, startMonth)
  const list = Array.from({ length: 5 }, (_, i) => latest - i).filter(
    (value) => !tracked.value.has(value),
  )
  if (
    editing?.vintage != null &&
    !tracked.value.has(editing.vintage) &&
    !list.includes(editing.vintage)
  ) {
    list.push(editing.vintage)
  }

  return list
})
const UNTRACKED = 'untracked'

function startValue(): string {
  if (editing?.vintage != null && editing.locationId) {
    return tracked.value.has(editing.vintage)
      ? `${editing.vintage}|${editing.locationId}`
      : `${editing.vintage}|${UNTRACKED}`
  }
  const day = defaultSaleSource(stock.value, mainLocation.value?.id)
  if (day) {
    return `${day.vintage}|${day.locationId}`
  }
  const unit = untrackedSeasons.value[0]

  return unit != null ? `${unit}|${UNTRACKED}` : ''
}
const source = ref(startValue())
// A different date can change which seasons are offered: keep the choice valid.
watch(untrackedSeasons, (list) => {
  const [value, loc] = source.value.split('|')
  if (loc === UNTRACKED && !list.includes(Number(value))) {
    source.value = list.length ? `${list[0]}|${UNTRACKED}` : startValue()
  }
})
const chosen = computed(() => {
  const [value, loc] = source.value.split('|')
  if (!value) {
    return undefined
  }
  const untracked = loc === UNTRACKED

  return {
    vintage: Number(value),
    locationId: untracked ? (mainLocation.value?.id ?? '') : loc,
    untracked,
  }
})
const available = computed(() =>
  chosen.value && !chosen.value.untracked
    ? (stock.value[chosen.value.vintage]?.[chosen.value.locationId] ?? 0)
    : 0,
)
const kg = ref<number | null>(editing?.kg ?? null)
const price = ref<number | null>(editing?.pricePerKg ?? null)
/** Acidity of the oil sold; a new sale starts with the previous sale's value. */
const acidity = ref<number | null>(
  editing ? (editing.acidity ?? null) : (lastSaleAcidity(farm.value.transactions) ?? null),
)
const amounts = computed(() =>
  saleAmounts(
    kg.value ?? 0,
    price.value ?? 0,
    feeValue.value ? { kind: feeKind.value, value: feeValue.value } : undefined,
  ),
)
function setFeeKind(nextKind: 'percent' | 'euro') {
  feeKind.value = nextKind
  feeChosen = true
}

function setFee(value: number | null) {
  feeValue.value = value
  feeChosen = true
}

function sourceLabel(isoDate: { vintage: number; locationId: string; kg: number }) {
  const location = farm.value.locations.find((x) => x.id === isoDate.locationId)
  return `${seasonLabel(isoDate.vintage)} · ${location ? locationName(translate, location) : '?'} (${fmt(isoDate.kg, 3)})`
}

/* ---------- unsaved work survives a call or a wrong tap ---------- */
const draft = useDraft({
  form: kind,
  recordId: editing?.id,
  values: () => ({
    date: date.value,
    party: party.value,
    categoryId: categoryId.value,
    amount: amount.value,
    invoiceNo: invoiceNo.value,
    notes: notes.value,
    feeKind: feeKind.value,
    feeValue: feeValue.value,
    source: source.value,
    kg: kg.value,
    price: price.value,
    acidity: acidity.value,
    taxCounted: taxChosen ? taxCounted.value : undefined,
  }),
  restore: restoreValues,
})

async function restoreValues(values: FormValues) {
  if (typeof values.date === 'string') {
    date.value = values.date
  }
  await nextTick() // the oil on offer follows the date
  if (typeof values.party === 'string') {
    party.value = values.party
  }
  if (typeof values.categoryId === 'string') {
    categoryId.value = values.categoryId
    categoryChosen = true
  }
  if ('amount' in values) {
    amount.value = values.amount as number | null
  }
  if (typeof values.invoiceNo === 'string') {
    invoiceNo.value = values.invoiceNo
  }
  if (typeof values.notes === 'string') {
    notes.value = values.notes
  }
  if (typeof values.taxCounted === 'boolean') {
    taxCounted.value = values.taxCounted
    taxChosen = true
  }
  if (values.feeKind === 'percent' || values.feeKind === 'euro') {
    feeKind.value = values.feeKind
    feeChosen = true
  }
  if ('feeValue' in values) {
    feeValue.value = values.feeValue as number | null
    feeChosen = true
  }
  if (typeof values.source === 'string') {
    source.value = values.source
  }
  if ('kg' in values) {
    kg.value = values.kg as number | null
  }
  if ('price' in values) {
    price.value = values.price as number | null
  }
  if ('acidity' in values) {
    acidity.value = values.acidity as number | null
  }
  rememberedTaxChoice()
}

/* ---------- save ---------- */
const { saving, once } = useSaving()

async function save() {
  await once(saveTransaction)
}

async function saveTransaction() {
  error.value = ''
  if (kind === 'sale') {
    if (!kg.value || !price.value || !chosen.value) {
      error.value = sources.value.length
        ? translate('tx.saleNothingToSave')
        : translate('tx.noStock')

      return
    }
    // An existing sale may keep its kg from the same oil, so it can be corrected step by step.
    const keepsOwnKg =
      editing?.vintage === chosen.value.vintage &&
      editing.locationId === chosen.value.locationId &&
      kg.value <= (editing.kg ?? 0) + 0.0001
    if (!chosen.value.untracked && kg.value > available.value + 0.0001 && !keepsOwnKg) {
      error.value = translate('tx.tooMuch', { kg: fmt(available.value, 3) })
      return
    }
  } else if (!amount.value) {
    error.value = translate('tx.nothingToSave')
    return
  }
  await farm.value.repo.put('transactions', {
    id: editing?.id,
    date: date.value,
    kind,
    party: party.value.trim(),
    categoryId: kind === 'sale' ? undefined : categoryId.value || undefined,
    amount: kind === 'sale' ? amounts.value.received : amount.value!,
    fee: kind === 'sale' && amounts.value.fee ? amounts.value.fee : undefined,
    feePercent:
      kind === 'sale' && amounts.value.fee && feeKind.value === 'percent'
        ? feeValue.value!
        : undefined,
    kg: kind === 'sale' ? kg.value! : undefined,
    pricePerKg: kind === 'sale' ? price.value! : undefined,
    acidity: kind === 'sale' ? (acidity.value ?? undefined) : undefined,
    vintage: kind === 'sale' ? chosen.value!.vintage : undefined,
    locationId: kind === 'sale' ? chosen.value!.locationId : undefined,
    invoiceNo: kind === 'expense' ? invoiceNo.value.trim() || undefined : undefined,
    fieldId: editing?.fieldId, // no longer asked; kept on older entries
    notes: notes.value.trim() || undefined,
    taxCounted: taxEnabled.value ? taxCounted.value : editing?.taxCounted,
  })
  draft.clear()
  showPeriodOf(date.value, translate('tx.saved'))
  void router.push(sheetBackdrop.value)
}

/** Open the Money page on the calendar year of this entry, and say so. */
function showPeriodOf(isoDate: string, title: string) {
  const year = Number(isoDate.slice(0, 4))
  moneyPeriod.year = year
  showToast({ title, lines: [translate('tx.inYear', { period: String(year) })] })
}

async function remove() {
  if (!editing) {
    return
  }
  const repo = farm.value.repo
  await repo.softDelete('transactions', editing.id)
  draft.clear()
  showToast({
    title: translate('tx.deleted'),
    action: {
      label: translate('common.undo'),
      run: () => void repo.restore('transactions', editing.id),
    },
  })
  void router.push(sheetBackdrop.value)
}
</script>

<template>
  <main class="page transaction">
    <header class="page-head">
      <SheetClose />
      <h1>{{ title }}</h1>
    </header>
    <DraftNotice
      v-if="draft.restoredAt.value"
      :saved-at="draft.restoredAt.value"
      @discard="draft.discard()"
    />

    <section class="card">
      <div class="row-between">
        <label class="label" for="tx-date">{{ $t('common.date') }}</label>
        <DateField id="tx-date" v-model="date" :label="$t('common.date')" />
      </div>
      <label class="label" for="tx-party">{{ $t(partyLabel) }}</label>
      <NameInput id="tx-party" v-model="party" :names="names" @done="onPartyChange" />

      <template v-if="kind !== 'sale'">
        <label class="label" for="tx-category">{{ $t('tx.category') }}</label>
        <select
          id="tx-category"
          class="input select"
          :value="categoryId"
          @change="onCategoryChange"
        >
          <option v-for="c in categories" :key="c.id" :value="c.id">
            {{ categoryName($t, c) }}
          </option>
          <option value="__new">{{ $t('tx.newCategory') }}</option>
        </select>
        <label class="label" for="tx-amount">{{ $t('tx.amount') }}</label>
        <NumberStepper id="tx-amount" v-model="amount" :label="$t('tx.amount')" />
      </template>

      <template v-if="kind === 'expense'">
        <label class="label" for="tx-invoice">{{ $t('tx.invoiceNo') }}</label>
        <input id="tx-invoice" v-model="invoiceNo" class="input" />
      </template>
    </section>

    <section v-if="kind === 'sale'" class="card">
      <p v-if="!sources.length && !untrackedSeasons.length" class="muted">
        {{ $t('tx.noStock') }}
      </p>
      <template v-else>
        <label class="label" for="tx-source">{{ $t('tx.soldFrom') }}</label>
        <select id="tx-source" v-model="source" class="input select">
          <option
            v-for="s in sources"
            :key="`${s.vintage}|${s.locationId}`"
            :value="`${s.vintage}|${s.locationId}`"
          >
            {{ sourceLabel(s) }}
          </option>
          <option v-for="v in untrackedSeasons" :key="`u${v}`" :value="`${v}|${UNTRACKED}`">
            {{ $t('tx.untrackedOption', { season: seasonLabel(v) }) }}
          </option>
        </select>
        <p v-if="chosen?.untracked" class="notice">
          {{ $t('tx.untrackedHelp', { season: seasonLabel(chosen.vintage) }) }}
        </p>
        <label class="label" for="tx-kg">{{ $t('tx.kg') }}</label>
        <NumberStepper
          id="tx-kg"
          v-model="kg"
          :label="$t('tx.kg')"
          :max="chosen?.untracked ? undefined : available"
        />
        <p v-if="!chosen?.untracked" class="hint">
          {{ $t('tx.available', { kg: fmt(available, 3) }) }}
        </p>
        <label class="label" for="tx-price">{{ $t('tx.pricePerKg') }}</label>
        <NumberStepper
          id="tx-price"
          v-model="price"
          :label="$t('tx.pricePerKg')"
          :step="0.1"
        />
        <label class="label" for="tx-acidity">{{ $t('tx.acidity') }}</label>
        <NumberStepper
          id="tx-acidity"
          v-model="acidity"
          :label="$t('tx.acidity')"
          :step="0.1"
        />
        <label class="label" for="tx-fee">{{ $t('tx.fee') }}</label>
        <div class="qty-row fee-row">
          <NumberStepper
            id="tx-fee"
            :model-value="feeValue"
            :label="$t('tx.fee')"
            :step="feeKind === 'percent' ? 0.5 : 1"
            @update:model-value="setFee"
          />
          <div class="chips tight" role="radiogroup" :aria-label="$t('tx.fee')">
            <button
              type="button"
              role="radio"
              :aria-checked="feeKind === 'percent'"
              class="chip"
              :class="[{ selected: feeKind === 'percent' }]"
              @click="setFeeKind('percent')"
            >
              %
            </button>
            <button
              type="button"
              role="radio"
              :aria-checked="feeKind === 'euro'"
              class="chip"
              :class="[{ selected: feeKind === 'euro' }]"
              @click="setFeeKind('euro')"
            >
              €
            </button>
          </div>
        </div>
        <table class="kv sale-sum">
          <tbody>
            <tr>
              <th>{{ $t('tx.total') }}</th>
              <td>{{ formatMoney(amounts.gross, formatLocale) }}</td>
            </tr>
            <template v-if="amounts.fee">
              <tr class="sub">
                <th>{{ $t('tx.feeShort') }}</th>
                <td>− {{ formatMoney(amounts.fee, formatLocale) }}</td>
              </tr>
              <tr class="strong">
                <th>{{ $t('tx.received') }}</th>
                <td>{{ formatMoney(amounts.received, formatLocale) }}</td>
              </tr>
            </template>
          </tbody>
        </table>
      </template>
    </section>

    <section class="card">
      <label v-if="taxEnabled" class="check tax-check">
        <input v-model="taxCounted" type="checkbox" @change="taxChosen = true" />
        <span>{{ $t('tx.countsForTax') }}</span>
      </label>
      <label class="label" for="tx-notes">{{ $t('common.notes') }}</label>
      <textarea id="tx-notes" v-model="notes" class="input" rows="2"></textarea>
      <button v-if="editing" type="button" class="btn ghost small danger" @click="remove">
        {{ $t('common.delete') }}
      </button>
    </section>

    <p v-if="error" class="error">{{ error }}</p>

    <div class="save-bar">
      <button type="button" class="btn ghost" @click="router.push(sheetBackdrop)">
        {{ $t('common.cancel') }}
      </button>
      <button type="button" class="btn primary big" :disabled="saving" @click="save">
        {{ $t('common.save') }}
      </button>
    </div>

    <AppModal v-if="newCategory" :title="$t('tx.newCategory')" @close="newCategory = false">
      <label class="label" for="nc-cat">{{ $t('tx.newCategoryName') }}</label>
      <input
        id="nc-cat"
        v-model="newCategoryName"
        class="input"
        autofocus
        @keydown.enter="addCategory"
      />
      <div class="actions">
        <button type="button" class="btn ghost" @click="newCategory = false">
          {{ $t('common.cancel') }}
        </button>
        <button type="button" class="btn primary" @click="addCategory">
          {{ $t('today.create') }}
        </button>
      </div>
    </AppModal>
  </main>
</template>
