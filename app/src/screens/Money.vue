<script setup lang="ts">
import { useTranslation } from 'i18next-vue';
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { parseISODate, todayISO } from '../core/dates';
import { formatMoney, formatNumber } from '../core/format';
import { inPeriod, lastSalePrice, moneyTotals, taxEstimate, type Period } from '../core/money';
import { stockLevels } from '../core/oil';
import type { Transaction, TransactionKind } from '../core/types';
import { formatLocale } from '../i18n';
import { categoryName, useFarm } from '../ui/farm';
import { moneyPeriod } from '../ui/periods';

const { t } = useTranslation();
const farm = useFarm();
const router = useRouter();
const startMonth = computed(() => farm.value.settings.seasonStartMonth);

const eur = (n: number) => formatMoney(n, formatLocale.value);
const kgFmt = (n: number) => formatNumber(n, formatLocale.value, 1);
const day = (d: string) =>
  new Intl.DateTimeFormat(formatLocale.value, { day: 'numeric', month: 'short' }).format(parseISODate(d));

/* ---------- period: calendar year ---------- */
const today = todayISO();
const yearOf = (d: string) => Number(d.slice(0, 4));
const years = computed(() =>
  [...new Set([yearOf(today), ...farm.value.transactions.map((x) => yearOf(x.date))])].sort((a, b) => b - a),
);
const period = computed<Period>(() => ({ kind: 'year', year: moneyPeriod.year ?? yearOf(today) }));

/* ---------- totals ---------- */
const totals = computed(() => moneyTotals(farm.value.transactions, period.value, startMonth.value));
const tax = computed(() => taxEstimate(totals.value.net, farm.value.settings.taxPercent));
const stockKg = computed(() =>
  Object.values(
    stockLevels(farm.value.extractions, farm.value.stockMovements, startMonth.value, farm.value.transactions),
  ).reduce((s, byLoc) => s + Object.values(byLoc).reduce((a, b) => a + b, 0), 0),
);
const lastPrice = computed(() => lastSalePrice(farm.value.transactions));

const categoryRows = (kind: 'expense' | 'income') =>
  Object.entries(totals.value.byCategory)
    .map(([id, amount]) => ({ c: farm.value.categories.find((x) => x.id === id), amount }))
    .filter((r) => (r.c ? r.c.kind === kind : kind === 'expense') && r.amount)
    .map((r) => ({ name: r.c ? categoryName(t, r.c) : t('money.uncategorised'), amount: r.amount }))
    .sort((a, b) => b.amount - a.amount);
const expenseRows = computed(() => categoryRows('expense'));
const incomeRows = computed(() => categoryRows('income'));

/* ---------- list ---------- */
const filter = ref<TransactionKind | 'all'>('all');
const list = computed(() =>
  farm.value.transactions
    .filter((x) => inPeriod(x.date, period.value, startMonth.value) && (filter.value === 'all' || x.kind === filter.value))
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.updatedAt - a.updatedAt)),
);
function detail(x: Transaction) {
  if (x.kind === 'sale') return `${kgFmt(x.kg ?? 0)} ${t('common.kg')} × ${eur(x.pricePerKg ?? 0)}`;
  const c = farm.value.categories.find((y) => y.id === x.categoryId);
  return c ? categoryName(t, c) : '';
}
const icon = (k: TransactionKind) => (k === 'sale' ? '💧' : k === 'income' ? '＋' : '−');
</script>

