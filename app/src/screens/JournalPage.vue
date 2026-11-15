<script setup lang="ts">
import type { TaskEntry, TaskType } from '../core/types'
import { useTranslation } from 'i18next-vue'
import { computed, ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { addDays, monthGrid, parseISODate, todayISO } from '../core/dates'
import { formatNumber } from '../core/format'
import { unitLabel } from '../core/units'
import { formatLocale } from '../i18n'
import { taskName, useFarm } from '../ui/farm'
import { showToast } from '../ui/toast'

const { t: translate } = useTranslation()
const farm = useFarm()
const route = useRoute()
const router = useRouter()

const today = todayISO()
const date = computed(() => (route.query.date as string | undefined) ?? today)
const month = ref(date.value.slice(0, 7))

function setDate(isoDate: string) {
  void router.replace({ query: { date: isoDate } })
  month.value = isoDate.slice(0, 7)
}

const typeById = computed(() => new Map(farm.value.taskTypes.map((x) => [x.id, x])))
const byDay = computed(() => {
  const byDay2 = new Map<string, TaskEntry[]>()
  for (const entry of farm.value.entries) {
    if (entry.deletedAt) {
      continue
    }
    if (!byDay2.has(entry.date)) {
      byDay2.set(entry.date, [])
    }
    byDay2.get(entry.date)!.push(entry)
  }

  return byDay2
})

const ym = computed(() => month.value.split('-').map(Number) as [number, number])
const grid = computed(() => monthGrid(ym.value[0], ym.value[1]))
function shiftMonth(delta: number) {
  const dt = new Date(ym.value[0], ym.value[1] - 1 + delta, 1)
  month.value = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`
}
const weekdays = computed(() =>
  Array.from({ length: 7 }, (_, i) =>
    new Intl.DateTimeFormat(formatLocale.value, { weekday: 'narrow' }).format(
      new Date(2024, 0, 1 + i),
    ),
  ),
)
const monthTitle = computed(() =>
  new Intl.DateTimeFormat(formatLocale.value, { month: 'long', year: 'numeric' }).format(
    new Date(ym.value[0], ym.value[1] - 1, 1),
  ),
)
const dayTitle = computed(() =>
  new Intl.DateTimeFormat(formatLocale.value, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(parseISODate(date.value)),
)

const dayEntries = computed(() =>
  [...(byDay.value.get(date.value) ?? [])].sort(
    (left, right) => left.updatedAt - right.updatedAt,
  ),
)

const extractionDays = computed(() => new Set(farm.value.extractions.map((x) => x.date)))
const dayExtractions = computed(() =>
  farm.value.extractions.filter((x) => x.date === date.value),
)

/** Distinct task types logged on a day, for the calendar dots. */
function dayTypes(isoDate: string): TaskType[] {
  const seen = new Map<string, TaskType>()
  for (const entry of byDay.value.get(isoDate) ?? []) {
    const tt = typeById.value.get(entry.taskTypeId)
    if (tt) {
      seen.set(tt.id, tt)
    }
  }

  return [...seen.values()]
}

async function remove(entry: TaskEntry) {
  const repo = farm.value.repo
  await repo.softDelete('entries', entry.id)
  showToast({
    title: translate('journal.deleted'),
    action: {
      label: translate('common.undo'),
      run: () => void repo.restore('entries', entry.id),
    },
  })
}

function unitById(id: string) {
  return farm.value.units.find((unit) => unit.id === id)
}

function fieldName(id: string) {
  return (
    farm.value.fields.find((field) => field.id === id)?.name ??
    translate('journal.unknownField')
  )
}

function details(entry: TaskEntry) {
  const loc = formatLocale.value
  const parts: string[] = []
  if (entry.trees) {
    parts.push(translate('journal.trees', { count: entry.trees }))
  }

  for (const quantity of entry.quantities ?? []) {
    parts.push(
      `${formatNumber(quantity.amount, loc)} ${unitLabel(unitById(quantity.unitId), quantity.amount)}`,
    )
  }
  if (entry.amount) {
    parts.push(
      `${entry.product ? `${entry.product} · ` : ''}${formatNumber(entry.amount, loc)} ${entry.amountUnit ?? ''}`,
    )
  }
  if (entry.workers) {
    parts.push(`${entry.workers} × ${formatNumber(entry.hours ?? 0, loc)} h`)
  }
  if (entry.fieldFinished) {
    parts.push(translate('journal.fieldFinished'))
  }

  return parts.join(' · ')
}
</script>

<template>
  <main class="page journal">
    <section class="card calendar">
      <div class="row-between">
        <button
          type="button"
          class="icon-btn"
          :aria-label="$t('journal.prevMonth')"
          @click="shiftMonth(-1)"
        >
          ‹
        </button>
        <strong class="cap">{{ monthTitle }}</strong>
        <button
          type="button"
          class="icon-btn"
          :aria-label="$t('journal.nextMonth')"
          @click="shiftMonth(1)"
        >
          ›
        </button>
      </div>
      <div class="cal-grid">
        <span v-for="(w, i) in weekdays" :key="`w${i}`" class="cal-wd">{{ w }}</span>
        <template v-for="(d, i) in grid" :key="d ?? `x${i}`">
          <button
            v-if="d"
            type="button"
            class="cal-day"
            :class="[{ selected: d === date, today: d === today }]"
            :aria-label="d"
            :aria-current="d === date ? 'date' : undefined"
            @click="setDate(d)"
          >
            <span>{{ Number(d.slice(8)) }}</span>
            <span class="dots" aria-hidden="true">
              <i
                v-for="x in dayTypes(d).slice(0, 3)"
                :key="x.id"
                :style="{ background: x.color }"
              ></i>
              <b v-if="dayTypes(d).length > 3">+</b>
              <em v-if="extractionDays.has(d)" class="oil-mark">💧</em>
            </span>
          </button>
          <span v-else></span>
        </template>
      </div>
    </section>

    <div class="day-nav">
      <button
        type="button"
        class="icon-btn"
        :aria-label="$t('journal.prevDay')"
        @click="setDate(addDays(date, -1))"
      >
        ‹
      </button>
      <h1 class="cap">{{ dayTitle }}</h1>
      <button
        type="button"
        class="icon-btn"
        :aria-label="$t('journal.nextDay')"
        @click="setDate(addDays(date, 1))"
      >
        ›
      </button>
    </div>
    <button
      v-if="date !== today"
      type="button"
      class="btn ghost small center"
      @click="setDate(today)"
    >
      {{ $t('journal.goToday') }}
    </button>

    <ul v-if="dayExtractions.length" class="entries">
      <li v-for="x in dayExtractions" :key="x.id" class="entry oil-entry">
        <button type="button" class="entry-main" @click="router.push(`/oil/${x.id}`)">
          <span class="entry-icon" aria-hidden="true">💧</span>
          <span class="entry-text">
            <strong>{{ $t('extraction.title') }}</strong>
            <small>{{
              $t('journal.extractionLine', {
                olives: formatNumber(x.oliveKg, formatLocale, 0),
                oil: formatNumber(x.oilKg, formatLocale, 1),
              })
            }}</small>
          </span>
        </button>
      </li>
    </ul>

    <div v-if="dayEntries.length === 0" class="empty">
      <p class="muted">{{ $t('journal.noEntries') }}</p>
      <RouterLink class="btn" :to="{ path: '/', query: { date } }"
        >+ {{ $t('journal.logTask') }}</RouterLink
      >
    </div>
    <ul v-else class="entries">
      <li
        v-for="e in dayEntries"
        :key="e.id"
        class="entry"
        :style="{ '--c': typeById.get(e.taskTypeId)?.color ?? '#777' }"
      >
        <button type="button" class="entry-main" @click="router.push(`/entry/${e.id}`)">
          <span class="entry-icon" aria-hidden="true">{{
            typeById.get(e.taskTypeId)?.icon
          }}</span>
          <span class="entry-text">
            <strong>
              {{ typeById.get(e.taskTypeId) ? taskName($t, typeById.get(e.taskTypeId)!) : '?' }}
              ·
              {{ fieldName(e.fieldId) }}
            </strong>
            <small>{{ details(e) }}</small>
            <small v-if="e.notes" class="muted">{{ e.notes }}</small>
          </span>
        </button>
        <button
          type="button"
          class="icon-btn"
          :aria-label="$t('common.delete')"
          @click="remove(e)"
        >
          🗑
        </button>
      </li>
      <li>
        <RouterLink class="btn ghost small" :to="{ path: '/', query: { date } }"
          >+ {{ $t('journal.logTask') }}</RouterLink
        >
      </li>
    </ul>
  </main>
</template>
