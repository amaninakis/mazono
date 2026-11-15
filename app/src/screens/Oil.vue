<script setup lang="ts">
import { useTranslation } from 'i18next-vue';
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { parseISODate, seasonLabel, seasonOf, todayISO } from '../core/dates';
import { formatNumber, formatYield } from '../core/format';
import { chargeShare, chargesKg, netOil, oilByEntry, seasonTotals, stockLevels, unitWeights } from '../core/oil';
import type { StockMovement, Transaction } from '../core/types';
import { formatLocale } from '../i18n';
import StockMoveModal from '../ui/StockMoveModal.vue';
import { chargeName, locationName, useFarm } from '../ui/farm';
import { oilPeriod } from '../ui/periods';
import { showToast } from '../ui/toast';

const { t } = useTranslation();
const farm = useFarm();
const router = useRouter();
const startMonth = computed(() => farm.value.settings.seasonStartMonth);

const fmt = (n: number, d = 1) => formatNumber(n, formatLocale.value, d);
const yieldOf = (olives: number, oil: number) =>
  formatYield(olives, oil, farm.value.settings.yieldFormat, formatLocale.value);
const pct = (part: number, whole: number) => fmt(chargeShare(part, whole) * 100) + '%';
const day = (d: string) =>
  new Intl.DateTimeFormat(formatLocale.value, { day: 'numeric', month: 'short', year: 'numeric' }).format(parseISODate(d));

/* ---------- season ---------- */
const currentSeason = seasonOf(todayISO(), startMonth.value);
const seasons = computed(() => {
  const set = new Set([currentSeason, ...farm.value.extractions.map((x) => seasonOf(x.date, startMonth.value))]);
  return [...set].sort((a, b) => b - a);
});
const season = computed({
  get: () => oilPeriod.season ?? currentSeason,
  set: (v: number) => (oilPeriod.season = v),
});

const extractions = computed(() =>
  farm.value.extractions
    .filter((x) => seasonOf(x.date, startMonth.value) === season.value)
    .sort((a, b) => (a.date < b.date ? 1 : -1)),
);
const totals = computed(() => seasonTotals(farm.value.extractions, season.value, startMonth.value));
const chargeRows = computed(() =>
  farm.value.chargeTypes
    .filter((c) => totals.value.byCharge[c.id])
    .sort((a, b) => a.order - b.order)
    .map((c) => ({ name: chargeName(t, c), kg: totals.value.byCharge[c.id] })),
);
const millName = (id?: string) => farm.value.mills.find((m) => m.id === id)?.name;

/** Estimated oil per field this season, from the harvest days linked to each extraction. */
const perField = computed(() => {
  const weights = unitWeights(farm.value.units, farm.value.extractions);
  const entryField = new Map(farm.value.entries.map((e) => [e.id, e.fieldId]));
  const acc: Record<string, { oil: number; net: number }> = {};
  for (const x of extractions.value) {
    for (const [entryId, o] of Object.entries(oilByEntry(x, weights))) {
      const f = entryField.get(entryId);
      if (!f) continue;
      const a = (acc[f] ??= { oil: 0, net: 0 });
      a.oil += o.oil;
      a.net += o.net;
    }
  }
  return farm.value.fields
    .filter((f) => acc[f.id])
    .map((f) => ({ field: f, ...acc[f.id], perTree: f.trees ? acc[f.id].oil / f.trees : null }))
    .sort((a, b) => b.oil - a.oil);
});

/* ---------- stock ---------- */
const locations = computed(() => farm.value.locations.slice().sort((a, b) => a.order - b.order));
const stock = computed(() =>
  stockLevels(farm.value.extractions, farm.value.stockMovements, startMonth.value, farm.value.transactions),
);
const stockRows = computed(() =>
  Object.entries(stock.value)
    .map(([v, byLoc]) => ({ vintage: Number(v), byLoc, total: Object.values(byLoc).reduce((s, x) => s + x, 0) }))
    .filter((r) => Math.abs(r.total) > 0.001 || Object.values(r.byLoc).some((x) => Math.abs(x) > 0.001))
    .sort((a, b) => b.vintage - a.vintage),
);
const usedLocations = computed(() =>
  locations.value.filter((l) => !l.archived || stockRows.value.some((r) => r.byLoc[l.id])),
);
const stockTotal = computed(() => stockRows.value.reduce((s, r) => s + r.total, 0));

