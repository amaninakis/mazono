<script setup lang="ts">
import type { FormValues } from '../core/drafts'
import type { FieldProgress } from '../core/progress'
import type { InputKind, TaskEntry, TaskType, UnitAmount } from '../core/types'
import { useTranslation } from 'i18next-vue'
import { computed, nextTick, ref, useTemplateRef, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { addDays, todayISO } from '../core/dates'
import { AMOUNT_UNITS } from '../core/defaults'
import { arrangeFields, learnedFieldOrder } from '../core/fieldOrder'
import { formatNumber } from '../core/format'
import {
  averageTreesPerDay,
  countedTogether,
  defaultFieldId,
  defaultTaskTypeId,
  fieldProgress,
  harvestYields,
  perTree,
  sortForPicker,
} from '../core/progress'
import { unitLabel } from '../core/units'
import { formatLocale } from '../i18n'
import AppIcon from '../ui/AppIcon.vue'
import DateField from '../ui/DateField.vue'
import { useDraft } from '../ui/draft'
import DraftNotice from '../ui/DraftNotice.vue'
import { canDo, taskName, useFarm } from '../ui/farm'
import FieldPicker from '../ui/FieldPicker.vue'
import NewTaskModal from '../ui/NewTaskModal.vue'
import NewUnitModal from '../ui/NewUnitModal.vue'
import NumberStepper from '../ui/NumberStepper.vue'
import { useSaving } from '../ui/saving'
import ScrollRow from '../ui/ScrollRow.vue'
import { sheetBackdrop } from '../ui/sheet'
import SheetClose from '../ui/SheetClose.vue'
import { slideIn } from '../ui/slide'
import TaskIcon from '../ui/TaskIcon.vue'
import { showToast } from '../ui/toast'
import ToggleSwitch from '../ui/ToggleSwitch.vue'

const { t: translate } = useTranslation()
const farm = useFarm()
const route = useRoute()
const router = useRouter()

const today = todayISO()
const editId = route.params.id as string | undefined
const editing = editId ? farm.value.entries.find((entry) => entry.id === editId) : undefined

const activeTypes = computed(() =>
  farm.value.taskTypes
    .filter((x) => !x.archived)
    .sort((left, right) => left.order - right.order),
)
const activeUnits = computed(() => farm.value.units.filter((unit) => !unit.archived))
function defaultUnit() {
  return activeUnits.value.find((unit) => unit.isDefault) ?? activeUnits.value[0]
}

function emptyQuantities(): UnitAmount[] {
  const unit = defaultUnit()
  return unit ? [{ unitId: unit.id, amount: 0 }] : []
}

function seasonStart() {
  return farm.value.settings.seasonStartMonth
}

// Form state, initialised once from the entry being edited or from smart defaults.
const startDate = editing?.date ?? (route.query.date as string | undefined) ?? today
const startType =
  editing?.taskTypeId ?? defaultTaskTypeId(activeTypes.value, farm.value.entries, startDate)

const date = ref(startDate)
/**
 * One smart button before the date, so the date fits on one line: on today it offers
 * yesterday (the usual other choice); on any other day it brings you back to today.
 */
const isToday = computed(() => date.value === today)
const quickDate = computed(() =>
  isToday.value ? { date: addDays(today, -1) } : { date: today },
)
// When the button's word changes (Today ↔ Yesterday), it slides in like the date does.
const quickButton = useTemplateRef<HTMLElement>('quickButton')
watch(
  isToday,
  (nowToday) => {
    for (const word of quickButton.value?.children ?? []) {
      slideIn(word as HTMLElement, nowToday ? 1 : -1)
    }
  },
  { flush: 'post' },
)
const typeId = ref<string | undefined>(startType)
const fieldId = ref<string | undefined>(
  editing?.fieldId ?? defaultFieldFor(startType, startDate),
)
const trees = ref<number | null>(editing?.trees ?? null)
const quantities = ref<UnitAmount[]>(
  editing?.quantities?.length ? [...editing.quantities] : emptyQuantities(),
)
const product = ref(editing?.product ?? '')
const amount = ref<number | null>(editing?.amount ?? null)
const amountUnit = ref(editing?.amountUnit ?? 'kg')
const finished = ref(editing?.fieldFinished ?? false)
const notes = ref(editing?.notes ?? '')
const workers = ref<number | null>(editing?.workers ?? null)
const hours = ref<number | null>(editing?.hours ?? null)
const showNotes = ref(!!editing?.notes)
const error = ref('')
const newTask = ref(false)
const newUnit = ref(false)

function defaultFieldFor(id: string | undefined, isoDate: string) {
  const tt = activeTypes.value.find((x) => x.id === id)

  return tt
    ? defaultFieldId(
        inOrder(
          fieldProgress(
            farm.value.fields,
            farm.value.entries,
            tt,
            isoDate,
            seasonStart(),
            undefined,
            farm.value.taskTypes,
          ),
          tt,
          isoDate,
        ),
      )
    : undefined
}

/**
 * The fields in the order set in Settings: the user's own, or, with "order from your work" on,
 * the order this task was done in during earlier years (see learnedFieldOrder).
 */
function inOrder(list: FieldProgress[], taskType: TaskType, isoDate: string) {
  if (!farm.value.settings.learnedFieldOrder) {
    return list
  }
  const learned = learnedFieldOrder({
    fields: list.map((item) => item.field),
    entries: farm.value.entries,
    taskTypeIds: countedTogether(taskType, farm.value.taskTypes),
    date: isoDate,
    seasonStartMonth: seasonStart(),
  })

  return arrangeFields(list, learned)
}

const type = computed(() => farm.value.taskTypes.find((x) => x.id === typeId.value))
const kind = computed<InputKind>(() => type.value?.inputKind ?? 'harvest')

const progress = computed(() =>
  type.value
    ? inOrder(
        fieldProgress(
          farm.value.fields,
          farm.value.entries,
          type.value,
          date.value,
          seasonStart(),
          editing?.id,
          farm.value.taskTypes,
        ),
        type.value,
        date.value,
      )
    : [],
)
const current = computed(() =>
  progress.value.find((fieldProgress) => fieldProgress.field.id === fieldId.value),
)
/** Trees still to do in the chosen field; the trees counter cannot go above it. */
const maxTrees = computed(() => current.value?.remaining ?? undefined)

// Reaching the last tree of the field switches "field finished" on (and off again if the
// number goes back down), unless the user has set the switch by hand.
let autoFinished = false
watch([trees, () => current.value?.remaining], ([value, remaining]) => {
  if (kind.value === 'done' || remaining == null) {
    return
  }
  if (remaining > 0 && value === remaining) {
    if (!finished.value) {
      finished.value = true
      autoFinished = true
    }
  } else if (autoFinished) {
    finished.value = false
    autoFinished = false
  }
})

/** Trees a day of this work usually covers (0 before there is any day to go on). */
const usualTrees = computed(() =>
  typeId.value
    ? averageTreesPerDay({
        entries: farm.value.entries,
        taskTypeIds: sharedTypeIds(typeId.value),
        date: date.value,
        seasonStartMonth: farm.value.settings.seasonStartMonth,
        excludeId: editing?.id,
      })
    : 0,
)

// The trees box starts with the trees of a usual day of this work, but never more than the
// trees still left in the field. It follows the field, task and date until the user changes
// the number by hand.
let treesFollowField = !editing
let lastAutoTrees: number | null = null
function fillTrees() {
  if (!treesFollowField) {
    return
  }
  const remaining = current.value?.remaining
  if (kind.value === 'done') {
    lastAutoTrees = null
  } else if (remaining == null) {
    lastAutoTrees = usualTrees.value
  } else {
    lastAutoTrees = Math.min(usualTrees.value, remaining)
  }
  trees.value = lastAutoTrees
}
watch([fieldId, typeId, () => current.value?.remaining, usualTrees], fillTrees, {
  immediate: true,
})
watch(trees, (value) => {
  if (value !== lastAutoTrees) {
    treesFollowField = false
  }
})

/* ---------- unsaved work survives a call or a wrong tap ---------- */
const draft = useDraft({
  form: editing ? 'entry' : 'today',
  recordId: editing?.id,
  // Trees and "field finished" that the app filled in itself are left out (null).
  values: () => ({
    date: date.value,
    typeId: typeId.value ?? null,
    fieldId: fieldId.value ?? null,
    trees: treesFollowField ? null : trees.value,
    quantities: quantities.value,
    product: product.value,
    amount: amount.value,
    amountUnit: amountUnit.value,
    finished: autoFinished ? null : finished.value,
    notes: notes.value,
    workers: workers.value,
    hours: hours.value,
  }),
  restore: restoreValues,
})

async function restoreValues(values: FormValues) {
  if (typeof values.date === 'string') {
    date.value = values.date
  }
  if ('typeId' in values) {
    typeId.value = (values.typeId as string | null) ?? undefined
  }
  if ('fieldId' in values) {
    fieldId.value = (values.fieldId as string | null) ?? undefined
  }
  await nextTick() // the trees box follows the field first
  if ('trees' in values) {
    if (values.trees == null) {
      treesFollowField = true
      fillTrees()
    } else {
      treesFollowField = false
      trees.value = values.trees as number
    }
  }
  if (Array.isArray(values.quantities)) {
    quantities.value = values.quantities as UnitAmount[]
  }
  if (typeof values.product === 'string') {
    product.value = values.product
  }
  if ('amount' in values) {
    amount.value = values.amount as number | null
  }
  if (typeof values.amountUnit === 'string') {
    amountUnit.value = values.amountUnit
  }
  if (typeof values.finished === 'boolean') {
    finished.value = values.finished
    autoFinished = false
  }
  if (typeof values.notes === 'string') {
    notes.value = values.notes
    showNotes.value = showNotes.value || values.notes !== ''
  }
  if ('workers' in values) {
    workers.value = values.workers as number | null
  }
  if ('hours' in values) {
    hours.value = values.hours as number | null
  }
}

function setFinished(value: boolean) {
  finished.value = value
  autoFinished = false
}

const leftAfter = computed(() =>
  current.value?.remaining != null
    ? Math.max(current.value.remaining - (trees.value ?? 0), 0)
    : null,
)
const TREES_LABEL: Record<InputKind, string> = {
  harvest: 'today.treesHarvested',
  trees: 'today.treesPruned',
  quantity: 'today.treesWorked',
  done: 'today.treesWorked',
}
const treesLabel = computed(() => translate(TREES_LABEL[kind.value]))
const products = computed(() => [
  ...new Set(
    farm.value.entries.filter((entry) => entry.product).map((entry) => entry.product!),
  ),
])

function unitById(id: string) {
  return farm.value.units.find((unit) => unit.id === id)
}

function unitName(id: string) {
  return unitById(id)?.name ?? '?'
}

function fieldName(id?: string) {
  return farm.value.fields.find((field) => field.id === id)?.name ?? ''
}

function chooseType(id: string) {
  typeId.value = id
  error.value = ''
  if (!editing) {
    fieldId.value = defaultFieldFor(id, date.value)
  }
}

function onUnitChange(i: number, event: Event) {
  const sel = event.target as HTMLSelectElement
  if (sel.value === '__new') {
    sel.value = quantities.value[i].unitId
    newUnit.value = true

    return
  }
  quantities.value[i].unitId = sel.value
}

function addUnitRow() {
  const unused = activeUnits.value.find(
    (unit) => !quantities.value.some((quantity) => quantity.unitId === unit.id),
  )
  if (unused) {
    quantities.value.push({ unitId: unused.id, amount: 0 })
  } else {
    newUnit.value = true
  }
}

function resetForNext() {
  autoFinished = false
  treesFollowField = true
  lastAutoTrees = null
  trees.value = null
  quantities.value = emptyQuantities()
  amount.value = null
  finished.value = false
  notes.value = ''
  workers.value = null
  hours.value = null
}

const { saving, once } = useSaving()

async function save() {
  await once(saveEntry)
}

async function saveEntry() {
  const tt = type.value
  if (!tt || !fieldId.value) {
    return
  }
  const inputKind = kind.value
  const quantity = quantities.value.filter((x) => x.amount > 0)
  const hasData =
    inputKind === 'done' ||
    finished.value ||
    (inputKind === 'harvest' && ((trees.value ?? 0) > 0 || quantity.length > 0)) ||
    (inputKind === 'trees' && (trees.value ?? 0) > 0) ||
    (inputKind === 'quantity' && ((amount.value ?? 0) > 0 || (trees.value ?? 0) > 0))
  if (!hasData) {
    error.value = translate('today.nothingToSave')
    return
  }
  error.value = ''
  const labour = farm.value.settings.labourEnabled

  const saved = await farm.value.repo.saveEntry({
    id: editing?.id,
    date: date.value,
    fieldId: fieldId.value,
    taskTypeId: tt.id,
    trees: inputKind === 'done' ? undefined : (trees.value ?? undefined),
    quantities: inputKind === 'harvest' ? quantity.map((x) => ({ ...x })) : undefined,
    product: inputKind === 'quantity' ? product.value.trim() || undefined : undefined,
    amount: inputKind === 'quantity' ? (amount.value ?? undefined) : undefined,
    amountUnit: inputKind === 'quantity' ? amountUnit.value : undefined,
    fieldFinished: finished.value,
    notes: notes.value.trim() || undefined,
    workers: labour ? (workers.value ?? undefined) : editing?.workers,
    hours: labour ? (hours.value ?? undefined) : editing?.hours,
  })

  draft.clear()
  if (editing) {
    showToast({ title: translate('today.updated') })
    void router.push(
      sheetBackdrop.value.startsWith('/journal')
        ? { path: '/journal', query: { date: date.value } }
        : sheetBackdrop.value,
    )

    return
  }

  showToast({
    title: `${translate('today.saved')} · ${taskName(translate, tt)} · ${fieldName(fieldId.value)}`,
    lines: summaryLines(saved),
    action: {
      label: translate('common.undo'),
      run: () => void farm.value.repo.softDelete('entries', saved.id),
    },
  })
  resetForNext()
  const after = fieldProgress(
    farm.value.fields,
    withEntry(saved),
    tt,
    date.value,
    seasonStart(),
    undefined,
    farm.value.taskTypes,
  )
  fieldId.value = defaultFieldId(inOrder(after, tt, date.value))
  // The form is ready for the next entry: that is the new start, not a draft.
  await nextTick()
  draft.clear()
}

/** Task types whose trees count together with this one (all harvest tasks share a count). */
function sharedTypeIds(taskTypeId: string) {
  const taskType = farm.value.taskTypes.find((x) => x.id === taskTypeId)
  return taskType ? countedTogether(taskType, farm.value.taskTypes) : [taskTypeId]
}

/** All entries with `e` included once (the live list may already contain it). */
function withEntry(entry: TaskEntry) {
  return [...farm.value.entries.filter((x) => x.id !== entry.id), entry]
}

function summaryLines(entry: TaskEntry): string[] {
  const lines: string[] = []
  const fieldLabel = fieldName(entry.fieldId)
  const fld = farm.value.fields.find((x) => x.id === entry.fieldId)
  const loc = formatLocale.value
  function fmtPer(perUnit: Record<string, number>) {
    return Object.entries(perUnit)
      .map(
        ([unit, value]) => `${formatNumber(value, loc)} ${unitLabel(unitById(unit), value)}`,
      )
      .join(' · ')
  }

  if (kind.value === 'harvest' && fld) {
    const todayYield = entry.trees ? fmtPer(perTree(entry.quantities ?? [], entry.trees)) : ''
    if (todayYield) {
      lines.push(translate('today.todayTreeYield', { value: todayYield }))
    }
    const y = harvestYields(
      withEntry(entry),
      fld,
      sharedTypeIds(entry.taskTypeId),
      entry.date,
      seasonStart(),
    )
    const treeValue = y.treeYield ? fmtPer(y.treeYield) : ''
    if (treeValue && treeValue !== todayYield) {
      lines.push(translate('today.seasonTreeYield', { field: fieldLabel, value: treeValue }))
    }
    const fieldValue = y.fieldYield ? fmtPer(y.fieldYield) : ''
    if (fieldValue && fieldValue !== treeValue) {
      lines.push(translate('today.seasonFieldYield', { field: fieldLabel, value: fieldValue }))
    }
  }
  if (kind.value === 'quantity' && entry.amount && entry.trees) {
    lines.push(
      translate('today.perTree', {
        value: formatNumber(entry.amount / entry.trees, loc),
        unit: entry.amountUnit,
      }),
    )
  }
  if (entry.fieldFinished) {
    lines.push(translate('today.fieldClosed', { field: fieldLabel }))
  }

  return lines
}

/** Adding a task type or unit from here changes the grove's settings. */
const canEditSettings = computed(() => canDo(farm.value, 'settings', 'change'))
</script>

<template>
  <main class="page today">
    <header class="page-head">
      <SheetClose />
      <h1>{{ editing ? $t('today.editTitle') : $t('today.title') }}</h1>
    </header>
    <DraftNotice
      v-if="draft.restoredAt.value"
      :saved-at="draft.restoredAt.value"
      @discard="draft.discard()"
    />

    <ScrollRow class="task-chips" role="tablist" :selected-key="typeId">
      <button
        v-for="x in activeTypes"
        :key="x.id"
        type="button"
        role="tab"
        :aria-selected="x.id === typeId"
        class="task-chip"
        :class="[{ selected: x.id === typeId }]"
        :style="{ '--c': x.color }"
        @click="chooseType(x.id)"
      >
        <TaskIcon :icon="x.icon" /> {{ taskName($t, x) }}
      </button>
      <button
        v-if="!editing && canEditSettings"
        type="button"
        class="task-chip add"
        @click="newTask = true"
      >
        <AppIcon name="plus" :size="20" /> {{ $t('task.new') }}
      </button>
    </ScrollRow>

    <section class="card">
      <div class="date-quick">
        <!-- The label over the button, at the same inset as the other section titles. -->
        <div class="quick-stack">
          <label class="label" for="date">{{ $t('today.date') }}</label>
          <!-- Both words are laid out, one hidden, so the button keeps one width. -->
          <button
            ref="quickButton"
            type="button"
            class="chip selected quick-date"
            @click="date = quickDate.date"
          >
            <span :class="{ ghost: isToday }" :aria-hidden="isToday">{{
              $t('today.today')
            }}</span>
            <span :class="{ ghost: !isToday }" :aria-hidden="!isToday">{{
              $t('today.yesterday')
            }}</span>
          </button>
        </div>
        <DateField id="date" v-model="date" :max="today" :label="$t('today.date')" arrows />
      </div>
    </section>

    <section class="card">
      <span class="label">{{ $t('today.field') }}</span>
      <p v-if="progress.length === 0" class="muted">
        {{ $t('today.noFields') }}
        <RouterLink to="/settings/fields" class="btn small block-top">{{
          $t('today.addFields')
        }}</RouterLink>
      </p>
      <FieldPicker v-else v-model="fieldId" :fields="sortForPicker(progress)" />
    </section>

    <template v-if="fieldId">
      <section v-if="kind !== 'done'" class="card">
        <label class="label" for="trees">{{ treesLabel }}</label>
        <div class="stepper-row">
          <NumberStepper id="trees" v-model="trees" :label="treesLabel" :max="maxTrees" />
          <button
            v-if="(trees ?? 0) > 0"
            type="button"
            class="icon-btn clear-btn"
            :aria-label="$t('today.clearTrees')"
            :title="$t('today.clearTrees')"
            @click="trees = 0"
          >
            <AppIcon name="clear" :size="20" />
          </button>
        </div>
        <p v-if="leftAfter != null && kind !== 'quantity'" class="hint">
          {{ $t('today.leftAfter', { left: leftAfter, field: current!.field.name }) }}
        </p>
      </section>

      <section v-if="kind === 'harvest'" class="card">
        <span class="label">{{ $t('today.collected') }}</span>
        <div v-for="(q, i) in quantities" :key="i" class="qty-row unit-qty">
          <div class="qty-top">
            <select
              class="input select"
              :aria-label="$t('today.collected')"
              :value="q.unitId"
              @change="onUnitChange(i, $event)"
            >
              <option v-for="u in activeUnits" :key="u.id" :value="u.id">{{ u.name }}</option>
              <option v-if="canEditSettings" value="__new">{{ $t('today.newUnit') }}</option>
            </select>
            <button
              v-if="quantities.length > 1"
              type="button"
              class="icon-btn"
              :aria-label="$t('common.delete')"
              :title="$t('common.delete')"
              @click="quantities.splice(i, 1)"
            >
              <AppIcon name="clear" :size="20" />
            </button>
          </div>
          <NumberStepper
            :model-value="q.amount"
            :label="unitName(q.unitId)"
            half
            @update:model-value="(v) => (q.amount = v ?? 0)"
          />
        </div>
        <button type="button" class="btn ghost small" @click="addUnitRow">
          <AppIcon name="plus" :size="18" /> {{ $t('today.addUnitRow') }}
        </button>
      </section>

      <section v-if="kind === 'quantity'" class="card">
        <label class="label" for="product">{{ $t('today.product') }}</label>
        <input
          id="product"
          v-model="product"
          class="input"
          list="products"
          :placeholder="$t('today.productPlaceholder')"
        />
        <datalist id="products">
          <option v-for="p in products" :key="p" :value="p"></option>
        </datalist>
        <span class="label">{{ $t('today.amount') }}</span>
        <div class="qty-row">
          <NumberStepper v-model="amount" :label="$t('today.amount')" />
          <select
            v-model="amountUnit"
            class="input select narrow"
            :aria-label="$t('today.amount')"
          >
            <option v-for="u in AMOUNT_UNITS" :key="u">{{ u }}</option>
          </select>
        </div>
      </section>

      <section class="card">
        <ToggleSwitch
          :model-value="finished"
          :label="$t('today.fieldFinished')"
          :help="kind === 'done' ? undefined : $t('today.fieldFinishedHelp')"
          @update:model-value="setFinished"
        />
        <div v-if="farm.settings.labourEnabled" class="two-col">
          <div>
            <span class="label">{{ $t('today.workers') }}</span>
            <NumberStepper v-model="workers" :label="$t('today.workers')" />
          </div>
          <div>
            <span class="label">{{ $t('today.hours') }}</span>
            <NumberStepper v-model="hours" :label="$t('today.hours')" :step="0.5" />
          </div>
        </div>
        <template v-if="showNotes">
          <label class="label" for="notes">{{ $t('today.notes') }}</label>
          <textarea id="notes" v-model="notes" class="input" rows="2"></textarea>
        </template>
        <button v-else type="button" class="btn ghost small" @click="showNotes = true">
          <AppIcon name="plus" :size="18" /> {{ $t('today.notes') }}
        </button>
      </section>
    </template>

    <p v-if="error" class="error">{{ error }}</p>

    <div v-if="fieldId" class="save-bar">
      <button
        v-if="editing"
        type="button"
        class="btn ghost"
        @click="router.push(sheetBackdrop)"
      >
        {{ $t('common.cancel') }}
      </button>
      <button type="button" class="btn primary big" :disabled="saving" @click="save">
        {{ $t('common.save') }}
      </button>
    </div>

    <NewTaskModal v-if="newTask" @close="newTask = false" @created="chooseType" />
    <NewUnitModal
      v-if="newUnit"
      @close="newUnit = false"
      @created="(id) => quantities.push({ unitId: id, amount: 0 })"
    />
  </main>
</template>
