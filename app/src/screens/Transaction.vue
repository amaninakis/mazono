<script setup lang="ts">
import { useTranslation } from 'i18next-vue';
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { seasonLabel, todayISO } from '../core/dates';
import { formatMoney, formatNumber } from '../core/format';
import { categoryForParty, defaultSaleSource, partyNames } from '../core/money';
import { stockLevels } from '../core/oil';
import type { TransactionKind } from '../core/types';
import { formatLocale } from '../i18n';
import DateField from '../ui/DateField.vue';
import Modal from '../ui/Modal.vue';
import Stepper from '../ui/Stepper.vue';
import { categoryName, locationName, useFarm } from '../ui/farm';
import { moneyPeriod } from '../ui/periods';
import { showToast } from '../ui/toast';

const { t } = useTranslation();
const farm = useFarm();
const route = useRoute();
const router = useRouter();
const today = todayISO();

const editing = route.params.id ? farm.value.transactions.find((x) => x.id === route.params.id) : undefined;
const kind: TransactionKind = editing?.kind ?? ((route.params.kind as TransactionKind) || 'expense');
const startMonth = farm.value.settings.seasonStartMonth;
const fmt = (n: number) => formatNumber(n, formatLocale.value, 1);

const title = computed(() => {
  const k = kind === 'sale' ? 'Sale' : kind === 'income' ? 'Income' : 'Expense';
  return t(editing ? `tx.edit${k}` : `tx.new${k}`);
});
const partyLabel = kind === 'sale' ? 'tx.buyer' : kind === 'income' ? 'tx.source' : 'tx.business';

/* ---------- form ---------- */
const date = ref(editing?.date ?? today);
const party = ref(editing?.party ?? '');
const categoryId = ref(editing?.categoryId ?? '');
let categoryChosen = !!editing?.categoryId;
const amount = ref<number | null>(editing && kind !== 'sale' ? editing.amount : null);
const invoiceNo = ref(editing?.invoiceNo ?? '');
const notes = ref(editing?.notes ?? '');
const error = ref('');
const newCategory = ref(false);
const newCategoryName = ref('');

const names = computed(() => partyNames(farm.value.transactions, kind));
const categories = computed(() =>
  kind === 'sale'
    ? []
    : farm.value.categories
        .filter((c) => c.kind === kind && (!c.archived || c.id === editing?.categoryId))
        .sort((a, b) => a.order - b.order),
);
if (!categoryId.value && categories.value.length) categoryId.value = categories.value[0].id;

/** Fill in the category last used with this business. */
function onPartyChange() {
  if (categoryChosen || kind === 'sale') return;
  const c = categoryForParty(farm.value.transactions, party.value, kind);
  if (c) categoryId.value = c;
}
function onCategoryChange(e: Event) {
  const sel = e.target as HTMLSelectElement;
  if (sel.value === '__new') {
    sel.value = categoryId.value;
    newCategory.value = true;
    return;
  }
  categoryId.value = sel.value;
  categoryChosen = true;
}
async function addCategory() {
  const name = newCategoryName.value.trim();
  if (!name || kind === 'sale') return;
  const c = await farm.value.repo.put('categories', { kind, name, archived: false, order: farm.value.categories.length });
  categoryId.value = c.id;
  categoryChosen = true;
  newCategory.value = false;
  newCategoryName.value = '';
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
);
const mainLocation = computed(() => farm.value.locations.slice().sort((a, b) => a.order - b.order)[0]);
const sources = computed(() =>
  Object.entries(stock.value)
    .flatMap(([v, byLoc]) =>
      Object.entries(byLoc).map(([locationId, kg]) => ({ vintage: Number(v), locationId, kg })),
    )
    .filter((s) => s.kg > 0 || (s.vintage === editing?.vintage && s.locationId === editing?.locationId))
    .sort((a, b) => a.vintage - b.vintage),
);
const startSource =
  editing?.vintage != null && editing.locationId
    ? { vintage: editing.vintage, locationId: editing.locationId }
    : defaultSaleSource(stock.value, mainLocation.value?.id);
const source = ref(startSource ? `${startSource.vintage}|${startSource.locationId}` : '');
const chosen = computed(() => {
  const [v, loc] = source.value.split('|');
  return v ? { vintage: Number(v), locationId: loc } : undefined;
});
const available = computed(() => (chosen.value ? (stock.value[chosen.value.vintage]?.[chosen.value.locationId] ?? 0) : 0));
const kg = ref<number | null>(editing?.kg ?? null);
const price = ref<number | null>(editing?.pricePerKg ?? null);
const total = computed(() => Math.round((kg.value ?? 0) * (price.value ?? 0) * 100) / 100);
const sourceLabel = (s: { vintage: number; locationId: string; kg: number }) => {
  const l = farm.value.locations.find((x) => x.id === s.locationId);
  return `${seasonLabel(s.vintage, startMonth)} · ${l ? locationName(t, l) : '?'} (${fmt(s.kg)})`;
};

