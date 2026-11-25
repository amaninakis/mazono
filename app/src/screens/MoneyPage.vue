<script setup lang="ts">
import type { Transaction, TransactionKind } from '../core/types'
import { useTranslation } from 'i18next-vue'
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { byNewest, parseISODate, todayISO } from '../core/dates'
import { formatMoney, formatNumber } from '../core/format'
import {
  inPeriod,
  lastSalePrice,
  moneyTotals,
  type Period,
  stockForValue,
  taxEstimate,
} from '../core/money'
import { isUntrackedSale, stockLevels, trackedVintages } from '../core/oil'
import { formatLocale } from '../i18n'
import { canDo, categoryName, locationName, useFarm } from '../ui/farm'
import OilDrop from '../ui/OilDrop.vue'
import { moneyPeriod } from '../ui/periods'
import YearPicker from '../ui/YearPicker.vue'

const { t: translate } = useTranslation()
const farm = useFarm()
const router = useRouter()
const startMonth = computed(() => farm.value.settings.seasonStartMonth)

function eur(value: number) {
  return formatMoney(value, formatLocale.value)
}

function kgFmt(value: number) {
  return formatNumber(value, formatLocale.value, 1)
}

function day(isoDate: string) {
  return new Intl.DateTimeFormat(formatLocale.value, {
    day: 'numeric',
    month: 'short',
  }).format(parseISODate(isoDate))
}

/* ---------- period: calendar year ---------- */
const today = todayISO()
function yearOf(isoDate: string) {
  return Number(isoDate.slice(0, 4))
}
const years = computed(() =>
  [...new Set([yearOf(today), ...farm.value.transactions.map((x) => yearOf(x.date))])].sort(
    (left, right) => right - left,
  ),
)
const shownYear = computed({
  get: () => moneyPeriod.year ?? yearOf(today),
  set: (value: number) => (moneyPeriod.year = value),
})
const period = computed<Period>(() => ({
  kind: 'year',
  year: moneyPeriod.year ?? yearOf(today),
}))

/* ---------- totals ---------- */
const totals = computed(() =>
  moneyTotals(farm.value.transactions, period.value, startMonth.value),
)
const tax = computed(() =>
  taxEstimate(totals.value.taxableNet, farm.value.settings.taxPercent),
)
const stock = computed(() =>
  stockLevels(
    farm.value.extractions,
    farm.value.stockMovements,
    startMonth.value,
    farm.value.transactions,
  ),
)
const anyStock = computed(() => stockForValue(stock.value) > 0.05)
/** Places whose oil counts for the stock value (all, unless the user chose some). */
const valueLocations = computed(() =>
  farm.value.locations
    .filter((location) => !location.deletedAt && !location.archived)
    .sort((left, right) => left.order - right.order),
)
const counted = computed(
  () => farm.value.settings.stockValueLocations ?? valueLocations.value.map((x) => x.id),
)
const stockKg = computed(() => stockForValue(stock.value, counted.value))

function toggleValueLocation(id: string) {
  const next = counted.value.includes(id)
    ? counted.value.filter((x) => x !== id)
    : [...counted.value, id]
  const all = valueLocations.value.every((location) => next.includes(location.id))
  void farm.value.repo.updateSettings({ stockValueLocations: all ? undefined : next })
}
const lastPrice = computed(() => lastSalePrice(farm.value.transactions))

function categoryRows(kind: 'expense' | 'income') {
  return Object.entries(totals.value.byCategory)
    .map(([id, amount]) => ({
      category: farm.value.categories.find((x) => x.id === id),
      amount,
    }))
    .filter(
      (row) => (row.category ? row.category.kind === kind : kind === 'expense') && row.amount,
    )
    .map((row) => ({
      name: row.category
        ? categoryName(translate, row.category)
        : translate('money.uncategorised'),
      amount: row.amount,
    }))
    .sort((left, right) => right.amount - left.amount)
}
const expenseRows = computed(() => categoryRows('expense'))
const incomeRows = computed(() => categoryRows('income'))

