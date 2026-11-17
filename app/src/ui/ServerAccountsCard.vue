<script setup lang="ts">
import type { ServerAccount } from '../core/syncFormat'
import { useTranslation } from 'i18next-vue'
import { computed, onMounted, ref } from 'vue'
import { MIN_PASSWORD_LENGTH } from '../core/syncFormat'
import { suggestTemporaryPassword } from '../core/tempPassword'
import { formatLocale } from '../i18n'
import { ApiError, listAccounts, removeAccount, resetAccountPassword } from '../sync/api'
import AppModal from './AppModal.vue'

/**
 * For the installation owner: every account on this server, to help people (a new temporary
 * password, deleting an account). Other people's groves are shown without their data.
 */
const { t: translate } = useTranslation()
const accounts = ref<ServerAccount[]>([])
const error = ref('')
const open = ref<string | null>(null)
const handOver = ref<{ username: string; password: string } | null>(null)

const ERRORS: Record<string, string> = {
  'only-admin': 'serverAccounts.errorOnlyAdmin',
  'not-allowed': 'users.errorNotAllowed',
  'password-short': 'account.errorShort',
}

function explain(caught: unknown) {
  error.value =
    caught instanceof ApiError
      ? translate(ERRORS[caught.code] ?? 'account.errorServer', { count: MIN_PASSWORD_LENGTH })
      : translate('account.errorOffline')
}

async function load() {
  try {
    accounts.value = await listAccounts()
    error.value = ''
  } catch (caught) {
    explain(caught)
  }
}
onMounted(load)

/** Others first need help; the owner is listed for completeness. */
const others = computed(() => accounts.value.filter((entry) => !entry.isOwner))

function when(time: number | null) {
  if (!time) {
    return translate('serverAccounts.neverSignedIn')
  }
  const date = new Intl.DateTimeFormat(formatLocale.value, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(time)

  return translate('serverAccounts.lastActive', { date })
}

function groveLine(grove: ServerAccount['groves'][number]) {
  const role = translate(
    grove.role === 'admin' ? 'serverAccounts.admin' : 'serverAccounts.user',
  )
  if (grove.name) {
    return translate('serverAccounts.inYourGrove', { name: grove.name, role })
  }

  return translate('serverAccounts.otherGrove', { role, count: grove.people })
}

function notes(entry: ServerAccount) {
  const list = [when(entry.lastActive)]
  if (entry.mustChangePassword) {
    list.push(translate('users.waiting'))
  }
  if (entry.waitingForGrove) {
    list.push(translate('serverAccounts.waitingForGrove'))
  } else if (entry.groves.length === 0) {
    list.push(translate('serverAccounts.noGrove'))
  }

  return list.join(' · ')
}

function toggle(entry: ServerAccount) {
  open.value = open.value === entry.userId ? null : entry.userId
  handOver.value = null
  error.value = ''
}

async function newTemporaryPassword(entry: ServerAccount) {
  const password = suggestTemporaryPassword()

  try {
    accounts.value = await resetAccountPassword(entry.userId, password)
    handOver.value = { username: entry.username, password }
  } catch (caught) {
    explain(caught)
  }
}

/* ---------- deleting ---------- */
const deleting = ref<ServerAccount | null>(null)
const typedName = ref('')
/** Groves that go with the account: nobody else uses them. */
const grovesDeleted = computed(
  () => deleting.value?.groves.filter((grove) => grove.people <= 1).length ?? 0,
)
/**
 * The only administrator of a grove others use: someone else must become administrator first.
 */
const blocked = computed(
  () =>
    deleting.value?.groves.some(
      (grove) => grove.role === 'admin' && grove.people > 1 && grove.admins <= 1,
    ) ?? false,
)
const confirmed = computed(
  () =>
    grovesDeleted.value === 0 ||
    typedName.value.trim().toLowerCase() === deleting.value?.username.toLowerCase(),
)

function startDeleting(entry: ServerAccount) {
  deleting.value = entry
  typedName.value = ''
}

async function confirmDelete() {
  const entry = deleting.value
  if (!entry || blocked.value || !confirmed.value) {
    return
  }
  deleting.value = null

  try {
    accounts.value = await removeAccount(entry.userId)
    open.value = null
  } catch (caught) {
    explain(caught)
  }
}
</script>

<template>
  <section class="card server-accounts">
    <h2>{{ $t('serverAccounts.title') }}</h2>
    <p class="muted small">{{ $t('serverAccounts.help') }}</p>

    <p v-if="accounts.length > 0 && others.length === 0" class="hint">
      {{ $t('serverAccounts.onlyYou') }}
    </p>
    <ul class="member-list">
      <li v-for="entry in others" :key="entry.userId">
        <div class="member-head">
          <span class="member-name">
            <strong>{{ entry.username }}</strong>
            <small class="muted">{{ notes(entry) }}</small>
            <small v-for="grove in entry.groves" :key="grove.farmId" class="muted">
              {{ groveLine(grove) }}
            </small>
          </span>
          <button
            type="button"
            class="btn ghost small"
            :aria-expanded="open === entry.userId"
            @click="toggle(entry)"
          >
            {{ $t('serverAccounts.manage') }}
          </button>
        </div>
        <div v-if="open === entry.userId" class="member-edit">
          <div class="actions wrap">
            <button type="button" class="btn ghost small" @click="newTemporaryPassword(entry)">
              {{ $t('users.newPassword') }}
            </button>
            <button type="button" class="btn ghost small danger" @click="startDeleting(entry)">
              {{ $t('serverAccounts.delete') }}
            </button>
          </div>
          <div v-if="handOver" class="hand-over" role="status">
            <strong>{{ $t('users.handOverTitle', { name: handOver.username }) }}</strong>
            <p>
              {{ $t('users.handOverName') }} <code>{{ handOver.username }}</code><br />
              {{ $t('users.handOverPassword') }} <code>{{ handOver.password }}</code>
            </p>
            <p class="small">{{ $t('serverAccounts.resetHelp') }}</p>
          </div>
        </div>
      </li>
    </ul>

    <p v-if="error" class="error" role="alert">{{ error }}</p>

    <AppModal v-if="deleting" :title="$t('serverAccounts.delete')" @close="deleting = null">
      <p v-if="blocked">{{ $t('serverAccounts.errorOnlyAdmin') }}</p>
      <p v-else-if="grovesDeleted === 0">
        {{ $t('serverAccounts.deleteHelp', { name: deleting.username }) }}
      </p>
      <template v-else>
        <p>
          {{
            $t('serverAccounts.deleteGroves', {
              name: deleting.username,
              count: grovesDeleted,
            })
          }}
        </p>
        <label class="type-name" for="delete-account-name">
          {{ $t('serverAccounts.typeName', { name: deleting.username }) }}
        </label>
        <input
          id="delete-account-name"
          v-model="typedName"
          class="input"
          autocomplete="off"
          autocapitalize="none"
          spellcheck="false"
        />
      </template>
      <div class="actions">
        <button type="button" class="btn ghost" @click="deleting = null">
          {{ $t('common.cancel') }}
        </button>
        <button
          v-if="!blocked"
          type="button"
          class="btn primary"
          :disabled="!confirmed"
          @click="confirmDelete"
        >
          {{ $t('serverAccounts.delete') }}
        </button>
      </div>
    </AppModal>
  </section>
</template>
