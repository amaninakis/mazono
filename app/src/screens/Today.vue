<script setup lang="ts">
import { useTranslation } from 'i18next-vue';
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { addDays, todayISO } from '../core/dates';
import { AMOUNT_UNITS } from '../core/defaults';
import { formatNumber } from '../core/format';
import {
  defaultFieldId,
  defaultTaskTypeId,
  fieldProgress,
  harvestYields,
  perTree,
  sortForPicker,
} from '../core/progress';
import type { InputKind, TaskEntry, UnitAmount } from '../core/types';
import { unitLabel } from '../core/units';
import { formatLocale } from '../i18n';
import DateField from '../ui/DateField.vue';
import FieldPicker from '../ui/FieldPicker.vue';
import NewTaskModal from '../ui/NewTaskModal.vue';
import NewUnitModal from '../ui/NewUnitModal.vue';
import Stepper from '../ui/Stepper.vue';
import Toggle from '../ui/Toggle.vue';
import { taskName, useFarm } from '../ui/farm';
import { showToast } from '../ui/toast';

const { t } = useTranslation();
const farm = useFarm();
const route = useRoute();
const router = useRouter();

const today = todayISO();
const editId = route.params.id as string | undefined;
const editing = editId ? farm.value.entries.find((e) => e.id === editId) : undefined;

const activeTypes = computed(() =>
  farm.value.taskTypes.filter((x) => !x.archived).sort((a, b) => a.order - b.order),
);
const activeUnits = computed(() => farm.value.units.filter((u) => !u.archived));
const defaultUnit = () => activeUnits.value.find((u) => u.isDefault) ?? activeUnits.value[0];
const emptyQuantities = (): UnitAmount[] => {
  const u = defaultUnit();
  return u ? [{ unitId: u.id, amount: 0 }] : [];
};
const seasonStart = () => farm.value.settings.seasonStartMonth;

// Form state, initialised once from the entry being edited or from smart defaults.
const startDate = editing?.date ?? (route.query.date as string | undefined) ?? today;
const startType = editing?.taskTypeId ?? defaultTaskTypeId(activeTypes.value, farm.value.entries, startDate);

const date = ref(startDate);
const typeId = ref<string | undefined>(startType);
const fieldId = ref<string | undefined>(editing?.fieldId ?? defaultFieldFor(startType, startDate));
const trees = ref<number | null>(editing?.trees ?? null);
const quantities = ref<UnitAmount[]>(editing?.quantities?.length ? [...editing.quantities] : emptyQuantities());
const product = ref(editing?.product ?? '');
const amount = ref<number | null>(editing?.amount ?? null);
const amountUnit = ref(editing?.amountUnit ?? 'kg');
const finished = ref(editing?.fieldFinished ?? false);
const notes = ref(editing?.notes ?? '');
const workers = ref<number | null>(editing?.workers ?? null);
const hours = ref<number | null>(editing?.hours ?? null);
const showNotes = ref(!!editing?.notes);
const error = ref('');
const newTask = ref(false);
const newUnit = ref(false);

function defaultFieldFor(id: string | undefined, d: string) {
  const tt = activeTypes.value.find((x) => x.id === id);
  return tt ? defaultFieldId(fieldProgress(farm.value.fields, farm.value.entries, tt, d, seasonStart())) : undefined;
}

const type = computed(() => farm.value.taskTypes.find((x) => x.id === typeId.value));
const kind = computed<InputKind>(() => type.value?.inputKind ?? 'harvest');

const progress = computed(() =>
  type.value
    ? fieldProgress(farm.value.fields, farm.value.entries, type.value, date.value, seasonStart(), editing?.id)
    : [],
);
const current = computed(() => progress.value.find((p) => p.field.id === fieldId.value));
/** Trees still to do in the chosen field; the trees counter cannot go above it. */
const maxTrees = computed(() => current.value?.remaining ?? undefined);

// Reaching the last tree of the field switches "field finished" on (and off again if the
// number goes back down), unless the user has set the switch by hand.
let autoFinished = false;
watch([trees, () => current.value?.remaining], ([n, remaining]) => {
  if (kind.value === 'done' || remaining == null) return;
  if (remaining > 0 && n === remaining) {
    if (!finished.value) {
      finished.value = true;
      autoFinished = true;
    }
  } else if (autoFinished) {
    finished.value = false;
    autoFinished = false;
  }
});
function setFinished(v: boolean) {
  finished.value = v;
  autoFinished = false;
}

const leftAfter = computed(() =>
  current.value?.remaining != null ? Math.max(current.value.remaining - (trees.value ?? 0), 0) : null,
);
const treesLabel = computed(() =>
  kind.value === 'harvest'
    ? t('today.treesHarvested')
    : kind.value === 'trees'
      ? t('today.treesPruned')
      : t('today.treesWorked'),
);
const products = computed(() => [
  ...new Set(farm.value.entries.filter((e) => e.product).map((e) => e.product!)),
]);

const unitById = (id: string) => farm.value.units.find((u) => u.id === id);
const unitName = (id: string) => unitById(id)?.name ?? '?';
const fieldName = (id?: string) => farm.value.fields.find((f) => f.id === id)?.name ?? '';

