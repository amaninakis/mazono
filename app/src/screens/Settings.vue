<script setup lang="ts">
import { useTranslation } from 'i18next-vue';
import { computed, ref } from 'vue';
import { TASK_COLORS, TASK_ICONS } from '../core/defaults';
import { unitWeights } from '../core/oil';
import { parseDecimal } from '../core/progress';
import type { InputKind, Language, TaskType } from '../core/types';
import { db } from '../db/db';
import { importFarm } from '../db/repo';
import { formatNumber } from '../core/format';
import { LANGUAGES, locale, setLanguage } from '../i18n';
import Toggle from '../ui/Toggle.vue';
import { chargeName, locationName, taskName, useFarm } from '../ui/farm';
import { showToast } from '../ui/toast';

const { t } = useTranslation();
const farm = useFarm();
const repo = computed(() => farm.value.repo);
const settings = computed(() => farm.value.settings);
const showArchived = ref(false);
const newField = ref({ name: '', trees: '' });
const newUnit = ref('');
const kinds: InputKind[] = ['harvest', 'trees', 'quantity', 'done'];
const version = __APP_VERSION__;

const months = computed(() =>
  Array.from({ length: 12 }, (_, i) => ({
    n: i + 1,
    short: new Intl.DateTimeFormat(locale.value, { month: 'short' }).format(new Date(2024, i, 1)),
    long: new Intl.DateTimeFormat(locale.value, { month: 'long' }).format(new Date(2024, i, 1)),
  })),
);

const visible = <T extends { archived: boolean }>(rows: T[]) => rows.filter((r) => showArchived.value || !r.archived);
const fieldList = computed(() => visible(farm.value.fields).sort((a, b) => a.order - b.order));
const unitList = computed(() => visible(farm.value.units));
const typeList = computed(() => visible(farm.value.taskTypes).sort((a, b) => a.order - b.order));
const millList = computed(() => visible(farm.value.mills));
const chargeList = computed(() => visible(farm.value.chargeTypes).sort((a, b) => a.order - b.order));
const locationList = computed(() => visible(farm.value.locations).sort((a, b) => a.order - b.order));
const weights = computed(() => unitWeights(farm.value.units, farm.value.extractions));
const newMill = ref('');
const newChargeName = ref('');
const newLocation = ref('');

async function addMill() {
  if (!newMill.value.trim()) return;
  await repo.value.put('mills', { name: newMill.value.trim(), archived: false });
  newMill.value = '';
}
async function addChargeType() {
  if (!newChargeName.value.trim()) return;
  await repo.value.put('chargeTypes', { name: newChargeName.value.trim(), archived: false, order: farm.value.chargeTypes.length });
  newChargeName.value = '';
}
async function addLocation() {
  if (!newLocation.value.trim()) return;
  await repo.value.put('locations', { name: newLocation.value.trim(), archived: false, order: farm.value.locations.length });
  newLocation.value = '';
}
function renameBuiltin(table: 'chargeTypes' | 'locations', id: string, current: string, e: Event) {
  const v = val(e).trim();
  if (v && v !== current) void repo.value.update(table, id, { name: v });
}

const val = (e: Event) => (e.target as HTMLInputElement).value;

function changeLang(l: Language) {
  setLanguage(l);
  void repo.value.updateSettings({ language: l });
}

async function addField() {
  if (!newField.value.name.trim()) return;
  await repo.value.addField({
    name: newField.value.name.trim(),
    trees: Math.round(parseDecimal(newField.value.trees) ?? 0),
    archived: false,
    order: farm.value.fields.length,
  });
  newField.value = { name: '', trees: '' };
}

async function addUnit() {
  if (!newUnit.value.trim()) return;
  await repo.value.addUnit({ name: newUnit.value.trim(), isDefault: farm.value.units.length === 0, archived: false });
  newUnit.value = '';
}

async function addTaskType() {
  const n = farm.value.taskTypes.length;
  await repo.value.addTaskType({
    name: t('task.new'),
    inputKind: 'trees',
    color: TASK_COLORS[n % TASK_COLORS.length],
    icon: TASK_ICONS[(n + 4) % TASK_ICONS.length],
    activeMonths: [],
    archived: false,
    order: n,
  });
}

