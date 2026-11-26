<script setup lang="ts">
import type { SignedInDevice } from '../core/syncFormat'
import { useTranslation } from 'i18next-vue'
import { onMounted, ref } from 'vue'
import { deviceName } from '../core/devices'
import { formatLocale } from '../i18n'
import { ApiError, listDevices, signOutDevice } from '../sync/api'
import { showToast } from './toast'

/**
 * The phones and computers signed in to this account, so a lost or old one can be signed
 * out from here. Signing a device out only means it has to sign in again; nothing is lost.
 */
const { t: translate } = useTranslation()
const devices = ref<SignedInDevice[]>([])
const error = ref('')

async function load() {
  try {
    devices.value = await listDevices()
    error.value = ''
  } catch {
    error.value = translate('account.errorOffline')
  }
}
onMounted(load)

function label(device: SignedInDevice) {
  const { browser, system } = deviceName(device.device)
  if (browser && system) {
    return translate('devices.browserOn', { browser, system })
  }

  return browser ?? system ?? translate('devices.unknown')
}

function lastUsed(device: SignedInDevice) {
  const day = new Date(device.lastUsed)
  const today = new Date()
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1)
  if (day.toDateString() === today.toDateString()) {
    return translate('devices.usedToday')
  }
  if (day.toDateString() === yesterday.toDateString()) {
    return translate('devices.usedYesterday')
  }

  return translate('devices.usedOn', {
    date: new Intl.DateTimeFormat(formatLocale.value, { dateStyle: 'medium' }).format(day),
  })
}

async function signOut(device: SignedInDevice) {
  try {
    await signOutDevice(device.id)
    showToast({ title: translate('devices.signedOut', { name: label(device) }) })
    await load()
  } catch (caught) {
    error.value =
      caught instanceof ApiError
        ? translate('account.errorServer')
        : translate('account.errorOffline')
  }
}
</script>

<template>
  <section class="card devices-card">
    <h2>{{ $t('devices.title') }}</h2>
    <p class="hint">{{ $t('devices.help') }}</p>
    <ul class="device-list">
      <li v-for="device in devices" :key="device.id">
        <span class="device-name">
          <strong>{{ label(device) }}</strong>
          <small class="muted">{{
            device.current ? $t('devices.thisOne') : lastUsed(device)
          }}</small>
        </span>
        <button
          v-if="!device.current"
          type="button"
          class="btn ghost small"
          @click="signOut(device)"
        >
          {{ $t('devices.signOut') }}
        </button>
      </li>
    </ul>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
  </section>
</template>