const moveKind = ref<'transfer' | 'ownUse' | null>(null);
/** Recent stock movements, including oil sales (which are edited on the Money page). */
type Move = { m?: StockMovement; sale?: Transaction; date: string; vintage: number; updatedAt: number };
const movements = computed<Move[]>(() =>
  [
    ...farm.value.stockMovements.map((m) => ({ m, date: m.date, vintage: m.vintage, updatedAt: m.updatedAt })),
    ...farm.value.transactions
      .filter((x) => x.kind === 'sale' && x.vintage != null)
      .map((x) => ({ sale: x, date: x.date, vintage: x.vintage!, updatedAt: x.updatedAt })),
  ]
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.updatedAt - a.updatedAt))
    .slice(0, 10),
);
const locName = (id?: string) => {
  const l = farm.value.locations.find((x) => x.id === id);
  return l ? locationName(t, l) : '?';
};
function moveLine(m: StockMovement) {
  return m.kind === 'transfer'
    ? t('move.transferLine', { kg: fmt(m.kg), from: locName(m.fromLocationId), to: locName(m.toLocationId) })
    : t('move.ownUseLine', { kg: fmt(m.kg), from: locName(m.fromLocationId) });
}
async function removeMove(m: StockMovement) {
  const repo = farm.value.repo;
  await repo.softDelete('stockMovements', m.id);
  showToast({ title: t('journal.deleted'), action: { label: t('common.undo'), run: () => void repo.restore('stockMovements', m.id) } });
}
</script>

