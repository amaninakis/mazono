<script setup lang="ts">
import { useTranslation } from 'i18next-vue'
import { computed, ref } from 'vue'
import { MIN_PASSWORD_LENGTH } from '../core/syncFormat'
import { formatLocale } from '../i18n'
import { account, changePassword, signOut, syncNow } from '../sync/account'
import { ApiError } from '../sync/api'
import AppModal from './AppModal.vue'
import { showToast } from './toast'

/** Settings card: who is signed in, how syncing is going, password and signing out. */
const { t: translate } = useTranslation()

const syncLine = computed(() => {
  if (account.sync === 'syncing') {
    return translate('account.syncing')
  }
  if (account.sync === 'offline') {
    return translate('account.offline', { count: account.pending })
  }
  if (account.sync === 'error') {
    return translate('account.syncError')
  }
  if (account.pending > 0) {
    return translate('account.pending', { count: account.pending })
  }
  if (!account.lastSync) {
    return translate('account.notYet')
  }
  const time = new Intl.DateTimeFormat(formatLocale.value, {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(account.lastSync)

  return translate('account.synced', { time })
})

/* ---------- password ---------- */
const changing = ref(false)
const current = ref('')
const next = ref('')
const repeat = ref('')
const passwordError = ref('')

async function savePassword() {
  passwordError.value = ''
  if (next.value.length < MIN_PASSWORD_LENGTH) {
    passwordError.value = translate('account.errorShort', { count: MIN_PASSWORD_LENGTH })
    return
  }
  if (next.value !== repeat.value) {
    passwordError.value = translate('account.errorRepeat')
    return
  }

  try {
    await changePassword(current.value, next.value)
    changing.value = false
    current.value = ''
    next.value = ''
    repeat.value = ''
    showToast({ title: translate('account.passwordChanged') })
  } catch (caught) {
    passwordError.value =
      caught instanceof ApiError && caught.code === 'wrong-password'
        ? translate('account.errorCurrent')
        : translate('account.errorOffline')
  }
}

/* ---------- sign out ---------- */
const confirmSignOut = ref(false)

async function askSignOut() {
  await syncNow()
  confirmSignOut.value = true
}
</script>

<template>
  <section class="card account-card">
    <h2>{{ $t('account.title') }}</h2>
    <p>
      {{ $t('account.signedInAs', { name: account.user?.username }) }}
      <span v-if="account.user?.isOwner" class="muted"
        >· {{ $t('account.administrator') }}</span
      >
    </p>
    <p class="sync-line" :class="account.sync" aria-live="polite">{{ syncLine }}</p>
    <div class="actions">
      <button
        type="button"
        class="btn ghost small"
        :disabled="account.sync === 'syncing'"
        @click="syncNow()"
      >
        ⟳ {{ $t('account.syncNow') }}
      </button>
      <button type="button" class="btn ghost small" @click="changing = !changing">
        {{ $t('account.changePassword') }}
      </button>
      <button type="button" class="btn ghost small" @click="askSignOut">
        {{ $t('account.signOut') }}
      </button>
    </div>

    <form v-if="changing" class="password-form" @submit.prevent="savePassword">
      <input name="username" autocomplete="username" :value="account.user?.username" hidden />
      <label class="label" for="pw-current">{{ $t('account.currentPassword') }}</label>
      <input
        id="pw-current"
        v-model="current"
        class="input"
        type="password"
        autocomplete="current-password"
        required
      />
      <label class="label" for="pw-next">{{ $t('account.newPassword') }}</label>
      <input
        id="pw-next"
        v-model="next"
        class="input"
        type="password"
        autocomplete="new-password"
        required
      />
      <label class="label" for="pw-repeat">{{ $t('account.repeat') }}</label>
      <input
        id="pw-repeat"
        v-model="repeat"
        class="input"
        type="password"
        autocomplete="new-password"
        required
      />
      <p v-if="passwordError" class="error" role="alert">{{ passwordError }}</p>
      <button type="submit" class="btn primary small">{{ $t('common.save') }}</button>
    </form>

    <AppModal
      v-if="confirmSignOut"
      :title="$t('account.signOut')"
      @close="confirmSignOut = false"
    >
      <p>{{ $t('account.signOutHelp') }}</p>
      <p v-if="account.pending > 0" class="error">
        {{ $t('account.signOutPending', { count: account.pending }) }}
      </p>
      <div class="actions">
        <button type="button" class="btn ghost" @click="confirmSignOut = false">
          {{ $t('common.cancel') }}
        </button>
        <button type="button" class="btn primary" @click="signOut()">
          {{ $t('account.signOut') }}
        </button>
      </div>
    </AppModal>
  </section>
</template>
