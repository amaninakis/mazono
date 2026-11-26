import { passwordProblem } from '../core/passwords'
import { MIN_PASSWORD_LENGTH } from '../core/syncFormat'
import i18next from '../i18n'

/**
 * What to tell someone choosing a new password, or '' when it is fine (the server checks the
 * same way, core/passwords.ts).
 */
export function passwordMessage(password: string, username = ''): string {
  const problem = passwordProblem(password, username)
  if (problem === 'password-short') {
    return i18next.t('account.errorShort', { count: MIN_PASSWORD_LENGTH })
  }

  return problem ? i18next.t('account.errorCommon') : ''
}