/* ---------- save ---------- */
async function save() {
  error.value = '';
  if (kind === 'sale') {
    if (!kg.value || !price.value || !chosen.value) {
      error.value = sources.value.length ? t('tx.saleNothingToSave') : t('tx.noStock');
      return;
    }
    if (kg.value > available.value + 0.0001) {
      error.value = t('tx.tooMuch', { kg: fmt(available.value) });
      return;
    }
  } else if (!amount.value) {
    error.value = t('tx.nothingToSave');
    return;
  }
  await farm.value.repo.put('transactions', {
    id: editing?.id,
    date: date.value,
    kind,
    party: party.value.trim(),
    categoryId: kind === 'sale' ? undefined : categoryId.value || undefined,
    amount: kind === 'sale' ? total.value : amount.value!,
    kg: kind === 'sale' ? kg.value! : undefined,
    pricePerKg: kind === 'sale' ? price.value! : undefined,
    vintage: kind === 'sale' ? chosen.value!.vintage : undefined,
    locationId: kind === 'sale' ? chosen.value!.locationId : undefined,
    invoiceNo: kind === 'expense' ? invoiceNo.value.trim() || undefined : undefined,
    fieldId: editing?.fieldId, // no longer asked; kept on older entries
    notes: notes.value.trim() || undefined,
  });
  showPeriodOf(date.value, t('tx.saved'));
  void router.push('/money');
}

/** Open the Money page on the calendar year of this entry, and say so. */
function showPeriodOf(d: string, title: string) {
  const year = Number(d.slice(0, 4));
  moneyPeriod.year = year;
  showToast({ title, lines: [t('tx.inYear', { period: String(year) })] });
}

async function remove() {
  if (!editing) return;
  const repo = farm.value.repo;
  await repo.softDelete('transactions', editing.id);
  showToast({ title: t('tx.deleted'), action: { label: t('common.undo'), run: () => void repo.restore('transactions', editing.id) } });
  void router.push('/money');
}
</script>

<template>
  <main class="page transaction">
    <header class="page-head">
      <h1>{{ title }}</h1>
    </header>

    <section class="card">
      <div class="row-between">
        <label class="label" for="tx-date">{{ t('common.date') }}</label>
        <DateField id="tx-date" v-model="date" :label="t('common.date')" />
      </div>
      <label class="label" for="tx-party">{{ t(partyLabel) }}</label>
      <input id="tx-party" v-model="party" class="input" list="tx-parties" autocomplete="off" @change="onPartyChange" @blur="onPartyChange" />
      <datalist id="tx-parties">
        <option v-for="n in names" :key="n" :value="n" />
      </datalist>

      <template v-if="kind !== 'sale'">
        <label class="label" for="tx-category">{{ t('tx.category') }}</label>
        <select id="tx-category" class="input select" :value="categoryId" @change="onCategoryChange">
          <option v-for="c in categories" :key="c.id" :value="c.id">{{ categoryName(t, c) }}</option>
          <option value="__new">{{ t('tx.newCategory') }}</option>
        </select>
        <label class="label" for="tx-amount">{{ t('tx.amount') }}</label>
        <Stepper id="tx-amount" v-model="amount" :label="t('tx.amount')" />
      </template>

      <template v-if="kind === 'expense'">
        <label class="label" for="tx-invoice">{{ t('tx.invoiceNo') }}</label>
        <input id="tx-invoice" v-model="invoiceNo" class="input" />
      </template>
    </section>

    <section v-if="kind === 'sale'" class="card">
      <p v-if="!sources.length" class="muted">{{ t('tx.noStock') }}</p>
      <template v-else>
        <label class="label" for="tx-source">{{ t('tx.soldFrom') }}</label>
        <select id="tx-source" v-model="source" class="input select">
          <option v-for="s in sources" :key="`${s.vintage}|${s.locationId}`" :value="`${s.vintage}|${s.locationId}`">
            {{ sourceLabel(s) }}
          </option>
        </select>
        <label class="label" for="tx-kg">{{ t('tx.kg') }}</label>
        <Stepper id="tx-kg" v-model="kg" :label="t('tx.kg')" :max="available" />
        <p class="hint">{{ t('tx.available', { kg: fmt(available) }) }}</p>
        <label class="label" for="tx-price">{{ t('tx.pricePerKg') }}</label>
        <Stepper id="tx-price" v-model="price" :label="t('tx.pricePerKg')" :step="0.1" />
        <p class="result">{{ t('tx.total') }}: <strong>{{ formatMoney(total, formatLocale) }}</strong></p>
      </template>
    </section>

    <section class="card">
      <label class="label" for="tx-notes">{{ t('common.notes') }}</label>
      <textarea id="tx-notes" v-model="notes" class="input" rows="2" />
      <button v-if="editing" type="button" class="btn ghost small danger" @click="remove">{{ t('common.delete') }}</button>
    </section>

    <p v-if="error" class="error">{{ error }}</p>

    <div class="save-bar">
      <button type="button" class="btn ghost" @click="router.push('/money')">{{ t('common.cancel') }}</button>
      <button type="button" class="btn primary big" @click="save">{{ t('common.save') }}</button>
    </div>

    <Modal v-if="newCategory" :title="t('tx.newCategory')" @close="newCategory = false">
      <label class="label" for="nc-cat">{{ t('tx.newCategoryName') }}</label>
      <input id="nc-cat" v-model="newCategoryName" class="input" autofocus @keydown.enter="addCategory" />
      <div class="actions">
        <button type="button" class="btn ghost" @click="newCategory = false">{{ t('common.cancel') }}</button>
        <button type="button" class="btn primary" @click="addCategory">{{ t('today.create') }}</button>
      </div>
    </Modal>
  </main>
</template>
