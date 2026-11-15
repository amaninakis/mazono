<script setup lang="ts">
import { useTranslation } from 'i18next-vue';
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { addDays, monthGrid, parseISODate, todayISO } from '../core/dates';
import { formatNumber } from '../core/format';
import type { TaskEntry, TaskType } from '../core/types';
import { locale } from '../i18n';
import { taskName, useFarm } from '../ui/farm';
import { showToast } from '../ui/toast';

const { t } = useTranslation();
const farm = useFarm();
const route = useRoute();
const router = useRouter();

const today = todayISO();
const date = computed(() => (route.query.date as string | undefined) ?? today);
const month = ref(date.value.slice(0, 7));

function setDate(d: string) {
  void router.replace({ query: { date: d } });
  month.value = d.slice(0, 7);
}

const typeById = computed(() => new Map(farm.value.taskTypes.map((x) => [x.id, x])));
const byDay = computed(() => {
  const m = new Map<string, TaskEntry[]>();
  for (const e of farm.value.entries) {
    if (e.deletedAt) continue;
    if (!m.has(e.date)) m.set(e.date, []);
    m.get(e.date)!.push(e);
  }
  return m;
});

const ym = computed(() => month.value.split('-').map(Number) as [number, number]);
const grid = computed(() => monthGrid(ym.value[0], ym.value[1]));
function shiftMonth(d: number) {
  const dt = new Date(ym.value[0], ym.value[1] - 1 + d, 1);
  month.value = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
}
const weekdays = computed(() =>
  Array.from({ length: 7 }, (_, i) =>
    new Intl.DateTimeFormat(locale.value, { weekday: 'narrow' }).format(new Date(2024, 0, 1 + i)),
  ),
);
const monthTitle = computed(() =>
  new Intl.DateTimeFormat(locale.value, { month: 'long', year: 'numeric' }).format(
    new Date(ym.value[0], ym.value[1] - 1, 1),
  ),
);
const dayTitle = computed(() =>
  new Intl.DateTimeFormat(locale.value, { weekday: 'long', day: 'numeric', month: 'long' }).format(
    parseISODate(date.value),
  ),
);

const dayEntries = computed(() => [...(byDay.value.get(date.value) ?? [])].sort((a, b) => a.updatedAt - b.updatedAt));

/** Distinct task types logged on a day, for the calendar dots. */
function dayTypes(d: string): TaskType[] {
  const seen = new Map<string, TaskType>();
  for (const e of byDay.value.get(d) ?? []) {
    const tt = typeById.value.get(e.taskTypeId);
    if (tt) seen.set(tt.id, tt);
  }
  return [...seen.values()];
}

async function remove(e: TaskEntry) {
  const repo = farm.value.repo;
  await repo.softDelete('entries', e.id);
  showToast({ title: t('journal.deleted'), action: { label: t('common.undo'), run: () => void repo.restore('entries', e.id) } });
}

const unitName = (id: string) => farm.value.units.find((u) => u.id === id)?.name ?? '?';
const fieldName = (id: string) => farm.value.fields.find((f) => f.id === id)?.name ?? t('journal.unknownField');

function details(e: TaskEntry) {
  const loc = locale.value;
  const parts: string[] = [];
  if (e.trees) parts.push(t('journal.trees', { count: e.trees }));
  for (const q of e.quantities ?? []) parts.push(`${formatNumber(q.amount, loc)} ${unitName(q.unitId)}`);
  if (e.amount) parts.push(`${e.product ? e.product + ' · ' : ''}${formatNumber(e.amount, loc)} ${e.amountUnit ?? ''}`);
  if (e.workers) parts.push(`${e.workers} × ${formatNumber(e.hours ?? 0, loc)} h`);
  if (e.fieldFinished) parts.push(t('journal.fieldFinished'));
  return parts.join(' · ');
}
</script>

<template>
  <main class="page journal">
    <section class="card calendar">
      <div class="row-between">
        <button type="button" class="icon-btn" :aria-label="t('journal.prevMonth')" @click="shiftMonth(-1)">‹</button>
        <strong class="cap">{{ monthTitle }}</strong>
        <button type="button" class="icon-btn" :aria-label="t('journal.nextMonth')" @click="shiftMonth(1)">›</button>
      </div>
      <div class="cal-grid">
        <span v-for="(w, i) in weekdays" :key="`w${i}`" class="cal-wd">{{ w }}</span>
        <template v-for="(d, i) in grid" :key="d ?? `x${i}`">
          <button
            v-if="d"
            type="button"
            :class="['cal-day', { selected: d === date, today: d === today }]"
            :aria-label="d"
            :aria-current="d === date ? 'date' : undefined"
            @click="setDate(d)"
          >
            <span>{{ Number(d.slice(8)) }}</span>
            <span class="dots" aria-hidden="true">
              <i v-for="x in dayTypes(d).slice(0, 3)" :key="x.id" :style="{ background: x.color }" />
              <b v-if="dayTypes(d).length > 3">+</b>
            </span>
          </button>
          <span v-else />
        </template>
      </div>
    </section>

    <div class="day-nav">
      <button type="button" class="icon-btn" :aria-label="t('journal.prevDay')" @click="setDate(addDays(date, -1))">‹</button>
      <h1 class="cap">{{ dayTitle }}</h1>
      <button type="button" class="icon-btn" :aria-label="t('journal.nextDay')" @click="setDate(addDays(date, 1))">›</button>
    </div>
    <button v-if="date !== today" type="button" class="btn ghost small center" @click="setDate(today)">
      {{ t('journal.goToday') }}
    </button>

    <div v-if="dayEntries.length === 0" class="empty">
      <p class="muted">{{ t('journal.noEntries') }}</p>
      <RouterLink class="btn" :to="{ path: '/', query: { date } }">+ {{ t('journal.logTask') }}</RouterLink>
    </div>
    <ul v-else class="entries">
      <li
        v-for="e in dayEntries"
        :key="e.id"
        class="entry"
        :style="{ '--c': typeById.get(e.taskTypeId)?.color ?? '#777' }"
      >
        <button type="button" class="entry-main" @click="router.push(`/entry/${e.id}`)">
          <span class="entry-icon" aria-hidden="true">{{ typeById.get(e.taskTypeId)?.icon }}</span>
          <span class="entry-text">
            <strong>
              {{ typeById.get(e.taskTypeId) ? taskName(t, typeById.get(e.taskTypeId)!) : '?' }} ·
              {{ fieldName(e.fieldId) }}
            </strong>
            <small>{{ details(e) }}</small>
            <small v-if="e.notes" class="muted">{{ e.notes }}</small>
          </span>
        </button>
        <button type="button" class="icon-btn" :aria-label="t('common.delete')" @click="remove(e)">🗑</button>
      </li>
      <li>
        <RouterLink class="btn ghost small" :to="{ path: '/', query: { date } }">+ {{ t('journal.logTask') }}</RouterLink>
      </li>
    </ul>
  </main>
</template>
