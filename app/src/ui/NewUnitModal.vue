<script setup lang="ts">
import { ref } from 'vue'
import AppModal from './AppModal.vue'
import { useFarm } from './farm'

const emit = defineEmits<{ close: []; created: [id: string] }>()
const farm = useFarm()
const name = ref('')

async function create() {
  if (!name.value.trim()) {
    return
  }
  const row = await farm.value.repo.addUnit({
    name: name.value.trim(),
    isDefault: false,
    archived: false,
  })
  emit('created', row.id)
  emit('close')
}
</script>

<template>
  <AppModal :title="$t('today.newUnit')" @close="emit('close')">
    <label class="label" for="nu-name">{{ $t('today.newUnitName') }}</label>
    <input id="nu-name" v-model="name" class="input" autofocus />
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