/* ---------- list ---------- */
const filter = ref<TransactionKind | 'all'>('all')
const list = computed(() =>
  farm.value.transactions
    .filter(
      (x) =>
        inPeriod(x.date, period.value, startMonth.value) &&
        (filter.value === 'all' || x.kind === filter.value),
    )
    .sort(byNewest),
)
const tracked = computed(() =>
  trackedVintages(farm.value.extractions, farm.value.settings.seasonStartMonth),
)
function detail(x: Transaction) {
  if (x.kind === 'sale') {
    let base = `${kgFmt(x.kg ?? 0)} ${translate('common.kg')} × ${eur(x.pricePerKg ?? 0)}`
    if (x.fee) {
      base += ` · ${translate('money.feeLine', { fee: eur(x.fee) })}`
    }

    return isUntrackedSale(x, tracked.value)
      ? `${base} · ${translate('tx.notFromStock')}`
      : base
  }
  const category = farm.value.categories.find((y) => y.id === x.categoryId)

  return category ? categoryName(translate, category) : ''
}

function icon(kind: TransactionKind) {
  return { sale: '', income: '＋', expense: '−' }[kind]
}

/** Read-only for people who may only see the Money page. */
const canEditMoney = computed(() => canDo(farm.value, 'money', 'change'))
const canEditSettings = computed(() => canDo(farm.value, 'settings', 'change'))
</script>

