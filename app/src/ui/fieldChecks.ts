import { reactive } from 'vue'

/**
 * Field-by-field checks for forms with rules (usernames, passwords): a box is checked when
 * the person leaves it, never while they are still typing, and its message goes away as soon
 * as they start correcting it. Saving checks every box and moves to the first problem.
 *
 * Each rule returns the message to show, or '' when the value is fine.
 */
export function useFieldChecks<Name extends string>(rules: Record<Name, () => string>) {
  const names = Object.keys(rules) as Name[]
  const errors = reactive(Object.fromEntries(names.map((name) => [name, '']))) as Record<
    Name,
    string
  >

  /** On leaving a box. */
  function leave(name: Name) {
    errors[name] = rules[name]()
  }

  /** On typing in a box: the message goes as soon as they correct it. */
  function edit(name: Name) {
    errors[name] = ''
  }

  /** On saving: checks every box; returns the first one with a problem, if any. */
  function firstProblem(): Name | undefined {
    for (const name of names) {
      errors[name] = rules[name]()
    }

    return names.find((name) => errors[name] !== '')
  }

  /** Forget all messages (e.g. after saving, or when the form changes mode). */
  function reset() {
    for (const name of names) {
      errors[name] = ''
    }
  }

  return { errors, leave, edit, firstProblem, reset }
}