<template>
  <main class="page money">
    <header class="page-head">
      <h1>{{ t('nav.money') }}</h1>
    </header>

    <div class="row-between period-bar">
      <span class="muted">{{ t('money.yearHint') }}</span>
      <select
        class="input select season-select"
        :aria-label="t('money.year')"
        :value="period.year"
        @change="(e) => (moneyPeriod.year = Number((e.target as HTMLSelectElement).value))"
      >
        <option v-for="y in years" :key="y" :value="y">{{ y }}</option>
      </select>
    </div>

    <div class="add-row">
      <button type="button" class="btn small" @click="router.push('/money/new/expense')">− {{ t('money.addExpense') }}</button>
      <button type="button" class="btn small" @click="router.push('/money/new/sale')">💧 {{ t('money.addSale') }}</button>
      <button type="button" class="btn small" @click="router.push('/money/new/income')">+ {{ t('money.addIncome') }}</button>
    </div>

    <section class="card">
      <h2>{{ period.year }}</h2>
      <table class="kv">
        <tbody>
          <tr>
            <th>
              {{ t('money.sales') }}
              <small v-if="totals.salesKg" class="muted block-line">
                {{ t('money.soldKg', { kg: kgFmt(totals.salesKg) }) }} ·
                {{ t('money.averagePrice', { price: eur(totals.averagePrice ?? 0) }) }}
              </small>
            </th>
            <td>{{ eur(totals.sales) }}</td>
          </tr>
          <tr><th>{{ t('money.otherIncome') }}</th><td>{{ eur(totals.otherIncome) }}</td></tr>
          <tr class="strong"><th>{{ t('money.income') }}</th><td>{{ eur(totals.income) }}</td></tr>
          <tr class="strong"><th>{{ t('money.expenses') }}</th><td>− {{ eur(totals.expenses) }}</td></tr>
          <tr :class="['strong', 'net', totals.net < 0 ? 'neg' : 'pos']">
            <th>{{ t('money.net') }}</th><td>{{ eur(totals.net) }}</td>
          </tr>
          <template v-if="farm.settings.taxPercent">
            <tr class="sub"><th>{{ t('money.tax', { percent: formatNumber(farm.settings.taxPercent, formatLocale, 1) }) }}</th><td>− {{ eur(tax) }}</td></tr>
            <tr class="strong"><th>{{ t('money.afterTax') }}</th><td>{{ eur(totals.net - tax) }}</td></tr>
          </template>
          <tr v-if="stockKg > 0.05 && lastPrice">
            <th>
              {{ t('money.stockValue') }}
              <small class="muted block-line">{{ t('money.stockValueLine', { kg: kgFmt(stockKg), price: eur(lastPrice) }) }}</small>
            </th>
            <td>≈ {{ eur(stockKg * lastPrice) }}</td>
          </tr>
        </tbody>
      </table>
    </section>

    <section v-if="expenseRows.length" class="card">
      <h2>{{ t('money.byCategory') }}</h2>
      <table class="kv">
        <tbody>
          <tr v-for="r in expenseRows" :key="r.name"><th>{{ r.name }}</th><td>{{ eur(r.amount) }}</td></tr>
        </tbody>
      </table>
    </section>
    <section v-if="incomeRows.length" class="card">
      <h2>{{ t('money.incomeByCategory') }}</h2>
      <table class="kv">
        <tbody>
          <tr v-for="r in incomeRows" :key="r.name"><th>{{ r.name }}</th><td>{{ eur(r.amount) }}</td></tr>
        </tbody>
      </table>
    </section>

    <section class="card">
      <div class="chips tight filter-chips">
        <button
          v-for="f in ['all', 'expense', 'sale', 'income'] as const"
          :key="f"
          type="button"
          :class="['chip', { selected: filter === f }]"
          @click="filter = f"
        >
          {{ f === 'all' ? t('money.all') : f === 'expense' ? t('money.expenses') : f === 'sale' ? t('money.sales') : t('money.otherIncome') }}
        </button>
      </div>
      <p v-if="!list.length" class="muted">{{ t('money.noTransactions') }}</p>
      <ul v-else class="list tx-list">
        <li v-for="x in list" :key="x.id">
          <button type="button" :class="['tx-row', x.kind]" @click="router.push(`/money/${x.id}`)">
            <span class="tx-icon" aria-hidden="true">{{ icon(x.kind) }}</span>
            <span class="tx-text">
              <strong>{{ x.party || detail(x) }}</strong>
              <small class="muted">{{ day(x.date) }}<template v-if="x.party && detail(x)"> · {{ detail(x) }}</template></small>
            </span>
            <span class="tx-amount">{{ x.kind === 'expense' ? '−' : '+' }} {{ eur(x.amount) }}</span>
          </button>
        </li>
      </ul>
    </section>
  </main>
</template>