function renameType(x: TaskType, e: Event) {
  const v = val(e).trim();
  if (v && v !== taskName(t, x)) void repo.value.update('taskTypes', x.id, { name: v });
}

function toggleMonth(x: TaskType, m: number) {
  const on = x.activeMonths.includes(m);
  void repo.value.update('taskTypes', x.id, {
    activeMonths: on ? x.activeMonths.filter((n) => n !== m) : [...x.activeMonths, m].sort((a, b) => a - b),
  });
}

async function exportData() {
  const data = await repo.value.exportAll();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `harvestlog-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

async function importData(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file || !window.confirm(t('settings.importConfirm'))) return;
  try {
    await importFarm(JSON.parse(await file.text()));
    showToast({ title: t('settings.importDone') });
  } catch {
    showToast({ title: t('settings.importFailed') });
  }
}
</script>

<template>
  <main class="page settings">
    <header class="page-head">
      <h1>{{ t('settings.title') }}</h1>
    </header>

    <section class="card">
      <h2>{{ t('settings.general') }}</h2>
      <label class="label" for="s-farm">{{ t('settings.farmName') }}</label>
      <input
        id="s-farm"
        class="input"
        :value="farm.farmName"
        @blur="(e) => val(e).trim() && db.farms.update(repo.farmId, { name: val(e).trim() })"
      />
      <span class="label">{{ t('settings.language') }}</span>
      <div class="chips">
        <button
          v-for="l in LANGUAGES"
          :key="l.code"
          type="button"
          :class="['chip', { selected: settings.language === l.code }]"
          @click="changeLang(l.code)"
        >
          {{ l.label }}
        </button>
      </div>
      <span class="label">{{ t('settings.yieldFormat') }}</span>
      <div class="chips">
        <button
          v-for="f in ['ratio', 'percent'] as const"
          :key="f"
          type="button"
          :class="['chip', { selected: settings.yieldFormat === f }]"
          @click="repo.updateSettings({ yieldFormat: f })"
        >
          {{ t(f === 'ratio' ? 'settings.yieldRatio' : 'settings.yieldPercent') }}
        </button>
      </div>
      <label class="label" for="s-season">{{ t('settings.seasonStart') }}</label>
      <select
        id="s-season"
        class="input select"
        :value="settings.seasonStartMonth"
        @change="(e) => repo.updateSettings({ seasonStartMonth: Number(val(e)) })"
      >
        <option v-for="m in months" :key="m.n" :value="m.n">{{ m.long }}</option>
      </select>
    </section>

    <section class="card">
      <h2>{{ t('settings.modules') }}</h2>
      <Toggle
        :model-value="settings.labourEnabled"
        :label="t('settings.labour')"
        :help="t('settings.labourHelp')"
        @update:model-value="(v) => repo.updateSettings({ labourEnabled: v })"
      />
    </section>

    <div class="row-end">
      <Toggle v-model="showArchived" :label="t('settings.showArchived')" />
    </div>

    <section id="fields" class="card">
      <h2>{{ t('settings.fields') }}</h2>
      <ul class="list">
        <li v-for="f in fieldList" :key="f.id" :class="['field-row', { off: f.archived }]">
          <input
            class="input"
            :aria-label="t('common.name')"
            :value="f.name"
            @blur="(e) => val(e).trim() && repo.update('fields', f.id, { name: val(e).trim() })"
          />
          <input
            class="input small"
            inputmode="numeric"
            :aria-label="t('common.trees')"
            :placeholder="t('common.trees')"
            :value="f.trees || ''"
            @blur="(e) => repo.update('fields', f.id, { trees: Math.round(parseDecimal(val(e)) ?? 0) })"
          />
          <button type="button" class="btn ghost small" @click="repo.update('fields', f.id, { archived: !f.archived })">
            {{ f.archived ? t('common.unarchive') : t('common.archive') }}
          </button>
        </li>
        <li class="field-row">
          <input
            v-model="newField.name"
            class="input"
            :placeholder="t('setup.fieldName')"
            :aria-label="t('setup.fieldName')"
            @keydown.enter="addField"
          />
          <input
            v-model="newField.trees"
            class="input small"
            inputmode="numeric"
            :placeholder="t('common.trees')"
            :aria-label="t('common.trees')"
            @keydown.enter="addField"
          />
          <button type="button" class="btn small" @click="addField">{{ t('common.add') }}</button>
        </li>
      </ul>
    </section>

    <section class="card">
      <h2>{{ t('settings.units') }}</h2>
      <p class="muted small">{{ t('setup.unitsHelp') }}</p>
      <ul class="list">
        <li v-for="u in unitList" :key="u.id" :class="['unit-row', { off: u.archived }]">
          <input
            class="input"
            :aria-label="t('common.name')"
            :value="u.name"
            @blur="(e) => val(e).trim() && repo.update('units', u.id, { name: val(e).trim() })"
          />
          <input
            class="input"
            :aria-label="t('setup.pluralName')"
            :placeholder="t('setup.pluralName')"
            :value="u.pluralName ?? ''"
            @blur="(e) => repo.update('units', u.id, { pluralName: val(e).trim() || undefined })"
          />
          <input
            class="input small"
            inputmode="decimal"
            :placeholder="t('setup.approxKg')"
            :aria-label="t('setup.approxKg')"
            :value="u.approxKg ?? ''"
            @blur="(e) => repo.update('units', u.id, { approxKg: parseDecimal(val(e)) ?? undefined })"
          />
          <small v-if="weights[u.id]?.source === 'learned'" class="muted learned">
            {{ t('settings.learnedWeight', { kg: formatNumber(weights[u.id].kg, locale, 1), count: weights[u.id].batches }) }}
          </small>
          <label class="radio">
            <input type="radio" name="s-default-unit" :checked="u.isDefault" @change="repo.setDefaultUnit(u.id)" />
            <span>{{ t('setup.default') }}</span>
          </label>
          <button
            type="button"
            class="btn ghost small"
            :disabled="u.isDefault && !u.archived"
            @click="repo.update('units', u.id, { archived: !u.archived })"
          >
            {{ u.archived ? t('common.unarchive') : t('common.archive') }}
          </button>
        </li>
      </ul>
      <div class="inline-add">
        <input v-model="newUnit" class="input" :placeholder="t('setup.unitName')" @keydown.enter="addUnit" />
        <button type="button" class="btn small" @click="addUnit">{{ t('common.add') }}</button>
      </div>
    </section>

    <section id="oil" class="card">
      <h2>{{ t('settings.oilSection') }}</h2>

      <span class="label">{{ t('settings.mills') }}</span>
      <ul class="list">
        <li v-for="m in millList" :key="m.id" :class="['field-row', { off: m.archived }]">
          <input
            class="input"
            :aria-label="t('common.name')"
            :value="m.name"
            @blur="(e) => val(e).trim() && repo.update('mills', m.id, { name: val(e).trim() })"
          />
          <button type="button" class="btn ghost small" @click="repo.update('mills', m.id, { archived: !m.archived })">
            {{ m.archived ? t('common.unarchive') : t('common.archive') }}
          </button>
        </li>
      </ul>
      <div class="inline-add">
        <input v-model="newMill" class="input" :placeholder="t('extraction.newMillName')" @keydown.enter="addMill" />
        <button type="button" class="btn small" @click="addMill">{{ t('common.add') }}</button>
      </div>

      <span class="label">{{ t('settings.chargeTypes') }}</span>
      <ul class="list">
        <li v-for="c in chargeList" :key="c.id" :class="['field-row', { off: c.archived }]">
          <input
            :key="`${c.id}-${locale}`"
            class="input"
            :aria-label="t('common.name')"
            :value="chargeName(t, c)"
            @blur="(e) => renameBuiltin('chargeTypes', c.id, chargeName(t, c), e)"
          />
          <input
            class="input small"
            inputmode="decimal"
            :aria-label="t('settings.defaultPercent')"
            :placeholder="t('settings.defaultPercent')"
            :value="c.defaultPercent ?? ''"
            @blur="(e) => repo.update('chargeTypes', c.id, { defaultPercent: parseDecimal(val(e)) ?? undefined })"
          />
          <span class="muted">%</span>
          <button type="button" class="btn ghost small" @click="repo.update('chargeTypes', c.id, { archived: !c.archived })">
            {{ c.archived ? t('common.unarchive') : t('common.archive') }}
          </button>
        </li>
      </ul>
      <div class="inline-add">
        <input v-model="newChargeName" class="input" :placeholder="t('extraction.newChargeName')" @keydown.enter="addChargeType" />
        <button type="button" class="btn small" @click="addChargeType">{{ t('common.add') }}</button>
      </div>

      <span class="label">{{ t('settings.locations') }}</span>
      <ul class="list">
        <li v-for="l in locationList" :key="l.id" :class="['field-row', { off: l.archived }]">
          <input
            :key="`${l.id}-${locale}`"
            class="input"
            :aria-label="t('common.name')"
            :value="locationName(t, l)"
            @blur="(e) => renameBuiltin('locations', l.id, locationName(t, l), e)"
          />
          <button type="button" class="btn ghost small" @click="repo.update('locations', l.id, { archived: !l.archived })">
            {{ l.archived ? t('common.unarchive') : t('common.archive') }}
          </button>
        </li>
      </ul>
      <div class="inline-add">
        <input v-model="newLocation" class="input" :placeholder="t('settings.addLocation')" @keydown.enter="addLocation" />
        <button type="button" class="btn small" @click="addLocation">{{ t('common.add') }}</button>
      </div>
    </section>

    <section class="card">
      <h2>{{ t('settings.taskTypes') }}</h2>
      <ul class="list task-types">
        <li v-for="x in typeList" :key="x.id" :class="['tt', { off: x.archived }]" :style="{ '--c': x.color }">
          <div class="tt-head">
            <select
              class="input select icon-select"
              :aria-label="t('settings.icon')"
              :value="x.icon"
              @change="(e) => repo.update('taskTypes', x.id, { icon: val(e) })"
            >
              <option v-for="i in [...new Set([x.icon, ...TASK_ICONS])]" :key="i">{{ i }}</option>
            </select>
            <input
              :key="`${x.id}-${locale}`"
              class="input"
              :aria-label="t('common.name')"
              :value="taskName(t, x)"
              @blur="(e) => renameType(x, e)"
            />
            <button
              type="button"
              class="btn ghost small"
              @click="repo.update('taskTypes', x.id, { archived: !x.archived })"
            >
              {{ x.archived ? t('common.unarchive') : t('common.archive') }}
            </button>
          </div>
          <div class="swatches" role="radiogroup" :aria-label="t('settings.color')">
            <button
              v-for="c in TASK_COLORS"
              :key="c"
              type="button"
              role="radio"
              :aria-checked="x.color === c"
              :aria-label="c"
              :class="['swatch', { selected: x.color === c }]"
              :style="{ background: c }"
              @click="repo.update('taskTypes', x.id, { color: c })"
            />
          </div>
          <select
            v-if="!x.builtin"
            class="input select"
            :value="x.inputKind"
            @change="(e) => repo.update('taskTypes', x.id, { inputKind: val(e) as InputKind })"
          >
            <option v-for="k in kinds" :key="k" :value="k">{{ t(`inputKind.${k}`) }}</option>
          </select>
          <span class="label small">{{ t('settings.activeMonths') }}</span>
          <div class="months">
            <button
              v-for="m in months"
              :key="m.n"
              type="button"
              :aria-pressed="x.activeMonths.includes(m.n)"
              :class="['month', { on: x.activeMonths.includes(m.n) }]"
              @click="toggleMonth(x, m.n)"
            >
              {{ m.short }}
            </button>
          </div>
        </li>
      </ul>
      <button type="button" class="btn small" @click="addTaskType">+ {{ t('settings.addTaskType') }}</button>
    </section>

    <section class="card">
      <h2>{{ t('settings.data') }}</h2>
      <p class="muted small">{{ t('settings.storageNote') }}</p>
      <div class="actions wrap">
        <button type="button" class="btn" @click="exportData">{{ t('settings.export') }}</button>
        <label class="btn ghost file-btn">
          {{ t('settings.import') }}
          <input type="file" accept="application/json" @change="importData" />
        </label>
      </div>
    </section>

    <p class="muted small center">{{ t('settings.version', { version }) }}</p>
  </main>
</template>
