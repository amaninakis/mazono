import { ref } from 'vue'

/**
 * Runs a save at most once at a time, so a double tap on Save (easy with tired hands) does
 * not store the same entry twice. Bind `saving` to the button's `disabled`.
 */
export function useSaving() {
  const saving = ref(false)

  async function once(task: () => Promise<void>) {
    if (saving.value) {
      return
    }
    saving.value = true

    try {
      await task()
    } finally {
      saving.value = false
    }
  }

  return { saving, once }
}
