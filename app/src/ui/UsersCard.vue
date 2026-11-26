<script setup lang="ts">
import type { Permissions, Role } from '../core/access'
import type { Member } from '../core/syncFormat'
import { useTranslation } from 'i18next-vue'
import { onMounted, ref, watch } from 'vue'
import { presetOf, PRESETS } from '../core/access'
import { isValidUsername, MIN_PASSWORD_LENGTH } from '../core/syncFormat'
import { suggestTemporaryPassword } from '../core/tempPassword'
import { account, syncNow } from '../sync/account'
import {
  addMember,
  ApiError,
  listMembers,
  removeMember,
  resetMemberPassword,
  updateMember,
} from '../sync/api'
import AppModal from './AppModal.vue'
import { useFarm } from './farm'
import { useFieldChecks } from './fieldChecks'
import { passwordMessage } from './passwordMessage'
import PermissionsEditor from './PermissionsEditor.vue'

/**
 * Settings card for a grove's administrators: the people in the grove, what each may see and
 * change, adding someone with a temporary password, and removing them.
 */
const { t: translate } = useTranslation()
const farm = useFarm()
const members = ref<Member[]>([])
const error = ref('')

const ERRORS: Record<string, string> = {
  'username': 'account.errorUsername',
  'username-taken': 'users.errorTaken',
  'already-member': 'users.errorAlreadyMember',
  'password-short': 'account.errorShort',
  'password-common': 'account.errorCommon',
  'last-admin': 'users.errorLastAdmin',
  'owner-stays-admin': 'users.errorOwner',
  'not-allowed': 'users.errorNotAllowed',
}

function explain(caught: unknown) {
  error.value =
    caught instanceof ApiError
      ? translate(ERRORS[caught.code] ?? 'account.errorServer', { count: MIN_PASSWORD_LENGTH })
      : translate('account.errorOffline')
}

async function load() {
  try {
    members.value = await listMembers(farm.value.repo.farmId)
    error.value = ''
  } catch (caught) {
    explain(caught)
  }
}
onMounted(load)
// A grove made a moment ago reaches the server with the next sync.
watch(
  () => account.lastSync,
  async () => {
    if (members.value.length === 0) {
      await load()
    }
  },
)

function roleText(member: Member) {
  if (member.role === 'admin') {
    return translate('users.admin')
  }
  const preset = presetOf(member.permissions)

  return translate(`users.presets.${preset ?? 'custom'}`)
}

function memberNotes(member: Member) {
  const notes = [roleText(member)]
  if (member.isOwner) {
    notes.push(translate('users.owner'))
  }
  if (member.userId === account.user?.id) {
    notes.push(translate('users.you'))
  }
  if (member.mustChangePassword) {
    notes.push(translate('users.waiting'))
  }

  return notes.join(' · ')
}

/* ---------- adding ---------- */
const adding = ref(false)
const newName = ref('')
const newPassword = ref('')
const newRole = ref<Role>('user')
const newPermissions = ref<Permissions>({ ...PRESETS.worker })
const ownGrove = ref(false)
/** Shown after adding, so the admin can pass the details on. */
const handOver = ref<{ username: string; password: string; ownGrove: boolean } | null>(null)

const checks = useFieldChecks({
  name: () =>
    isValidUsername(newName.value.trim()) ? '' : translate('account.errorUsername'),
  password: () => passwordMessage(newPassword.value, newName.value),
})

function suggestPassword() {
  newPassword.value = suggestTemporaryPassword()
  checks.edit('password')
}

function startAdding() {
  checks.reset()
  adding.value = true
  handOver.value = null
  newName.value = ''
  newPassword.value = suggestTemporaryPassword()
  newRole.value = 'user'
  newPermissions.value = { ...PRESETS.worker }
  ownGrove.value = false
}

