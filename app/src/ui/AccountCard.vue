<script setup lang="ts">
import { useTranslation } from 'i18next-vue'
import { computed, ref } from 'vue'
import { localDb } from '../db/db'
import { formatLocale } from '../i18n'
import { account, changePassword, signOut, syncNow } from '../sync/account'
import { ApiError, removeFarm } from '../sync/api'
import { groveHasData, removeLocalGrove } from '../sync/groves'
import AppModal from './AppModal.vue'
import { useLiveQuery } from './live'
import { passwordMessage } from './passwordMessage'
import { showToast } from './toast'

/** The grove data on this phone (picked before the app started). */
const db = localDb()

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
  const weak = passwordMessage(next.value, account.user?.username)
  if (weak) {
    passwordError.value = weak
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
      caught instanceof ApiError
        ? apiPasswordError(caught.code)
        : translate('account.errorOffline')
  }
}

function apiPasswordError(code: string) {
  if (code === 'wrong-password') {
    return translate('account.errorCurrent')
  }

  return code === 'password-common'
    ? translate('account.errorCommon')
    : translate('account.errorServer')
}

/* ---------- groves ---------- */
/** The groves on this device, the open one first; whether each holds any data. */
const groves = useLiveQuery(async () => {
  const current = (await db.meta.get('currentFarmId'))?.value
  const farms = await db.farms.toArray()
  const list = await Promise.all(
    farms.map(async (farm) => ({
      id: farm.id,
      name: farm.name,
      open: farm.id === current,
      empty: !(await groveHasData(db, farm.id)),
    })),
  )

  return list.sort((left, right) => Number(right.open) - Number(left.open))
})
const removing = ref<{ id: string; name: string } | null>(null)
const groveError = ref('')

async function openGrove(id: string) {
  await db.meta.put({ key: 'currentFarmId', value: id })
  showToast({ title: translate('account.groveOpened') })
}

async function removeGrove() {
  const grove = removing.value
  removing.value = null
  if (!grove) {
    return
  }
  groveError.value = ''

  try {
    await removeFarm(grove.id)
    await removeLocalGrove(db, grove.id)
    await syncNow()
    showToast({ title: translate('account.groveRemoved', { name: grove.name }) })
  } catch (caught) {
    groveError.value =
      caught instanceof ApiError && caught.code === 'not-empty'
        ? translate('account.groveNotEmpty')
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

    <template v-if="groves && groves.length > 1">
      <h3>{{ $t('account.groves') }}</h3>
      <ul class="grove-list">
        <li v-for="grove in groves" :key="grove.id" :class="{ open: grove.open }">
          <span class="grove-name">
            <strong>{{ grove.name }}</strong>
            <small class="muted">
              {{ grove.open ? $t('account.groveOpen') : '' }}
              {{ grove.empty ? $t('account.groveEmpty') : '' }}
            </small>
          </span>
          <button
            v-if="!grove.open"
            type="button"
            class="btn ghost small"
            @click="openGrove(grove.id)"
          >
            {{ $t('account.groveOpenButton') }}
          </button>
          <button
            v-if="grove.empty"
            type="button"
            class="btn ghost small danger"
            @click="removing = { id: grove.id, name: grove.name }"
          >
            {{ $t('account.groveRemove') }}
          </button>
        </li>
      </ul>
      <p v-if="groveError" class="error" role="alert">{{ groveError }}</p>
    </template>

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

    <AppModal v-if="removing" :title="$t('account.groveRemove')" @close="removing = null">
      <p>{{ $t('account.groveRemoveHelp', { name: removing.name }) }}</p>
      <div class="actions">
        <button type="button" class="btn ghost" @click="removing = null">
          {{ $t('common.cancel') }}
        </button>
        <button type="button" class="btn primary" @click="removeGrove">
          {{ $t('account.groveRemove') }}
        </button>
      </div>
    </AppModal>

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