function chooseType(id: string) {
  typeId.value = id;
  error.value = '';
  if (!editing) fieldId.value = defaultFieldFor(id, date.value);
}

function onUnitChange(i: number, e: Event) {
  const sel = e.target as HTMLSelectElement;
  if (sel.value === '__new') {
    sel.value = quantities.value[i].unitId;
    newUnit.value = true;
    return;
  }
  quantities.value[i].unitId = sel.value;
}

function addUnitRow() {
  const unused = activeUnits.value.find((u) => !quantities.value.some((q) => q.unitId === u.id));
  if (unused) quantities.value.push({ unitId: unused.id, amount: 0 });
  else newUnit.value = true;
}

function resetForNext() {
  autoFinished = false;
  trees.value = null;
  quantities.value = emptyQuantities();
  amount.value = null;
  finished.value = false;
  notes.value = '';
  workers.value = null;
  hours.value = null;
}

async function save() {
  const tt = type.value;
  if (!tt || !fieldId.value) return;
  const k = kind.value;
  const q = quantities.value.filter((x) => x.amount > 0);
  const hasData =
    k === 'done' ||
    finished.value ||
    (k === 'harvest' && ((trees.value ?? 0) > 0 || q.length > 0)) ||
    (k === 'trees' && (trees.value ?? 0) > 0) ||
    (k === 'quantity' && ((amount.value ?? 0) > 0 || (trees.value ?? 0) > 0));
  if (!hasData) {
    error.value = t('today.nothingToSave');
    return;
  }
  error.value = '';
  const labour = farm.value.settings.labourEnabled;

  const saved = await farm.value.repo.saveEntry({
    id: editing?.id,
    date: date.value,
    fieldId: fieldId.value,
    taskTypeId: tt.id,
    trees: k === 'done' ? undefined : (trees.value ?? undefined),
    quantities: k === 'harvest' ? q.map((x) => ({ ...x })) : undefined,
    product: k === 'quantity' ? product.value.trim() || undefined : undefined,
    amount: k === 'quantity' ? (amount.value ?? undefined) : undefined,
    amountUnit: k === 'quantity' ? amountUnit.value : undefined,
    fieldFinished: finished.value,
    notes: notes.value.trim() || undefined,
    workers: labour ? (workers.value ?? undefined) : editing?.workers,
    hours: labour ? (hours.value ?? undefined) : editing?.hours,
  });

  if (editing) {
    showToast({ title: t('today.updated') });
    void router.push({ path: '/journal', query: { date: date.value } });
    return;
  }

  showToast({
    title: `${t('today.saved')} · ${taskName(t, tt)} · ${fieldName(fieldId.value)}`,
    lines: summaryLines(saved),
    action: { label: t('common.undo'), run: () => void farm.value.repo.softDelete('entries', saved.id) },
  });
  resetForNext();
  const after = fieldProgress(farm.value.fields, withEntry(saved), tt, date.value, seasonStart());
  fieldId.value = defaultFieldId(after);
}

/** All entries with `e` included once (the live list may already contain it). */
const withEntry = (e: TaskEntry) => [...farm.value.entries.filter((x) => x.id !== e.id), e];

function summaryLines(e: TaskEntry): string[] {
  const lines: string[] = [];
  const f = fieldName(e.fieldId);
  const fld = farm.value.fields.find((x) => x.id === e.fieldId);
  const loc = formatLocale.value;
  if (kind.value === 'harvest' && fld) {
    const fmtPer = (pt: Record<string, number>) =>
      Object.entries(pt)
        .map(([u, v]) => `${formatNumber(v, loc)} ${unitLabel(unitById(u), v)}`)
        .join(' · ');
    const todayYield = e.trees ? fmtPer(perTree(e.quantities ?? [], e.trees)) : '';
    if (todayYield) lines.push(t('today.todayTreeYield', { value: todayYield }));
    const y = harvestYields(withEntry(e), fld, e.taskTypeId, e.date, seasonStart());
    const treeValue = y.treeYield ? fmtPer(y.treeYield) : '';
    if (treeValue && treeValue !== todayYield) lines.push(t('today.seasonTreeYield', { field: f, value: treeValue }));
    const fieldValue = y.fieldYield ? fmtPer(y.fieldYield) : '';
    if (fieldValue && fieldValue !== treeValue) lines.push(t('today.seasonFieldYield', { field: f, value: fieldValue }));
  }
  if (kind.value === 'quantity' && e.amount && e.trees) {
    lines.push(t('today.perTree', { value: formatNumber(e.amount / e.trees, loc), unit: e.amountUnit }));
  }
  if (e.fieldFinished) lines.push(t('today.fieldClosed', { field: f }));
  return lines;
}
</script>

