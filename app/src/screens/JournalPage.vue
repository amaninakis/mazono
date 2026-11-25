<script setup lang="ts">
import type { TaskEntry, TaskType } from '../core/types'
import { useTranslation } from 'i18next-vue'
import { computed, ref, useTemplateRef, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { addDays, monthGrid, parseISODate, todayISO } from '../core/dates'
import { formatNumber } from '../core/format'
import { isFutureMonth, monthsWithWork, shownMonth } from '../core/months'
import { unitLabel } from '../core/units'
import { formatLocale } from '../i18n'
import { account } from '../sync/account'
import AppIcon from '../ui/AppIcon.vue'
import { canDo, taskName, useFarm } from '../ui/farm'
import JournalDay from '../ui/JournalDay.vue'
import MonthStrip from '../ui/MonthStrip.vue'
import OilDrop from '../ui/OilDrop.vue'
import { nudge, slideIn } from '../ui/slide'
import SwipeTrack from '../ui/SwipeTrack.vue'
import TaskIcon from '../ui/TaskIcon.vue'
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
/** The days of the shown month, or of the one `offset` months away (while dragging). */
function gridFor(offset: number) {
  const first = new Date(ym.value[0], ym.value[1] - 1 + offset, 1)
  return monthGrid(first.getFullYear(), first.getMonth() + 1)
}
const days = useTemplateRef<HTMLElement>('days')
/** Show another month; a month after today shows today's month instead. */
/** The first year with any work: the Journal's list of years starts there. */
const firstYear = computed(() =>
  farm.value.entries.reduce(
    (first, entry) => Math.min(first, Number(entry.date.slice(0, 4))),
    Number(today.slice(0, 4)),
  ),
)

function showMonth(year: number, monthNumber: number) {
  month.value = shownMonth(year, monthNumber, today)
}

function shiftMonth(delta: number) {
  const dt = new Date(ym.value[0], ym.value[1] - 1 + delta, 1)
  if (isFutureMonth(dt.getFullYear(), dt.getMonth() + 1, today)) {
    nudge(days.value, 1)
    return
  }
  showMonth(dt.getFullYear(), dt.getMonth() + 1)
}

/** Dragging the days sideways shows the next month (left) or the previous one (right). */
function canShiftMonth(step: number) {
  const next = new Date(ym.value[0], ym.value[1] - 1 + step, 1)
  return !isFutureMonth(next.getFullYear(), next.getMonth() + 1, today)
}
watch(month, (shown, before) => slideIn(days.value, shown > before ? 1 : -1), {
  flush: 'post',
})
const weekdays = computed(() =>
  Array.from({ length: 7 }, (_, i) =>
    new Intl.DateTimeFormat(formatLocale.value, { weekday: 'narrow' }).format(
      new Date(2024, 0, 1 + i),
    ),
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
/** Months of the shown year with work or a mill visit, for the dots on the month chips. */
const monthsWithDots = computed(() =>
  monthsWithWork([...byDay.value.keys(), ...extractionDays.value], ym.value[0]),
)
/** Away from today (another day or another month): the day row offers a way back. */
const awayFromToday = computed(() => date.value !== today || month.value !== today.slice(0, 7))
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

/** Read-only for people who may only see the Journal. */
const canEditWork = computed(() => canDo(farm.value, 'work', 'change'))
const canEditOil = computed(() => canDo(farm.value, 'oil', 'change'))
/** "logged by Giannis" when someone else logged it. */
function loggedBy(createdBy: string | undefined) {
  return createdBy && createdBy !== account.user?.username ? createdBy : undefined
}
</script>

<template>
  <main class="page journal">
    <header class="page-head">
      <h1>{{ $t('nav.journal') }}</h1>
    </header>
    <MonthStrip
      :year="ym[0]"
      :month="ym[1]"
      :today="today"
      :with-work="monthsWithDots"
      :first-year="firstYear"
      @pick="showMonth"
    />
    <section class="card calendar">
      <div class="cal-grid cal-head">
        <span v-for="(w, i) in weekdays" :key="`w${i}`" class="cal-wd">{{ w }}</span>
      </div>
      <SwipeTrack :can-go="canShiftMonth" @step="shiftMonth">
        <template #default="{ offset }">
          <div :ref="offset === 0 ? 'days' : undefined" class="cal-grid">
            <JournalDay
              v-for="(d, i) in gridFor(offset)"
              :key="d ?? `x${i}`"
              :day="d"
              :selected="d === date"
              :is-today="d === today"
              :types="d ? dayTypes(d) : []"
              :oil="!!d && extractionDays.has(d)"
              @pick="setDate"
            />
          </div>
        </template>
      </SwipeTrack>
    </section>

    <div class="day-nav">
      <button
        type="button"
        class="icon-btn"
        :aria-label="$t('journal.prevDay')"
        @click="setDate(addDays(date, -1))"
      >
        <AppIcon name="chevronLeft" :size="20" />
      </button>
      <h1 class="cap">{{ dayTitle }}</h1>
      <button
        type="button"
        class="icon-btn"
        :aria-label="$t('journal.nextDay')"
        @click="setDate(addDays(date, 1))"
      >
        <AppIcon name="chevronRight" :size="20" />
      </button>
      <button
        v-if="awayFromToday"
        type="button"
        class="chip selected day-today"
        @click="setDate(today)"
      >
        {{ $t('journal.goToday') }}
      </button>
    </div>

    <ul v-if="dayExtractions.length" class="entries">
      <li v-for="x in dayExtractions" :key="x.id" class="entry oil-entry">
        <button
          type="button"
          class="entry-main"
          :class="{ readonly: !canEditOil }"
          @click="canEditOil && router.push(`/oil/${x.id}`)"
        >
          <span class="entry-icon" aria-hidden="true"><OilDrop /></span>
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
      <RouterLink v-if="canEditWork" class="btn" :to="{ path: '/', query: { date } }"
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
        <button
          type="button"
          class="entry-main"
          :class="{ readonly: !canEditWork }"
          @click="canEditWork && router.push(`/entry/${e.id}`)"
        >
          <TaskIcon class="entry-icon" :icon="typeById.get(e.taskTypeId)?.icon" :size="24" />
          <span class="entry-text">
            <strong>
              {{ typeById.get(e.taskTypeId) ? taskName($t, typeById.get(e.taskTypeId)!) : '?' }}
              ·
              {{ fieldName(e.fieldId) }}
            </strong>
            <small>{{ details(e) }}</small>
            <small v-if="e.notes" class="muted">{{ e.notes }}</small>
            <small v-if="loggedBy(e.createdBy)" class="muted">
              {{ $t('journal.loggedBy', { name: loggedBy(e.createdBy) }) }}
            </small>
          </span>
        </button>
        <button
          v-if="canEditWork"
          type="button"
          class="icon-btn"
          :aria-label="$t('common.delete')"
          @click="remove(e)"
        >
          <AppIcon name="trash" :size="20" />
        </button>
      </li>
      <li v-if="canEditWork">
        <RouterLink class="btn ghost small" :to="{ path: '/', query: { date } }"
          >+ {{ $t('journal.logTask') }}</RouterLink
        >
      </li>
    </ul>
  </main>
</template>
