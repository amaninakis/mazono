<script setup lang="ts">
import { useTranslation } from 'i18next-vue'
import { computed, ref, watch } from 'vue'
import { seasonLabel, todayISO } from '../core/dates'
import { formatNumber } from '../core/format'
import { formatLocale } from '../i18n'
import AppModal from './AppModal.vue'
import DateField from './DateField.vue'
import { locationName, useFarm } from './farm'
import NumberStepper from './NumberStepper.vue'
import { useSaving } from './saving'
import { showToast } from './toast'

/** Move oil between places, or take it out of stock for own use / gifts. */
const props = defineProps<{
  kind: 'transfer' | 'ownUse'
  stock: Record<number, Record<string, number>>
}>()
const emit = defineEmits<{ close: [] }>()
const { t: translate } = useTranslation()
const farm = useFarm()

const locations = computed(() =>
  farm.value.locations
    .filter((location) => !location.archived)
    .sort((left, right) => left.order - right.order),
)
const vintages = computed(() =>
  Object.entries(props.stock)
    .filter(([, byLoc]) => Object.values(byLoc).some((kg) => kg > 0))
    .map(([value]) => Number(value))
    .sort((left, right) => left - right),
)

const date = ref(todayISO())
const vintage = ref(vintages.value[0])
function available(loc: string) {
  return props.stock[vintage.value]?.[loc] ?? 0
}
const from = ref(
  locations.value.find((location) => available(location.id) > 0)?.id ?? locations.value[0]?.id,
)
const to = ref(locations.value.find((location) => location.id !== from.value)?.id)
const kg = ref<number | null>(null)
const notes = ref('')
const error = ref('')

watch(vintage, () => {
  if (available(from.value) <= 0) {
    from.value =
      locations.value.find((location) => available(location.id) > 0)?.id ?? from.value
  }
})
watch(from, () => {
  if (to.value === from.value) {
    to.value = locations.value.find((location) => location.id !== from.value)?.id
  }
})

const max = computed(() => Math.max(available(from.value ?? ''), 0))
function fmt(value: number) {
  return formatNumber(value, formatLocale.value, 1)
}

const { saving, once } = useSaving()

async function save() {
  await once(saveMove)
}

async function saveMove() {
  if (!kg.value || !from.value || vintage.value == null) {
    return
  }
  if (kg.value > max.value + 0.0001) {
    error.value = translate('move.tooMuch', { kg: fmt(max.value) })
    return
  }
  if (props.kind === 'transfer' && (!to.value || to.value === from.value)) {
    return
  }
  await farm.value.repo.put('stockMovements', {
    date: date.value,
    vintage: vintage.value,
    kind: props.kind,
    fromLocationId: from.value,
    toLocationId: props.kind === 'transfer' ? to.value : undefined,
    kg: kg.value,
    notes: notes.value.trim() || undefined,
  })
  showToast({ title: translate('move.saved') })
  emit('close')
}
</script>

<template>
  <AppModal
    :title="kind === 'transfer' ? $t('move.transferTitle') : $t('move.ownUseTitle')"
    @close="emit('close')"
  >
    <label class="label" for="mv-date">{{ $t('common.date') }}</label>
    <DateField id="mv-date" v-model="date" :label="$t('common.date')" />
    <label class="label" for="mv-vintage">{{ $t('move.vintage') }}</label>
    <select id="mv-vintage" v-model="vintage" class="input select">
      <option v-for="v in vintages" :key="v" :value="v">
        {{ seasonLabel(v, farm.settings.seasonStartMonth) }}
      </option>
    </select>
    <label class="label" for="mv-from">{{ $t('move.from') }}</label>
    <select id="mv-from" v-model="from" class="input select">
      <option v-for="l in locations" :key="l.id" :value="l.id">
        {{ locationName($t, l) }} ({{ fmt(available(l.id)) }})
      </option>
    </select>
    <template v-if="kind === 'transfer'">
      <label class="label" for="mv-to">{{ $t('move.to') }}</label>
      <select id="mv-to" v-model="to" class="input select">
        <option v-for="l in locations.filter((x) => x.id !== from)" :key="l.id" :value="l.id">
          {{ locationName($t, l) }}
        </option>
      </select>
    </template>
    <label class="label" for="mv-kg">{{ $t('move.kg') }}</label>
    <NumberStepper id="mv-kg" v-model="kg" :label="$t('move.kg')" :max="max" />
    <p class="hint">{{ $t('move.available', { kg: fmt(max) }) }}</p>
    <label class="label" for="mv-notes">{{ $t('common.notes') }}</label>
    <input id="mv-notes" v-model="notes" class="input" />
    <p v-if="error" class="error">{{ error }}</p>
    <div class="actions">
      <button type="button" class="btn ghost" @click="emit('close')">
        {{ $t('common.cancel') }}
      </button>
      <button type="button" class="btn primary" :disabled="saving" @click="save">
        {{ $t('common.save') }}
      </button>
    </div>
  </AppModal>
</template>