<template>
  <main class="page today">
    <header class="page-head">
      <h1>{{ editing ? t('today.editTitle') : t('today.title') }}</h1>
    </header>

    <div class="task-chips" role="tablist">
      <button
        v-for="x in activeTypes"
        :key="x.id"
        type="button"
        role="tab"
        :aria-selected="x.id === typeId"
        :class="['task-chip', { selected: x.id === typeId }]"
        :style="{ '--c': x.color }"
        @click="chooseType(x.id)"
      >
        <span aria-hidden="true">{{ x.icon }}</span> {{ taskName(t, x) }}
      </button>
      <button v-if="!editing" type="button" class="task-chip add" @click="newTask = true">+ {{ t('task.new') }}</button>
    </div>

    <section class="card">
      <div class="row-between">
        <label class="label" for="date">{{ t('today.date') }}</label>
        <div class="chips tight">
          <button type="button" :class="['chip', { selected: date === today }]" @click="date = today">
            {{ t('today.today') }}
          </button>
          <button
            type="button"
            :class="['chip', { selected: date === addDays(today, -1) }]"
            @click="date = addDays(today, -1)"
          >
            {{ t('today.yesterday') }}
          </button>
          <DateField id="date" v-model="date" :max="today" :label="t('today.date')" />
        </div>
      </div>
    </section>

    <section class="card">
      <span class="label">{{ t('today.field') }}</span>
      <p v-if="progress.length === 0" class="muted">
        {{ t('today.noFields') }} <RouterLink to="/settings#fields">{{ t('today.addFields') }}</RouterLink>
      </p>
      <FieldPicker v-else v-model="fieldId" :fields="sortForPicker(progress)" />
    </section>

    <template v-if="fieldId">
      <section v-if="kind !== 'done'" class="card">
        <label class="label" for="trees">{{ treesLabel }}</label>
        <Stepper id="trees" v-model="trees" :label="treesLabel" :max="maxTrees" />
        <p v-if="leftAfter != null && kind !== 'quantity'" class="hint">
          {{ t('today.leftAfter', { left: leftAfter, field: current!.field.name }) }}
        </p>
      </section>

      <section v-if="kind === 'harvest'" class="card">
        <span class="label">{{ t('today.collected') }}</span>
        <div v-for="(q, i) in quantities" :key="i" class="qty-row unit-qty">
          <div class="qty-top">
            <select class="input select" :aria-label="t('today.collected')" :value="q.unitId" @change="onUnitChange(i, $event)">
              <option v-for="u in activeUnits" :key="u.id" :value="u.id">{{ u.name }}</option>
              <option value="__new">{{ t('today.newUnit') }}</option>
            </select>
            <button
              v-if="quantities.length > 1"
              type="button"
              class="icon-btn"
              :aria-label="t('common.delete')"
              @click="quantities.splice(i, 1)"
            >
              ×
            </button>
          </div>
          <Stepper
            :model-value="q.amount"
            :label="unitName(q.unitId)"
            half
            @update:model-value="(v) => (q.amount = v ?? 0)"
          />
        </div>
        <button type="button" class="btn ghost small" @click="addUnitRow">+ {{ t('today.addUnitRow') }}</button>
      </section>

      <section v-if="kind === 'quantity'" class="card">
        <label class="label" for="product">{{ t('today.product') }}</label>
        <input id="product" v-model="product" class="input" list="products" :placeholder="t('today.productPlaceholder')" />
        <datalist id="products">
          <option v-for="p in products" :key="p" :value="p" />
        </datalist>
        <span class="label">{{ t('today.amount') }}</span>
        <div class="qty-row">
          <Stepper v-model="amount" :label="t('today.amount')" />
          <select v-model="amountUnit" class="input select narrow" :aria-label="t('today.amount')">
            <option v-for="u in AMOUNT_UNITS" :key="u">{{ u }}</option>
          </select>
        </div>
      </section>

      <section class="card">
        <Toggle
          :model-value="finished"
          :label="t('today.fieldFinished')"
          :help="kind === 'done' ? undefined : t('today.fieldFinishedHelp')"
          @update:model-value="setFinished"
        />
        <div v-if="farm.settings.labourEnabled" class="two-col">
          <div>
            <span class="label">{{ t('today.workers') }}</span>
            <Stepper v-model="workers" :label="t('today.workers')" />
          </div>
          <div>
            <span class="label">{{ t('today.hours') }}</span>
            <Stepper v-model="hours" :label="t('today.hours')" :step="0.5" />
          </div>
        </div>
        <template v-if="showNotes">
          <label class="label" for="notes">{{ t('today.notes') }}</label>
          <textarea id="notes" v-model="notes" class="input" rows="2" />
        </template>
        <button v-else type="button" class="btn ghost small" @click="showNotes = true">+ {{ t('today.notes') }}</button>
      </section>
    </template>

    <p v-if="error" class="error">{{ error }}</p>

    <div v-if="fieldId" class="save-bar">
      <button v-if="editing" type="button" class="btn ghost" @click="router.back()">{{ t('common.cancel') }}</button>
      <button type="button" class="btn primary big" @click="save">{{ t('common.save') }}</button>
    </div>

    <NewTaskModal v-if="newTask" @close="newTask = false" @created="chooseType" />
    <NewUnitModal v-if="newUnit" @close="newUnit = false" @created="(id) => quantities.push({ unitId: id, amount: 0 })" />
  </main>
</template>
