<script setup lang="ts">
import { useTranslation } from 'i18next-vue'
import { ref } from 'vue'
import { MIN_PASSWORD_LENGTH } from '../core/syncFormat'
import { account, changePassword } from '../sync/account'
import { ApiError } from '../sync/api'
import { useFieldChecks } from '../ui/fieldChecks'

/** After signing in with a temporary password: choose your own before anything else. */
const { t: translate } = useTranslation()
/** Known when they just typed it to sign in; asked again otherwise (e.g. app reopened). */
const current = ref('')
const next = ref('')
const repeat = ref('')
const show = ref(false)
const busy = ref(false)
const error = ref('')

function temporaryPassword() {
  // Read when needed: the screen can open a moment before the sign-in stores it.
  return account.temporaryPassword || current.value
}

const checks = useFieldChecks({
  next: () => {
    if (next.value.length < MIN_PASSWORD_LENGTH) {
      return translate('account.errorShort', { count: MIN_PASSWORD_LENGTH })
    }

    return next.value === temporaryPassword() ? translate('account.errorSameAsTemporary') : ''
  },
  repeat: () => (repeat.value === next.value ? '' : translate('account.errorRepeat')),
})

async function save() {
  error.value = ''
  const temporary = temporaryPassword()
  const problem = checks.firstProblem()
  if (problem) {
    document.getElementById(`np-${problem}`)?.focus()
    return
  }
  busy.value = true

  try {
    await changePassword(temporary, next.value)
  } catch (caught) {
    error.value =
      caught instanceof ApiError && caught.code === 'wrong-password'
        ? translate('account.errorTemporary')
        : translate('account.errorOffline')
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <main class="setup account-screen">
    <h1>{{ $t('account.newPasswordTitle') }}</h1>
    <p class="muted">{{ $t('account.newPasswordHelp') }}</p>
    <form class="card" novalidate @submit.prevent="save">
      <input name="username" autocomplete="username" :value="account.user?.username" hidden />
      <template v-if="!account.temporaryPassword">
        <label class="label" for="np-current">{{ $t('account.temporaryPassword') }}</label>
        <input
          id="np-current"
          v-model="current"
          class="input"
          type="password"
          autocomplete="current-password"
          required
        />
      </template>
      <label class="label" for="np-next">{{ $t('account.newPassword') }}</label>
      <input
        id="np-next"
        v-model="next"
        :aria-invalid="!!checks.errors.next"
        :aria-describedby="checks.errors.next ? 'np-next-error' : undefined"
        class="input"
        :type="show ? 'text' : 'password'"
        autocomplete="new-password"
        required
        @blur="checks.leave('next')"
        @input="checks.edit('next')"
      />
      <p v-if="checks.errors.next" id="np-next-error" class="field-error">
        {{ checks.errors.next }}
      </p>
      <label class="label" for="np-repeat">{{ $t('account.repeat') }}</label>
      <input
        id="np-repeat"
        v-model="repeat"
        :aria-invalid="!!checks.errors.repeat"
        :aria-describedby="checks.errors.repeat ? 'np-repeat-error' : undefined"
        class="input"
        :type="show ? 'text' : 'password'"
        autocomplete="new-password"
        required
        @blur="checks.leave('repeat')"
        @input="checks.edit('repeat')"
      />
      <p v-if="checks.errors.repeat" id="np-repeat-error" class="field-error">
        {{ checks.errors.repeat }}
      </p>
      <p class="hint">{{ $t('account.passwordHelp', { count: MIN_PASSWORD_LENGTH }) }}</p>
      <label class="check">
        <input v-model="show" type="checkbox" />
        {{ $t('account.showPassword') }}
      </label>
      <p v-if="error" class="error" role="alert">{{ error }}</p>
      <button type="submit" class="btn primary big block" :disabled="busy">
        {{ busy ? $t('account.working') : $t('account.savePassword') }}
      </button>
    </form>
  </main>
</template>
