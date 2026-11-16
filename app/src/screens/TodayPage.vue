<script setup lang="ts">
import type { InputKind, TaskEntry, UnitAmount } from '../core/types'
import { useTranslation } from 'i18next-vue'
import { computed, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { addDays, todayISO } from '../core/dates'
import { AMOUNT_UNITS } from '../core/defaults'
import { formatNumber } from '../core/format'
import {
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
import DateField from '../ui/DateField.vue'
import { taskName, useFarm } from '../ui/farm'
import FieldPicker from '../ui/FieldPicker.vue'
import NewTaskModal from '../ui/NewTaskModal.vue'
import NewUnitModal from '../ui/NewUnitModal.vue'
import NumberStepper from '../ui/NumberStepper.vue'
import { useSaving } from '../ui/saving'
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
        fieldProgress(
          farm.value.fields,
          farm.value.entries,
          tt,
          isoDate,
          seasonStart(),
          undefined,
          farm.value.taskTypes,
        ),
      )
    : undefined
}

const type = computed(() => farm.value.taskTypes.find((x) => x.id === typeId.value))
const kind = computed<InputKind>(() => type.value?.inputKind ?? 'harvest')

const progress = computed(() =>
  type.value
    ? fieldProgress(
        farm.value.fields,
        farm.value.entries,
        type.value,
        date.value,
        seasonStart(),
        editing?.id,
        farm.value.taskTypes,
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

// The trees box starts with all the trees still left in the chosen field (for tasks that count
// trees). It follows the field, task and date until the user changes the number by hand.
let treesFollowField = !editing
let lastAutoTrees: number | null = null
function fillTrees() {
  if (!treesFollowField) {
    return
  }
  const remaining = current.value?.remaining
  lastAutoTrees = kind.value !== 'done' && remaining ? remaining : null
  trees.value = lastAutoTrees
}
watch([fieldId, typeId, () => current.value?.remaining], fillTrees, { immediate: true })
watch(trees, (value) => {
  if (value !== lastAutoTrees) {
    treesFollowField = false
  }
})

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

  if (editing) {
    showToast({ title: translate('today.updated') })
    void router.push({ path: '/journal', query: { date: date.value } })

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
  fieldId.value = defaultFieldId(after)
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
</script>

<template>
  <main class="page today">
    <header class="page-head">
      <h1>{{ editing ? $t('today.editTitle') : $t('today.title') }}</h1>
    </header>

    <div class="task-chips" role="tablist">
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
        <span aria-hidden="true">{{ x.icon }}</span> {{ taskName($t, x) }}
      </button>
      <button v-if="!editing" type="button" class="task-chip add" @click="newTask = true">
        + {{ $t('task.new') }}
      </button>
    </div>

    <section class="card">
      <div class="row-between">
        <label class="label" for="date">{{ $t('today.date') }}</label>
        <div class="chips tight">
          <button
            type="button"
            class="chip"
            :class="[{ selected: date === today }]"
            @click="date = today"
          >
            {{ $t('today.today') }}
          </button>
          <button
            type="button"
            class="chip"
            :class="[{ selected: date === addDays(today, -1) }]"
            @click="date = addDays(today, -1)"
          >
            {{ $t('today.yesterday') }}
          </button>
          <DateField id="date" v-model="date" :max="today" :label="$t('today.date')" arrows />
        </div>
      </div>
    </section>

    <section class="card">
      <span class="label">{{ $t('today.field') }}</span>
      <p v-if="progress.length === 0" class="muted">
        {{ $t('today.noFields') }}
        <RouterLink to="/settings#fields">{{ $t('today.addFields') }}</RouterLink>
      </p>
      <FieldPicker v-else v-model="fieldId" :fields="sortForPicker(progress)" />
    </section>

    <template v-if="fieldId">
      <section v-if="kind !== 'done'" class="card">
        <label class="label" for="trees">{{ treesLabel }}</label>
        <NumberStepper id="trees" v-model="trees" :label="treesLabel" :max="maxTrees" />
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
              <option value="__new">{{ $t('today.newUnit') }}</option>
            </select>
            <button
              v-if="quantities.length > 1"
              type="button"
              class="icon-btn"
              :aria-label="$t('common.delete')"
              @click="quantities.splice(i, 1)"
            >
              ×
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
          + {{ $t('today.addUnitRow') }}
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
          + {{ $t('today.notes') }}
        </button>
      </section>
    </template>

    <p v-if="error" class="error">{{ error }}</p>

    <div v-if="fieldId" class="save-bar">
      <button v-if="editing" type="button" class="btn ghost" @click="router.back()">
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