async function add() {
  error.value = ''
  const username = newName.value.trim()
  const problem = checks.firstProblem()
  if (problem) {
    document
      .getElementById(problem === 'name' ? 'new-user-name' : 'new-user-password')
      ?.focus()

    return
  }

  try {
    const added = await addMember(farm.value.repo.farmId, {
      username,
      password: newPassword.value,
      role: newRole.value,
      permissions: newPermissions.value,
      ownGrove: ownGrove.value,
    })
    members.value = added.members
    handOver.value = added.existingAccount
      ? { username, password: '', ownGrove: false }
      : { username, password: newPassword.value, ownGrove: ownGrove.value }
    adding.value = false
  } catch (caught) {
    explain(caught)
  }
}

/* ---------- changing ---------- */
const editing = ref<string | null>(null)
const editRole = ref<Role>('user')
const editPermissions = ref<Permissions>({ ...PRESETS.worker })

function startEditing(member: Member) {
  editing.value = member.userId
  editRole.value = member.role
  editPermissions.value = { ...member.permissions }
  handOver.value = null
}

async function save(member: Member) {
  try {
    members.value = await updateMember(farm.value.repo.farmId, member.userId, {
      role: editRole.value,
      permissions: editPermissions.value,
    })
    editing.value = null
    if (member.userId === account.user?.id) {
      await syncNow() // their own access changed
    }
  } catch (caught) {
    explain(caught)
  }
}

async function newTemporaryPassword(member: Member) {
  const password = suggestTemporaryPassword()

  try {
    members.value = await resetMemberPassword(farm.value.repo.farmId, member.userId, password)
    handOver.value = { username: member.username, password, ownGrove: false }
    editing.value = null
  } catch (caught) {
    explain(caught)
  }
}

const removing = ref<Member | null>(null)
async function remove() {
  const member = removing.value
  removing.value = null
  if (!member) {
    return
  }

  try {
    members.value = await removeMember(farm.value.repo.farmId, member.userId)
    editing.value = null
  } catch (caught) {
    explain(caught)
  }
}
</script>

