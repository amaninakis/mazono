<script setup lang="ts">
import type { InputKind } from '../core/types'
import { ref } from 'vue'
import { TASK_COLORS, TASK_ICONS } from '../core/defaults'
import AppModal from './AppModal.vue'
import { useFarm } from './farm'

const emit = defineEmits<{ close: []; created: [id: string] }>()
const farm = useFarm()
const name = ref('')
const kind = ref<InputKind>('trees')
const kinds: InputKind[] = ['harvest', 'trees', 'quantity', 'done']

async function create() {
  if (!name.value.trim()) {
    return
  }
  const value = farm.value.taskTypes.length
  const row = await farm.value.repo.addTaskType({
    name: name.value.trim(),
    inputKind: kind.value,
    color: TASK_COLORS[value % TASK_COLORS.length],
    icon: TASK_ICONS[(value + 4) % TASK_ICONS.length],
    activeMonths: [],
    archived: false,
    order: value,
  })
  emit('created', row.id)
  emit('close')
}
</script>

<template>
  <AppModal :title="$t('today.newTaskTitle')" @close="emit('close')">
    <label class="label" for="nt-name">{{ $t('today.newTaskName') }}</label>
    <input id="nt-name" v-model="name" class="input" autofocus />
    <span class="label">{{ $t('today.newTaskKind') }}</span>
    <div class="radio-list">
      <label v-for="k in kinds" :key="k" class="radio">
        <input v-model="kind" type="radio" name="nt-kind" :value="k" />
        <span>{{ $t(`inputKind.${k}`) }}</span>
      </label>
    </div>
    <div class="actions">
      <button type="button" class="btn ghost" @click="emit('close')">
        {{ $t('common.cancel') }}
      </button>
      <button type="button" class="btn primary" @click="create">
        {{ $t('today.create') }}
      </button>
    </div>
  </AppModal>
</template>
