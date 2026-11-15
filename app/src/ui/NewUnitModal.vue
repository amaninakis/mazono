<script setup lang="ts">
import { useTranslation } from 'i18next-vue';
import { ref } from 'vue';
import Modal from './Modal.vue';
import { useFarm } from './farm';

const emit = defineEmits<{ close: []; created: [id: string] }>();
const { t } = useTranslation();
const farm = useFarm();
const name = ref('');
const plural = ref('');

async function create() {
  if (!name.value.trim()) return;
  const row = await farm.value.repo.addUnit({
    name: name.value.trim(),
    pluralName: plural.value.trim() || undefined,
    isDefault: false,
    archived: false,
  });
  emit('created', row.id);
  emit('close');
}
</script>

<template>
  <Modal :title="t('today.newUnit')" @close="emit('close')">
    <label class="label" for="nu-name">{{ t('today.newUnitName') }}</label>
    <input id="nu-name" v-model="name" class="input" autofocus />
    <label class="label" for="nu-plural">{{ t('setup.pluralName') }}</label>
    <input id="nu-plural" v-model="plural" class="input" />
    <div class="actions">
      <button type="button" class="btn ghost" @click="emit('close')">{{ t('common.cancel') }}</button>
      <button type="button" class="btn primary" @click="create">{{ t('today.create') }}</button>
    </div>
  </Modal>
</template>