<template>
  <main class="page oil">
    <header class="page-head row-between">
      <h1>{{ t('nav.oil') }}</h1>
      <select v-model="season" class="input select season-select" :aria-label="t('oil.season')">
        <option v-for="s in seasons" :key="s" :value="s">{{ t('oil.season') }} {{ seasonLabel(s, startMonth) }}</option>
      </select>
    </header>

    <RouterLink to="/oil/new" class="btn primary big block">+ {{ t('oil.newExtraction') }}</RouterLink>

    <!-- Season totals -->
    <section v-if="totals.count" class="card">
      <h2>{{ t('oil.total') }} · {{ seasonLabel(season, startMonth) }}</h2>
      <table class="kv">
        <tbody>
          <tr><th>{{ t('oil.olives') }}</th><td>{{ fmt(totals.oliveKg, 0) }} {{ t('common.kg') }}</td></tr>
          <tr><th>{{ t('oil.oil') }}</th><td>{{ fmt(totals.oilKg) }} {{ t('common.kg') }}</td></tr>
          <tr><th>{{ t('oil.yield') }}</th><td>{{ yieldOf(totals.oliveKg, totals.oilKg) }}</td></tr>
          <tr v-for="c in chargeRows" :key="c.name" class="sub">
            <th>{{ c.name }}</th><td>{{ fmt(c.kg) }} {{ t('common.kg') }} · {{ pct(c.kg, totals.oilKg) }}</td>
          </tr>
          <tr class="strong"><th>{{ t('oil.net') }}</th><td>{{ fmt(totals.netKg) }} {{ t('common.kg') }}</td></tr>
        </tbody>
      </table>
    </section>

    <!-- Extractions -->
    <section class="card">
      <h2>{{ t('oil.extractions') }}</h2>
      <p v-if="!extractions.length" class="muted">{{ t('oil.noExtractions') }}</p>
      <ul v-else class="list">
        <li v-for="x in extractions" :key="x.id">
          <button type="button" class="x-card" @click="router.push(`/oil/${x.id}`)">
            <strong>{{ day(x.date) }}<template v-if="millName(x.millId)"> · {{ millName(x.millId) }}</template></strong>
            <span>
              {{ fmt(x.oliveKg, 0) }} → {{ fmt(x.oilKg) }} {{ t('common.kg') }} · {{ yieldOf(x.oliveKg, x.oilKg) }}
            </span>
            <small class="muted">
              <template v-if="x.charges.length">{{ t('oil.charges') }} {{ fmt(chargesKg(x)) }} ({{ pct(chargesKg(x), x.oilKg) }}) · </template>
              {{ t('oil.net') }} {{ fmt(netOil(x)) }} {{ t('common.kg') }}
              <template v-if="x.acidity != null"> · {{ t('oil.acidity') }} {{ fmt(x.acidity, 2) }}</template>
            </small>
          </button>
        </li>
      </ul>
    </section>

    <!-- Oil per field -->
    <section v-if="perField.length" class="card">
      <h2>{{ t('oil.fieldsEstimate') }}</h2>
      <table class="kv">
        <tbody>
          <tr v-for="f in perField" :key="f.field.id">
            <th>{{ f.field.name }}</th>
            <td>
              ≈ {{ fmt(f.oil) }} {{ t('common.kg') }}
              <small v-if="f.perTree != null" class="muted"><br />{{ t('oil.perTree', { kg: fmt(f.perTree, 2) }) }}</small>
            </td>
          </tr>
        </tbody>
      </table>
    </section>

    <!-- Stock -->
    <section class="card">
      <h2>{{ t('oil.stock') }}</h2>
      <p v-if="!stockRows.length" class="muted">{{ t('oil.noStock') }}</p>
      <div v-else class="table-wrap">
        <table class="grid">
          <thead>
            <tr>
              <th>{{ t('oil.season') }}</th>
              <th v-for="l in usedLocations" :key="l.id">{{ locationName(t, l) }}</th>
              <th>{{ t('oil.total') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in stockRows" :key="r.vintage">
              <th>{{ seasonLabel(r.vintage, startMonth) }}</th>
              <td v-for="l in usedLocations" :key="l.id">{{ r.byLoc[l.id] ? fmt(r.byLoc[l.id]) : '–' }}</td>
              <td><strong>{{ fmt(r.total) }}</strong></td>
            </tr>
          </tbody>
          <tfoot v-if="stockRows.length > 1">
            <tr>
              <th>{{ t('oil.total') }}</th>
              <td v-for="l in usedLocations" :key="l.id">
                {{ fmt(stockRows.reduce((s, r) => s + (r.byLoc[l.id] ?? 0), 0)) }}
              </td>
              <td><strong>{{ fmt(stockTotal) }}</strong></td>
            </tr>
          </tfoot>
        </table>
      </div>
      <div v-if="stockRows.length" class="actions wrap">
        <button type="button" class="btn small" @click="moveKind = 'transfer'">⇄ {{ t('oil.transfer') }}</button>
        <button type="button" class="btn small" @click="moveKind = 'ownUse'">{{ t('oil.ownUse') }}</button>
      </div>
      <template v-if="movements.length">
        <span class="label">{{ t('oil.movements') }}</span>
        <ul class="list moves">
          <li v-for="mv in movements" :key="(mv.m ?? mv.sale)!.id" class="row-between">
            <span>
              <small class="muted">{{ day(mv.date) }} · {{ seasonLabel(mv.vintage, startMonth) }}</small><br />
              <template v-if="mv.m">{{ moveLine(mv.m) }}</template>
              <RouterLink v-else :to="`/money/${mv.sale!.id}`">
                {{ t('oil.saleLine', { kg: fmt(mv.sale!.kg ?? 0), party: mv.sale!.party || '–' }) }}
              </RouterLink>
            </span>
            <button v-if="mv.m" type="button" class="icon-btn" :aria-label="t('common.delete')" @click="removeMove(mv.m)">🗑</button>
          </li>
        </ul>
      </template>
    </section>

    <StockMoveModal v-if="moveKind" :kind="moveKind" :stock="stock" @close="moveKind = null" />
  </main>
</template>