<template>
  <section class="card users-card">
    <h2>{{ $t('users.title') }}</h2>
    <p class="muted small">{{ $t('users.help') }}</p>

    <ul class="member-list">
      <li v-for="member in members" :key="member.userId">
        <div class="member-head">
          <span class="member-name">
            <strong>{{ member.username }}</strong>
            <small class="muted">{{ memberNotes(member) }}</small>
          </span>
          <button
            v-if="editing !== member.userId && !member.isOwner"
            type="button"
            class="btn ghost small"
            @click="startEditing(member)"
          >
            {{ $t('users.edit') }}
          </button>
        </div>

        <div v-if="editing === member.userId" class="member-edit">
          <div class="chips tight" role="radiogroup" :aria-label="$t('users.role')">
            <button
              v-for="role in ['user', 'admin'] as const"
              :key="role"
              type="button"
              role="radio"
              class="chip small"
              :class="{ selected: editRole === role }"
              :aria-checked="editRole === role"
              @click="editRole = role"
            >
              {{ $t(role === 'admin' ? 'users.admin' : 'users.user') }}
            </button>
          </div>
          <PermissionsEditor v-if="editRole === 'user'" v-model="editPermissions" />
          <p v-else class="hint">{{ $t('users.adminHelp') }}</p>
          <div class="actions wrap">
            <button type="button" class="btn primary small" @click="save(member)">
              {{ $t('common.save') }}
            </button>
            <button
              v-if="member.userId !== account.user?.id"
              type="button"
              class="btn ghost small"
              @click="newTemporaryPassword(member)"
            >
              {{ $t('users.newPassword') }}
            </button>
            <button
              v-if="member.userId !== account.user?.id"
              type="button"
              class="btn ghost small danger"
              @click="removing = member"
            >
              {{ $t('users.remove') }}
            </button>
            <button type="button" class="btn ghost small" @click="editing = null">
              {{ $t('common.cancel') }}
            </button>
          </div>
        </div>
      </li>
    </ul>

    <div v-if="handOver" class="hand-over" role="status">
      <template v-if="!handOver.password">
        <strong>{{ $t('users.existingTitle', { name: handOver.username }) }}</strong>
        <p class="small">{{ $t('users.existingHelp') }}</p>
      </template>
      <template v-else>
        <strong>{{ $t('users.handOverTitle', { name: handOver.username }) }}</strong>
        <p>
          {{ $t('users.handOverName') }} <code>{{ handOver.username }}</code><br />
          {{ $t('users.handOverPassword') }} <code>{{ handOver.password }}</code>
        </p>
        <p class="small">
          {{ $t(handOver.ownGrove ? 'users.handOverOwnGrove' : 'users.handOverHelp') }}
        </p>
      </template>
    </div>

    <p v-if="error" class="error" role="alert">{{ error }}</p>

    <form v-if="adding" class="member-add" novalidate @submit.prevent="add">
      <label class="label" for="new-user-name">{{ $t('account.username') }}</label>
      <input
        id="new-user-name"
        v-model="newName"
        :aria-invalid="!!checks.errors.name"
        :aria-describedby="checks.errors.name ? 'new-user-name-error' : undefined"
        class="input"
        autocomplete="off"
        autocapitalize="none"
        spellcheck="false"
        required
        @blur="checks.leave('name')"
        @input="checks.edit('name')"
      />
      <p v-if="checks.errors.name" id="new-user-name-error" class="field-error">
        {{ checks.errors.name }}
      </p>
      <label class="label" for="new-user-password">{{
        $t('account.temporaryPassword')
      }}</label>
      <div class="row-between gap">
        <input
          id="new-user-password"
          v-model="newPassword"
          :aria-invalid="!!checks.errors.password"
          :aria-describedby="checks.errors.password ? 'new-user-password-error' : undefined"
          class="input"
          autocomplete="off"
          autocapitalize="none"
          spellcheck="false"
          required
          @blur="checks.leave('password')"
          @input="checks.edit('password')"
        />
        <button type="button" class="btn ghost small" @click="suggestPassword">
          {{ $t('users.suggest') }}
        </button>
      </div>
      <p v-if="checks.errors.password" id="new-user-password-error" class="field-error">
        {{ checks.errors.password }}
      </p>
      <p class="hint">{{ $t('users.temporaryHelp') }}</p>

      <label v-if="account.user?.isOwner" class="check">
        <input v-model="ownGrove" type="checkbox" />
        {{ $t('users.ownGrove') }}
      </label>
      <template v-if="!ownGrove">
        <span class="label">{{ $t('users.role') }}</span>
        <div class="chips tight" role="radiogroup" :aria-label="$t('users.role')">
          <button
            v-for="role in ['user', 'admin'] as const"
            :key="role"
            type="button"
            role="radio"
            class="chip small"
            :class="{ selected: newRole === role }"
            :aria-checked="newRole === role"
            @click="newRole = role"
          >
            {{ $t(role === 'admin' ? 'users.admin' : 'users.user') }}
          </button>
        </div>
        <PermissionsEditor v-if="newRole === 'user'" v-model="newPermissions" />
        <p v-else class="hint">{{ $t('users.adminHelp') }}</p>
      </template>
      <p v-else class="hint">{{ $t('users.ownGroveHelp') }}</p>
      <div class="actions">
        <button type="submit" class="btn primary small">{{ $t('users.add') }}</button>
        <button type="button" class="btn ghost small" @click="adding = false">
          {{ $t('common.cancel') }}
        </button>
      </div>
    </form>
    <button v-else type="button" class="btn small" @click="startAdding">
      + {{ $t('users.addPerson') }}
    </button>

    <AppModal v-if="removing" :title="$t('users.remove')" @close="removing = null">
      <p>{{ $t('users.removeHelp', { name: removing.username }) }}</p>
      <div class="actions">
        <button type="button" class="btn ghost" @click="removing = null">
          {{ $t('common.cancel') }}
        </button>
        <button type="button" class="btn primary" @click="remove">
          {{ $t('users.remove') }}
        </button>
      </div>
    </AppModal>
  </section>
</template>
