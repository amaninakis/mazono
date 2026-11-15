<script setup lang="ts">
import { useTranslation } from 'i18next-vue';
import { computed, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { parseISODate, seasonOf, todayISO } from '../core/dates';
import { formatNumber, formatYield } from '../core/format';
import {
  allocatedUnits,
  availableUnits,
  batchTrees,
  chargeFromPercent,
  chargeShare,
  previousExtractionDate,
} from '../core/oil';
import type { TaskEntry, UnitAmount } from '../core/types';
import { unitLabel } from '../core/units';
import { locale } from '../i18n';
import Modal from '../ui/Modal.vue';
import Stepper from '../ui/Stepper.vue';
import { chargeName, locationName, useFarm } from '../ui/farm';
import { showToast } from '../ui/toast';

const { t } = useTranslation();
const farm = useFarm();
const route = useRoute();
const router = useRouter();
const today = todayISO();

const editId = route.params.id as string | undefined;
const editing = editId ? farm.value.extractions.find((x) => x.id === editId) : undefined;

const fmt = (n: number, d = 1) => formatNumber(n, locale.value, d);
const r3 = (n: number) => Math.round(n * 1000) / 1000;

/* ---------- reference data ---------- */
const mills = computed(() => farm.value.mills.filter((m) => !m.archived || m.id === editing?.millId));
const chargeTypes = computed(() =>
  farm.value.chargeTypes
    .filter((c) => !c.archived || editing?.charges.some((x) => x.chargeTypeId === c.id))
    .sort((a, b) => a.order - b.order),
);
const locations = computed(() => farm.value.locations.filter((l) => !l.archived).sort((a, b) => a.order - b.order));
const mainLocation = computed(() => locations.value[0]);
const otherLocations = computed(() => locations.value.slice(1));
const unitById = (id: string) => farm.value.units.find((u) => u.id === id);
const fieldName = (id: string) => farm.value.fields.find((f) => f.id === id)?.name ?? '?';
const harvestTypeIds = computed(
  () => new Set(farm.value.taskTypes.filter((x) => x.inputKind === 'harvest').map((x) => x.id)),
);

/* ---------- form state ---------- */
const lastMill = [...farm.value.extractions].sort((a, b) => (a.date < b.date ? 1 : -1)).find((x) => x.millId)?.millId;
const date = ref(editing?.date ?? today);
const millId = ref(editing?.millId ?? lastMill ?? mills.value[0]?.id ?? '');
const receiptNo = ref(editing?.receiptNo ?? '');
const oliveKg = ref<number | null>(editing?.oliveKg ?? null);
const oilKg = ref<number | null>(editing?.oilKg ?? null);
const acidity = ref<number | null>(editing?.acidity ?? null);
const notes = ref(editing?.notes ?? '');
const error = ref('');
const newMill = ref(false);
const newMillName = ref('');
const newCharge = ref(false);
const newChargeName = ref('');

/** kg per charge type, and which ones the user typed (those are not recalculated from %). */
const charges = reactive<Record<string, number | null>>({});
const manualCharge = new Set<string>();
for (const c of editing?.charges ?? []) {
  charges[c.chargeTypeId] = c.kg;
  manualCharge.add(c.chargeTypeId);
}
watch(
  [oilKg, chargeTypes],
  () => {
    for (const c of chargeTypes.value) {
      if (manualCharge.has(c.id) || !c.defaultPercent) continue;
      charges[c.id] = oilKg.value ? chargeFromPercent(c.defaultPercent, oilKg.value) : null;
    }
  },
  { immediate: true },
);
function setCharge(id: string, v: number | null) {
  charges[id] = v;
  manualCharge.add(id);
}

const totalCharges = computed(() => Object.values(charges).reduce<number>((s, v) => s + (v ?? 0), 0));
const net = computed(() => Math.max((oilKg.value ?? 0) - totalCharges.value, 0));

/** Oil kept in the other locations; the main location gets the rest. */
const stored = reactive<Record<string, number | null>>({});
for (const s of editing?.storage ?? []) if (s.locationId !== mainLocation.value?.id) stored[s.locationId] = s.kg;
const storedElsewhere = computed(() => otherLocations.value.reduce((s, l) => s + (stored[l.id] ?? 0), 0));
const storedMain = computed(() => r3(net.value - storedElsewhere.value));

const yieldText = computed(() =>
  formatYield(oliveKg.value ?? 0, oilKg.value ?? 0, farm.value.settings.yieldFormat, locale.value),
);

/* ---------- harvest days ---------- */
interface Row {
  entry: TaskEntry;
  available: UnitAmount[];
  selected: boolean;
  partial: boolean;
  take: UnitAmount[];
}

const previous = previousExtractionDate(farm.value.extractions, date.value, editing?.id);
const season = seasonOf(date.value, farm.value.settings.seasonStartMonth);
const rows = ref<Row[]>(
  farm.value.entries
    .filter((e) => harvestTypeIds.value.has(e.taskTypeId) && e.quantities?.some((q) => q.amount > 0))
    .map((entry) => {
      const available = availableUnits(entry, farm.value.extractions, editing?.id);
      const mine = editing?.allocations.find((a) => a.entryId === entry.id);
      const full = (q: UnitAmount[]) => q.map((x) => ({ ...x }));
      // Pre-tick this season's harvest days since the previous extraction, and leftovers of days
      // already partly sent to the mill.
      const partlyMilled = Object.keys(allocatedUnits(entry.id, farm.value.extractions, editing?.id)).length > 0;
      const sameSeason = seasonOf(entry.date, farm.value.settings.seasonStartMonth) === season;
      const preTick =
        !editing && sameSeason && entry.date <= date.value && (!previous || entry.date >= previous || partlyMilled);
      return {
        entry,
        available,
        selected: mine ? true : preTick && available.length > 0,
        partial: mine ? !sameUnits(mine.quantities, available) : false,
        take: mine ? full(mine.quantities) : full(available),
      };
    })
    .filter(
      (r) =>
        r.selected ||
        (r.available.length > 0 && seasonOf(r.entry.date, farm.value.settings.seasonStartMonth) === season),
    )
    .sort((a, b) => (a.entry.date < b.entry.date ? 1 : a.entry.date > b.entry.date ? -1 : 0)),
);

function sameUnits(a: UnitAmount[], b: UnitAmount[]) {
  return a.length === b.length && a.every((q) => b.some((x) => x.unitId === q.unitId && x.amount === q.amount));
}

const unitsText = (qs: UnitAmount[]) =>
  qs
    .filter((q) => q.amount > 0)
    .map((q) => `${fmt(q.amount, 2)} ${unitLabel(unitById(q.unitId), q.amount)}`)
    .join(' + ');

const rowDate = (d: string) =>
  new Intl.DateTimeFormat(locale.value, { day: 'numeric', month: 'short' }).format(parseISODate(d));

function togglePart(r: Row) {
  r.partial = !r.partial;
  if (!r.partial) r.take = r.available.map((q) => ({ ...q }));
  r.selected = true;
}

const allocations = computed(() =>
  rows.value
    .filter((r) => r.selected)
    .map((r) => ({
      entryId: r.entry.id,
      quantities: (r.partial ? r.take : r.available).filter((q) => q.amount > 0).map((q) => ({ ...q })),
    }))
    .filter((a) => a.quantities.length),
);
const selectedUnits = computed(() => {
  const out: Record<string, number> = {};
  for (const q of allocations.value.flatMap((a) => a.quantities)) out[q.unitId] = (out[q.unitId] ?? 0) + q.amount;
  return Object.entries(out).map(([unitId, amount]) => ({ unitId, amount }));
});
const perUnit = computed(() => {
  const u = selectedUnits.value;
  if (u.length !== 1 || !oliveKg.value || !u[0].amount) return '';
  return t('extraction.perUnit', { kg: fmt(oliveKg.value / u[0].amount), unit: unitLabel(unitById(u[0].unitId), 1).toLowerCase() });
});

/* ---------- actions ---------- */
async function addMill() {
  const name = newMillName.value.trim();
  if (!name) return;
  const m = await farm.value.repo.put('mills', { name, archived: false });
  millId.value = m.id;
  newMill.value = false;
  newMillName.value = '';
}

async function addCharge() {
  const name = newChargeName.value.trim();
  if (!name) return;
  await farm.value.repo.put('chargeTypes', { name, archived: false, order: farm.value.chargeTypes.length });
  newCharge.value = false;
  newChargeName.value = '';
}

function onMillChange(e: Event) {
  const sel = e.target as HTMLSelectElement;
  if (sel.value === '__new') {
    sel.value = millId.value;
    newMill.value = true;
  } else millId.value = sel.value;
}

async function save() {
  if (!oliveKg.value || !oilKg.value) {
    error.value = t('extraction.nothingToSave');
    return;
  }
  if (storedMain.value < 0) {
    error.value = t('extraction.storedTooMuch');
    return;
  }
  error.value = '';
  const storage = [
    ...(mainLocation.value ? [{ locationId: mainLocation.value.id, kg: storedMain.value }] : []),
    ...otherLocations.value.map((l) => ({ locationId: l.id, kg: stored[l.id] ?? 0 })),
  ].filter((s) => s.kg > 0);
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
  });

  const lines = [t('extraction.summaryNet', { yield: yieldText.value, net: fmt(net.value) })];
  if (perUnit.value) lines.push(perUnit.value);
  const trees = batchTrees(saved, farm.value.entries);
  if (trees > 0) lines.push(t('extraction.summaryTree', { kg: fmt(saved.oilKg / trees, 2) }));
  showToast({ title: editing ? t('extraction.updated') : t('extraction.saved'), lines });
  void router.push('/oil');
}

