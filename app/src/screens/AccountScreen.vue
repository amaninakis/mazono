<script setup lang="ts">
import { useTranslation } from 'i18next-vue'
import { computed, ref } from 'vue'
import { isValidUsername, MIN_PASSWORD_LENGTH } from '../core/syncFormat'
import { chooseLanguage, LANGUAGES } from '../i18n'
import { account, createAdministrator, signIn } from '../sync/account'
import { ApiError } from '../sync/api'
import { useFieldChecks } from '../ui/fieldChecks'
import { passwordMessage } from '../ui/passwordMessage'

/**
 * Sign in, or (on a new server) create the administrator account. Browsers and phones can
 * remember the password: the boxes are marked as a sign-in form for their password manager.
 */
const { t: translate, i18next } = useTranslation()
const creating = computed(() => account.needsSetup)
const setupCode = ref('')
const username = ref('')
const password = ref('')
const repeat = ref('')
const showPassword = ref(false)
const busy = ref(false)
const error = ref('')

/** Only a new account has rules to check; signing in just tries the server. */
const checks = useFieldChecks({
  code: () =>
    creating.value && !setupCode.value.trim() ? translate('account.errorCodeMissing') : '',
  username: () =>
    creating.value && !isValidUsername(username.value.trim())
      ? translate('account.errorUsername')
      : '',
  password: () => (creating.value ? passwordMessage(password.value, username.value) : ''),
  repeat: () =>
    creating.value && repeat.value !== password.value ? translate('account.errorRepeat') : '',
})

const ERRORS: Record<string, string> = {
  'wrong-credentials': 'account.errorWrong',
  'too-many-tries': 'account.errorTooMany',
  'password-short': 'account.errorShort',
  'password-common': 'account.errorCommon',
  'setup-code': 'account.errorCode',
  'username': 'account.errorUsername',
  'already-set-up': 'account.errorAlreadySetUp',
}

async function submit() {
  error.value = ''
  const name = username.value.trim()
  const problem = checks.firstProblem()
  if (problem) {
    document.getElementById(`acc-${problem}`)?.focus()
    return
  }
  busy.value = true

  try {
    await (creating.value
      ? createAdministrator(name, password.value, setupCode.value)
      : signIn(name, password.value))
  } catch (caught) {
    if (caught instanceof ApiError) {
      error.value = translate(ERRORS[caught.code] ?? 'account.errorServer', {
        count: MIN_PASSWORD_LENGTH,
      })
      if (caught.code === 'already-set-up') {
        account.needsSetup = false
      }
    } else {
      error.value = translate('account.errorOffline')
    }
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <main class="setup account-screen">
    <div
      class="chips tight lang-chips"
      role="radiogroup"
      :aria-label="$t('settings.language')"
    >
      <button
        v-for="language in LANGUAGES"
        :key="language.code"
        type="button"
        role="radio"
        class="chip small"
        :class="{ selected: i18next.language === language.code }"
        :aria-checked="i18next.language === language.code"
        @click="chooseLanguage(language.code)"
      >
        {{ language.label }}
      </button>
    </div>
    <h1>{{ creating ? $t('account.createTitle') : $t('account.signInTitle') }}</h1>
    <p class="muted">{{ creating ? $t('account.createHelp') : $t('account.signInHelp') }}</p>

    <form class="card" novalidate @submit.prevent="submit">
      <template v-if="creating">
        <label class="label" for="acc-code">{{ $t('account.setupCode') }}</label>
        <input
          id="acc-code"
          v-model="setupCode"
          :aria-invalid="!!checks.errors.code"
          :aria-describedby="checks.errors.code ? 'acc-code-error' : 'acc-code-help'"
          class="input setup-code"
          autocomplete="one-time-code"
          autocapitalize="characters"
          spellcheck="false"
          placeholder="ABC-123-XYZ"
          required
          @blur="checks.leave('code')"
          @input="checks.edit('code')"
        />
        <p v-if="checks.errors.code" id="acc-code-error" class="field-error">
          {{ checks.errors.code }}
        </p>
        <p id="acc-code-help" class="hint">{{ $t('account.setupCodeHelp') }}</p>
      </template>
      <label class="label" for="acc-username">{{ $t('account.username') }}</label>
      <input
        id="acc-username"
        v-model="username"
        :aria-invalid="!!checks.errors.username"
        :aria-describedby="checks.errors.username ? 'acc-username-error' : undefined"
        class="input"
        name="username"
        autocomplete="username"
        autocapitalize="none"
        spellcheck="false"
        required
        @blur="checks.leave('username')"
        @input="checks.edit('username')"
      />
      <p v-if="checks.errors.username" id="acc-username-error" class="field-error">
        {{ checks.errors.username }}
      </p>
      <p v-if="creating" class="hint">{{ $t('account.usernameHelp') }}</p>

      <label class="label" for="acc-password">{{ $t('account.password') }}</label>
      <input
        id="acc-password"
        v-model="password"
        :aria-invalid="!!checks.errors.password"
        :aria-describedby="checks.errors.password ? 'acc-password-error' : undefined"
        class="input"
        name="password"
        :type="showPassword ? 'text' : 'password'"
        :autocomplete="creating ? 'new-password' : 'current-password'"
        required
        @blur="checks.leave('password')"
        @input="checks.edit('password')"
      />
      <p v-if="checks.errors.password" id="acc-password-error" class="field-error">
        {{ checks.errors.password }}
      </p>
      <template v-if="creating">
        <label class="label" for="acc-repeat">{{ $t('account.repeat') }}</label>
        <input
          id="acc-repeat"
          v-model="repeat"
          :aria-invalid="!!checks.errors.repeat"
          :aria-describedby="checks.errors.repeat ? 'acc-repeat-error' : undefined"
          class="input"
          name="password-repeat"
          :type="showPassword ? 'text' : 'password'"
          autocomplete="new-password"
          required
          @blur="checks.leave('repeat')"
          @input="checks.edit('repeat')"
        />
        <p v-if="checks.errors.repeat" id="acc-repeat-error" class="field-error">
          {{ checks.errors.repeat }}
        </p>
        <p class="hint">{{ $t('account.passwordHelp', { count: MIN_PASSWORD_LENGTH }) }}</p>
      </template>
      <label class="check">
        <input v-model="showPassword" type="checkbox" />
        {{ $t('account.showPassword') }}
      </label>

      <p v-if="error" class="error" role="alert">{{ error }}</p>
      <button type="submit" class="btn primary big block" :disabled="busy">
        {{
          busy ? $t('account.working') : creating ? $t('account.create') : $t('account.signIn')
        }}
      </button>
    </form>
  </main>
</template>
