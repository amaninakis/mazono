<script setup lang="ts">
import { useTranslation } from 'i18next-vue'
import { computed, ref } from 'vue'
import { isValidUsername, MIN_PASSWORD_LENGTH } from '../core/syncFormat'
import { chooseLanguage, LANGUAGES } from '../i18n'
import { account, createAdministrator, signIn } from '../sync/account'
import { ApiError } from '../sync/api'

/**
 * Sign in, or (on a new server) create the administrator account. Browsers and phones can
 * remember the password: the boxes are marked as a sign-in form for their password manager.
 */
const { t: translate, i18next } = useTranslation()
const creating = computed(() => account.needsSetup)
const username = ref('')
const password = ref('')
const repeat = ref('')
const showPassword = ref(false)
const busy = ref(false)
const error = ref('')

const ERRORS: Record<string, string> = {
  'wrong-credentials': 'account.errorWrong',
  'too-many-tries': 'account.errorTooMany',
  'password-short': 'account.errorShort',
  'username': 'account.errorUsername',
  'already-set-up': 'account.errorAlreadySetUp',
}

async function submit() {
  error.value = ''
  const name = username.value.trim()
  if (creating.value) {
    if (!isValidUsername(name)) {
      error.value = translate('account.errorUsername')
      return
    }
    if (password.value.length < MIN_PASSWORD_LENGTH) {
      error.value = translate('account.errorShort', { count: MIN_PASSWORD_LENGTH })
      return
    }
    if (password.value !== repeat.value) {
      error.value = translate('account.errorRepeat')
      return
    }
  }
  busy.value = true

  try {
    await (creating.value
      ? createAdministrator(name, password.value)
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

    <form class="card" @submit.prevent="submit">
      <label class="label" for="acc-username">{{ $t('account.username') }}</label>
      <input
        id="acc-username"
        v-model="username"
        class="input"
        name="username"
        autocomplete="username"
        autocapitalize="none"
        spellcheck="false"
        required
      />
      <p v-if="creating" class="hint">{{ $t('account.usernameHelp') }}</p>

      <label class="label" for="acc-password">{{ $t('account.password') }}</label>
      <input
        id="acc-password"
        v-model="password"
        class="input"
        name="password"
        :type="showPassword ? 'text' : 'password'"
        :autocomplete="creating ? 'new-password' : 'current-password'"
        required
      />
      <template v-if="creating">
        <label class="label" for="acc-repeat">{{ $t('account.repeat') }}</label>
        <input
          id="acc-repeat"
          v-model="repeat"
          class="input"
          name="password-repeat"
          :type="showPassword ? 'text' : 'password'"
          autocomplete="new-password"
          required
        />
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
