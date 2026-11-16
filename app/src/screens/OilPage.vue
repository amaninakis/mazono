<script setup lang="ts">
import type { StockMovement, Transaction } from '../core/types'
import { useTranslation } from 'i18next-vue'
import { computed, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { byNewest, parseISODate, seasonLabel, seasonOf, todayISO } from '../core/dates'
import { formatNumber, formatYield } from '../core/format'
import {
  chargeShare,
  chargesKg,
  isUntrackedSale,
  netOil,
  oilByEntry,
  seasonTotals,
  stockLevels,
  trackedVintages,
  unitWeights,
} from '../core/oil'
import { formatLocale } from '../i18n'
import { chargeName, locationName, useFarm } from '../ui/farm'
import { oilPeriod } from '../ui/periods'
import StockMoveModal from '../ui/StockMoveModal.vue'
import { showToast } from '../ui/toast'
import YearPicker from '../ui/YearPicker.vue'

const { t: translate } = useTranslation()
const farm = useFarm()
const router = useRouter()
const startMonth = computed(() => farm.value.settings.seasonStartMonth)

function fmt(value: number, decimals = 1) {
  return formatNumber(value, formatLocale.value, decimals)
}

function yieldOf(olives: number, oil: number) {
  return formatYield(olives, oil, farm.value.settings.yieldFormat, formatLocale.value)
}

function pct(part: number, whole: number) {
  return `${fmt(chargeShare(part, whole) * 100)}%`
}

function day(isoDate: string) {
  return new Intl.DateTimeFormat(formatLocale.value, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(parseISODate(isoDate))
}

/* ---------- season ---------- */
const currentSeason = seasonOf(todayISO(), startMonth.value)
const seasons = computed(() => {
  const set = new Set([
    currentSeason,
    ...farm.value.extractions.map((x) => seasonOf(x.date, startMonth.value)),
  ])

  return [...set].sort((left, right) => right - left)
})
const season = computed({
  get: () => oilPeriod.season ?? currentSeason,
  set: (value: number) => (oilPeriod.season = value),
})

const extractions = computed(() =>
  farm.value.extractions
    .filter((x) => seasonOf(x.date, startMonth.value) === season.value)
    .sort((left, right) => (left.date < right.date ? 1 : -1)),
)
const totals = computed(() =>
  seasonTotals(farm.value.extractions, season.value, startMonth.value),
)
const chargeRows = computed(() =>
  farm.value.chargeTypes
    .filter((chargeType) => totals.value.byCharge[chargeType.id])
    .sort((left, right) => left.order - right.order)
    .map((chargeType) => ({
      name: chargeName(translate, chargeType),
      kg: totals.value.byCharge[chargeType.id],
    })),
)
function millName(id?: string) {
  return farm.value.mills.find((mill) => mill.id === id)?.name
}

/** Estimated oil per field this season, from the harvest days linked to each extraction. */
const perField = computed(() => {
  const weights = unitWeights(farm.value.units, farm.value.extractions)
  const entryField = new Map(farm.value.entries.map((entry) => [entry.id, entry.fieldId]))
  const acc: Record<string, { oil: number; net: number }> = {}
  for (const x of extractions.value) {
    for (const [entryId, oil] of Object.entries(oilByEntry(x, weights))) {
      const fieldId = entryField.get(entryId)
      if (!fieldId) {
        continue
      }
      const fieldOil = (acc[fieldId] ??= { oil: 0, net: 0 })
      fieldOil.oil += oil.oil
      fieldOil.net += oil.net
    }
  }

  return farm.value.fields
    .filter((field) => acc[field.id])
    .map((field) => ({
      field,
      ...acc[field.id],
      perTree: field.trees ? acc[field.id].oil / field.trees : null,
    }))
    .sort((left, right) => right.oil - left.oil)
})

/* ---------- stock ---------- */
const locations = computed(() =>
  farm.value.locations.slice().sort((left, right) => left.order - right.order),
)
const stock = computed(() =>
  stockLevels(
    farm.value.extractions,
    farm.value.stockMovements,
    startMonth.value,
    farm.value.transactions,
  ),
)
const stockRows = computed(() =>
  Object.entries(stock.value)
    .map(([value, byLoc]) => ({
      vintage: Number(value),
      byLoc,
      total: Object.values(byLoc).reduce((sum, x) => sum + x, 0),
    }))
    .filter(
      (stockRow) =>
        Math.abs(stockRow.total) > 0.001 ||
        Object.values(stockRow.byLoc).some((x) => Math.abs(x) > 0.001),
    )
    .sort((left, right) => right.vintage - left.vintage),
)
const usedLocations = computed(() =>
  locations.value.filter(
    (location) =>
      !location.archived || stockRows.value.some((stockRow) => stockRow.byLoc[location.id]),
  ),
)
const stockTotal = computed(() =>
  stockRows.value.reduce((sum, stockRow) => sum + stockRow.total, 0),
)

const moveKind = ref<'transfer' | 'ownUse' | null>(null)
const tracked = computed(() => trackedVintages(farm.value.extractions, startMonth.value))
/** Recent stock movements, including oil sales (which are edited on the Money page). */
interface Move {
  movement?: StockMovement
  sale?: Transaction
  date: string
  vintage: number
  updatedAt: number
}
const movements = computed<Move[]>(() =>
  [
    ...farm.value.stockMovements.map((movement) => ({
      movement,
      date: movement.date,
      vintage: movement.vintage,
      updatedAt: movement.updatedAt,
    })),
    ...farm.value.transactions
      .filter(
        (x) => x.kind === 'sale' && x.vintage != null && !isUntrackedSale(x, tracked.value),
      )
      .map((x) => ({ sale: x, date: x.date, vintage: x.vintage!, updatedAt: x.updatedAt })),
  ]
    .sort(byNewest)
    .slice(0, 10),
)
function locName(id?: string) {
  const location = farm.value.locations.find((x) => x.id === id)
  return location ? locationName(translate, location) : '?'
}

function moveLine(movement: StockMovement) {
  return movement.kind === 'transfer'
    ? translate('move.transferLine', {
        kg: fmt(movement.kg),
        from: locName(movement.fromLocationId),
        to: locName(movement.toLocationId),
      })
    : translate('move.ownUseLine', {
        kg: fmt(movement.kg),
        from: locName(movement.fromLocationId),
      })
}

async function removeMove(movement: StockMovement) {
  const repo = farm.value.repo
  await repo.softDelete('stockMovements', movement.id)
  showToast({
    title: translate('journal.deleted'),
    action: {
      label: translate('common.undo'),
      run: () => void repo.restore('stockMovements', movement.id),
    },
  })
}
</script>

<template>
  <main class="page oil">
    <header class="page-head row-between">
      <h1>{{ $t('nav.oil') }}</h1>
      <YearPicker
        v-model="season"
        :years="seasons"
        :label="$t('oil.season')"
        :prefix="$t('oil.season')"
      />
    </header>

    <RouterLink to="/oil/new" class="btn primary big block"
      >+ {{ $t('oil.newExtraction') }}</RouterLink
    >

    <!-- Season totals -->
    <section v-if="totals.count" class="card">
      <h2>{{ $t('oil.total') }} · {{ seasonLabel(season) }}</h2>
      <table class="kv">
        <tbody>
          <tr>
            <th>{{ $t('oil.olives') }}</th>
            <td>{{ fmt(totals.oliveKg, 0) }} {{ $t('common.kg') }}</td>
          </tr>
          <tr>
            <th>{{ $t('oil.oil') }}</th>
            <td>{{ fmt(totals.oilKg) }} {{ $t('common.kg') }}</td>
          </tr>
          <tr>
            <th>{{ $t('oil.yield') }}</th>
            <td>{{ yieldOf(totals.oliveKg, totals.oilKg) }}</td>
          </tr>
          <tr v-for="c in chargeRows" :key="c.name" class="sub">
            <th>{{ c.name }}</th>
            <td>{{ fmt(c.kg) }} {{ $t('common.kg') }} · {{ pct(c.kg, totals.oilKg) }}</td>
          </tr>
          <tr class="strong">
            <th>{{ $t('oil.net') }}</th>
            <td>{{ fmt(totals.netKg) }} {{ $t('common.kg') }}</td>
          </tr>
        </tbody>
      </table>
    </section>

    <!-- Extractions -->
    <section class="card">
      <h2>{{ $t('oil.extractions') }}</h2>
      <p v-if="!extractions.length" class="muted">{{ $t('oil.noExtractions') }}</p>
      <ul v-else class="list">
        <li v-for="x in extractions" :key="x.id">
          <button type="button" class="x-card" @click="router.push(`/oil/${x.id}`)">
            <strong
              >{{ day(x.date)
              }}<template v-if="millName(x.millId)">
                · {{ millName(x.millId) }}</template
              ></strong
            >
            <span>
              {{ fmt(x.oliveKg, 0) }} → {{ fmt(x.oilKg) }} {{ $t('common.kg') }} ·
              {{ yieldOf(x.oliveKg, x.oilKg) }}
            </span>
            <small class="muted">
              <template v-if="x.charges.length"
                >{{ $t('oil.charges') }} {{ fmt(chargesKg(x)) }} ({{
                  pct(chargesKg(x), x.oilKg)
                }}) ·
              </template>
              {{ $t('oil.net') }} {{ fmt(netOil(x)) }} {{ $t('common.kg') }}
              <template v-if="x.acidity != null">
                · {{ $t('oil.acidity') }} {{ fmt(x.acidity, 2) }}</template
              >
            </small>
          </button>
        </li>
      </ul>
    </section>

    <!-- Oil per field -->
    <section v-if="perField.length" class="card">
      <h2>{{ $t('oil.fieldsEstimate') }}</h2>
      <table class="kv">
        <tbody>
          <tr v-for="f in perField" :key="f.field.id">
            <th>{{ f.field.name }}</th>
            <td>
              ≈ {{ fmt(f.oil) }} {{ $t('common.kg') }}
              <small v-if="f.perTree != null" class="muted"
                ><br />{{ $t('oil.perTree', { kg: fmt(f.perTree, 2) }) }}</small
              >
            </td>
          </tr>
        </tbody>
      </table>
    </section>

    <!-- Stock -->
    <section class="card">
      <h2>{{ $t('oil.stock') }}</h2>
      <p v-if="!stockRows.length" class="muted">{{ $t('oil.noStock') }}</p>
      <div v-else class="table-wrap">
        <table class="grid">
          <thead>
            <tr>
              <th>{{ $t('oil.season') }}</th>
              <th v-for="l in usedLocations" :key="l.id">{{ locationName($t, l) }}</th>
              <th>{{ $t('oil.total') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in stockRows" :key="r.vintage">
              <th>{{ seasonLabel(r.vintage) }}</th>
              <td v-for="l in usedLocations" :key="l.id">
                {{ r.byLoc[l.id] ? fmt(r.byLoc[l.id]) : '–' }}
              </td>
              <td>
                <strong>{{ fmt(r.total) }}</strong>
              </td>
            </tr>
          </tbody>
          <tfoot v-if="stockRows.length > 1">
            <tr>
              <th>{{ $t('oil.total') }}</th>
              <td v-for="l in usedLocations" :key="l.id">
                {{ fmt(stockRows.reduce((s, r) => s + (r.byLoc[l.id] ?? 0), 0)) }}
              </td>
              <td>
                <strong>{{ fmt(stockTotal) }}</strong>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
      <div v-if="stockRows.length" class="actions wrap">
        <button type="button" class="btn small" @click="moveKind = 'transfer'">
          ⇄ {{ $t('oil.transfer') }}
        </button>
        <button type="button" class="btn small" @click="moveKind = 'ownUse'">
          {{ $t('oil.ownUse') }}
        </button>
      </div>
      <template v-if="movements.length">
        <span class="label">{{ $t('oil.movements') }}</span>
        <ul class="list moves">
          <li v-for="mv in movements" :key="(mv.movement ?? mv.sale)!.id" class="row-between">
            <span>
              <small class="muted">{{ day(mv.date) }} · {{ seasonLabel(mv.vintage) }}</small
              ><br />
              <template v-if="mv.movement">{{ moveLine(mv.movement) }}</template>
              <RouterLink v-else :to="`/money/${mv.sale!.id}`">
                {{ $t('oil.saleLine', { kg: fmt(mv.sale!.kg ?? 0), party: mv.sale!.party || '–' }) }}
              </RouterLink>
            </span>
            <button
              v-if="mv.movement"
              type="button"
              class="icon-btn"
              :aria-label="$t('common.delete')"
              @click="removeMove(mv.movement)"
            >
              🗑
            </button>
          </li>
        </ul>
      </template>
    </section>

    <StockMoveModal v-if="moveKind" :kind="moveKind" :stock="stock" @close="moveKind = null" />
  </main>
</template>