<template>
  <main class="page money">
    <header class="page-head">
      <h1>{{ $t('nav.money') }}</h1>
    </header>

    <div class="row-between period-bar">
      <span class="muted">{{ $t('money.yearHint') }}</span>
      <YearPicker v-model="shownYear" :years="years" :label="$t('money.year')" />
    </div>

    <div v-if="canEditMoney" class="add-row">
      <button type="button" class="btn small" @click="router.push('/money/new/expense')">
        − {{ $t('money.addExpense') }}
      </button>
      <button type="button" class="btn small" @click="router.push('/money/new/sale')">
        <OilDrop /> {{ $t('money.addSale') }}
      </button>
      <button type="button" class="btn small" @click="router.push('/money/new/income')">
        + {{ $t('money.addIncome') }}
      </button>
    </div>

    <section class="card">
      <h2>{{ period.year }}</h2>
      <table class="kv">
        <tbody>
          <tr>
            <th>
              {{ $t('money.sales') }}
              <small v-if="totals.salesKg" class="muted block-line">
                {{ $t('money.soldKg', { kg: kgFmt(totals.salesKg) }) }} ·
                {{ $t('money.averagePrice', { price: eur(totals.averagePrice ?? 0) }) }}
                <template v-if="totals.salesFees">
                  · {{ $t('money.feeLine', { fee: eur(totals.salesFees) }) }}</template
                >
              </small>
            </th>
            <td>{{ eur(totals.sales) }}</td>
          </tr>
          <tr>
            <th>{{ $t('money.otherIncome') }}</th>
            <td>{{ eur(totals.otherIncome) }}</td>
          </tr>
          <tr class="strong">
            <th>{{ $t('money.income') }}</th>
            <td>{{ eur(totals.income) }}</td>
          </tr>
          <tr class="strong">
            <th>{{ $t('money.expenses') }}</th>
            <td>− {{ eur(totals.expenses) }}</td>
          </tr>
          <tr class="strong net" :class="[totals.net < 0 ? 'neg' : 'pos']">
            <th>{{ $t('money.net') }}</th>
            <td>{{ eur(totals.net) }}</td>
          </tr>
          <template v-if="farm.settings.taxPercent">
            <tr class="sub">
              <th>
                {{
                  $t('money.tax', {
                    percent: formatNumber(farm.settings.taxPercent, formatLocale, 1),
                  })
                }}
                <small v-if="totals.taxableNet !== totals.net" class="muted block-line">{{
                  $t('money.taxBase', { amount: eur(totals.taxableNet) })
                }}</small>
              </th>
              <td>− {{ eur(tax) }}</td>
            </tr>
            <tr class="strong">
              <th>{{ $t('money.afterTax') }}</th>
              <td>{{ eur(totals.net - tax) }}</td>
            </tr>
          </template>
          <tr v-if="anyStock && lastPrice">
            <th>
              {{ $t('money.stockValue') }}
              <small class="muted block-line">{{
                $t('money.stockValueLine', { kg: kgFmt(stockKg), price: eur(lastPrice) })
              }}</small>
            </th>
            <td>≈ {{ eur(stockKg * lastPrice) }}</td>
          </tr>
        </tbody>
      </table>
      <div
        v-if="anyStock && lastPrice && valueLocations.length > 1 && canEditSettings"
        class="value-places"
      >
        <span class="muted small">{{ $t('money.stockValueCounts') }}</span>
        <div class="chips tight">
          <button
            v-for="location in valueLocations"
            :key="location.id"
            type="button"
            class="chip small"
            :class="{ selected: counted.includes(location.id) }"
            :aria-pressed="counted.includes(location.id)"
            @click="toggleValueLocation(location.id)"
          >
            {{ locationName(translate, location) }}
          </button>
        </div>
      </div>
    </section>

    <section v-if="expenseRows.length" class="card">
      <h2>{{ $t('money.byCategory') }}</h2>
      <table class="kv">
        <tbody>
          <tr v-for="r in expenseRows" :key="r.name">
            <th>{{ r.name }}</th>
            <td>{{ eur(r.amount) }}</td>
          </tr>
        </tbody>
      </table>
    </section>
    <section v-if="incomeRows.length" class="card">
      <h2>{{ $t('money.incomeByCategory') }}</h2>
      <table class="kv">
        <tbody>
          <tr v-for="r in incomeRows" :key="r.name">
            <th>{{ r.name }}</th>
            <td>{{ eur(r.amount) }}</td>
          </tr>
        </tbody>
      </table>
    </section>

    <section class="card money-list">
      <div class="chips tight filter-chips">
        <button
          v-for="f in ['all', 'expense', 'sale', 'income'] as const"
          :key="f"
          type="button"
          class="chip"
          :class="[{ selected: filter === f }]"
          @click="filter = f"
        >
          {{
            f === 'all'
              ? $t('money.all')
              : f === 'expense'
                ? $t('money.expenses')
                : f === 'sale'
                  ? $t('money.sales')
                  : $t('money.otherIncome')
          }}
        </button>
      </div>
      <p v-if="!list.length" class="muted">{{ $t('money.noTransactions') }}</p>
      <ul v-else class="list tx-list">
        <li v-for="x in list" :key="x.id">
          <button
            type="button"
            class="tx-row"
            :class="[x.kind, { readonly: !canEditMoney }]"
            @click="canEditMoney && router.push(`/money/${x.id}`)"
          >
            <span class="tx-icon" aria-hidden="true">
              <OilDrop v-if="x.kind === 'sale'" />
              <template v-else>{{ icon(x.kind) }}</template>
            </span>
            <span class="tx-text">
              <strong>{{ x.party || detail(x) }}</strong>
              <small class="muted"
                >{{ day(x.date)
                }}<template v-if="x.party && detail(x)"> · {{ detail(x) }}</template
                ><template v-if="farm.settings.taxPercent && x.taxCounted === false">
                  · {{ $t('money.notForTax') }}</template
                ></small
              >
            </span>
            <span class="tx-amount"
              >{{ x.kind === 'expense' ? '−' : '+' }} {{ eur(x.amount) }}</span
            >
          </button>
        </li>
      </ul>
    </section>
  </main>
</template>