async function remove() {
  if (!editing) return;
  const repo = farm.value.repo;
  await repo.softDelete('extractions', editing.id);
  showToast({ title: t('extraction.deleted'), action: { label: t('common.undo'), run: () => void repo.restore('extractions', editing.id) } });
  void router.push('/oil');
}
</script>

<template>
  <main class="page extraction">
    <header class="page-head">
      <h1>{{ editing ? t('extraction.editTitle') : t('extraction.title') }}</h1>
    </header>

    <!-- 1. Basics -->
    <section class="card">
      <div class="row-between">
        <label class="label" for="x-date">{{ t('common.date') }}</label>
        <input id="x-date" v-model="date" type="date" class="input date" :max="today" />
      </div>
      <label class="label" for="x-mill">{{ t('extraction.mill') }}</label>
      <select id="x-mill" class="input select" :value="millId" @change="onMillChange">
        <option value="">–</option>
        <option v-for="m in mills" :key="m.id" :value="m.id">{{ m.name }}</option>
        <option value="__new">{{ t('extraction.newMill') }}</option>
      </select>
      <label class="label" for="x-receipt">{{ t('extraction.receiptNo') }}</label>
      <input id="x-receipt" v-model="receiptNo" class="input" />
      <label class="label" for="x-olives">{{ t('extraction.oliveKg') }}</label>
      <Stepper id="x-olives" v-model="oliveKg" :label="t('extraction.oliveKg')" :step="10" />
      <label class="label" for="x-oil">{{ t('extraction.oilKg') }}</label>
      <Stepper id="x-oil" v-model="oilKg" :label="t('extraction.oilKg')" />
      <p class="result" aria-live="polite">{{ t('extraction.yieldValue', { value: yieldText }) }}</p>
      <label class="label" for="x-acidity">{{ t('extraction.acidity') }}</label>
      <Stepper id="x-acidity" v-model="acidity" :label="t('extraction.acidity')" :step="0.1" />
    </section>

    <!-- 2. Charges -->
    <section class="card">
      <h2>{{ t('extraction.chargesTitle') }}</h2>
      <p class="muted small">{{ t('extraction.chargesHelp') }}</p>
      <div v-for="c in chargeTypes" :key="c.id" class="charge-row">
        <span class="label">{{ chargeName(t, c) }}</span>
        <div class="qty-row">
          <Stepper
            :model-value="charges[c.id] ?? null"
            :label="chargeName(t, c)"
            @update:model-value="(v) => setCharge(c.id, v)"
          />
          <span class="pct">{{ oilKg && charges[c.id] ? formatNumber(chargeShare(charges[c.id]!, oilKg) * 100, locale, 1) + '%' : '' }}</span>
        </div>
      </div>
      <button type="button" class="btn ghost small" @click="newCharge = true">+ {{ t('extraction.addCharge') }}</button>
      <p class="result">{{ t('extraction.netOil') }}: <strong>{{ fmt(net) }} {{ t('common.kg') }}</strong></p>
    </section>

    <!-- 3. Where the oil went -->
    <section class="card">
      <h2>{{ t('extraction.whereTitle') }}</h2>
      <div v-for="l in otherLocations" :key="l.id">
        <span class="label">{{ locationName(t, l) }}</span>
        <Stepper v-model="stored[l.id]" :label="locationName(t, l)" :max="net" />
      </div>
      <p v-if="mainLocation" class="result">
        {{ locationName(t, mainLocation) }} ({{ t('extraction.rest') }}):
        <strong>{{ fmt(Math.max(storedMain, 0)) }} {{ t('common.kg') }}</strong>
      </p>
    </section>

    <!-- 4. Harvest days -->
    <section class="card">
      <h2>{{ t('extraction.harvestTitle') }}</h2>
      <p class="muted small">{{ t('extraction.harvestHelp') }}</p>
      <p v-if="rows.length === 0" class="muted">{{ t('extraction.noHarvest') }}</p>
      <ul v-else class="list harvest-rows">
        <li v-for="r in rows" :key="r.entry.id" :class="['harvest-row', { on: r.selected }]">
          <div class="hr-main">
            <label class="check">
              <input v-model="r.selected" type="checkbox" />
              <span>
                <strong>{{ rowDate(r.entry.date) }} · {{ fieldName(r.entry.fieldId) }}</strong>
                <small class="muted">
                  {{ unitsText(r.available) }}
                  <template v-if="!sameUnits(r.available, r.entry.quantities ?? [])">
                    ({{ t('extraction.of', { total: unitsText(r.entry.quantities ?? []) }) }})
                  </template>
                </small>
              </span>
            </label>
            <button type="button" :class="['btn', 'small', r.partial ? 'primary' : 'ghost']" @click="togglePart(r)">
              {{ t('extraction.part') }}
            </button>
          </div>
          <div v-if="r.partial && r.selected" class="hr-part">
            <div v-for="(q, i) in r.take" :key="q.unitId">
              <span class="label small">{{ unitLabel(unitById(q.unitId), 2) }} ({{ t('extraction.of', { total: fmt(r.available[i]?.amount ?? 0, 2) }) }})</span>
              <Stepper v-model="q.amount" :label="unitById(q.unitId)?.name ?? ''" :max="r.available[i]?.amount" half />
            </div>
          </div>
        </li>
      </ul>
      <p v-if="selectedUnits.length" class="result">
        {{ t('extraction.selected', { units: unitsText(selectedUnits) }) }}
        <br v-if="perUnit" />
        <span v-if="perUnit" class="muted">{{ perUnit }}</span>
      </p>
    </section>

    <section class="card">
      <label class="label" for="x-notes">{{ t('common.notes') }}</label>
      <textarea id="x-notes" v-model="notes" class="input" rows="2" />
      <button v-if="editing" type="button" class="btn ghost small danger" @click="remove">{{ t('common.delete') }}</button>
    </section>

    <p v-if="error" class="error">{{ error }}</p>

    <div class="save-bar">
      <button type="button" class="btn ghost" @click="router.push('/oil')">{{ t('common.cancel') }}</button>
      <button type="button" class="btn primary big" @click="save">{{ t('common.save') }}</button>
    </div>

    <Modal v-if="newMill" :title="t('extraction.newMill')" @close="newMill = false">
      <label class="label" for="nm-name">{{ t('extraction.newMillName') }}</label>
      <input id="nm-name" v-model="newMillName" class="input" autofocus @keydown.enter="addMill" />
      <div class="actions">
        <button type="button" class="btn ghost" @click="newMill = false">{{ t('common.cancel') }}</button>
        <button type="button" class="btn primary" @click="addMill">{{ t('today.create') }}</button>
      </div>
    </Modal>
    <Modal v-if="newCharge" :title="t('extraction.addCharge')" @close="newCharge = false">
      <label class="label" for="nc-name">{{ t('extraction.newChargeName') }}</label>
      <input id="nc-name" v-model="newChargeName" class="input" autofocus @keydown.enter="addCharge" />
      <div class="actions">
        <button type="button" class="btn ghost" @click="newCharge = false">{{ t('common.cancel') }}</button>
        <button type="button" class="btn primary" @click="addCharge">{{ t('today.create') }}</button>
      </div>
    </Modal>
  </main>
</template>
