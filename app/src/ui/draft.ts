import type { FormValues } from '../core/drafts'
import { useTranslation } from 'i18next-vue'
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import { changedValues, draftKey, readDraft } from '../core/drafts'
import { useFarm } from './farm'
import { showToast } from './toast'

interface DraftOptions {
  /** Which form: "today", "extraction", "sale"… */
  form: string
  /** The record being edited, if any. */
  recordId?: string
  /**
   * The form's values now. Leave out values the app fills in by itself (return null instead).
   */
  values: () => FormValues
  /** Put values back into the form (a draft's changes, or the start values on discard). */
  restore: (values: FormValues) => void | Promise<void>
}

function storage() {
  try {
    return window.localStorage
  } catch {
    return undefined // blocked, e.g. some private modes: forms still work, without drafts
  }
}

/** Whether a form has an unsaved draft on this device (a new record unless `recordId`). */
export function hasDraft(farmId: string, form: string, recordId?: string) {
  return (
    readDraft(storage()?.getItem(draftKey(farmId, form, recordId)) ?? null, Date.now()) != null
  )
}

/**
 * Keeps a form's unsaved changes on this device and brings them back next time the form
 * opens. Call `clear()` after saving.
 */
export function useDraft(options: DraftOptions) {
  const { t: translate } = useTranslation()
  const farm = useFarm()
  const key = draftKey(farm.value.repo.farmId, options.form, options.recordId)
  /**
   * When the draft that was brought back had been written; null when the form started fresh.
   */
  const restoredAt = ref<number | null>(null)
  let start: FormValues = {}
  let ready = false
  let timer: ReturnType<typeof setTimeout> | undefined

  function snapshot(): FormValues {
    return JSON.parse(JSON.stringify(options.values())) as FormValues
  }

  /** Writes the draft now; returns whether there is anything unsaved. */
  function write(): boolean {
    clearTimeout(timer)
    if (!ready) {
      return false
    }
    const changes = changedValues(start, snapshot())
    const store = storage()

    try {
      if (Object.keys(changes).length === 0) {
        store?.removeItem(key)
        return false
      }
      store?.setItem(key, JSON.stringify({ savedAt: Date.now(), changes }))
    } catch {
      // Storage full or blocked: nothing more to do.
    }

    return true
  }

  function onPageHide() {
    write()
  }

  onMounted(async () => {
    await nextTick() // let the form fill in its defaults first
    start = snapshot()
    const draft = readDraft(storage()?.getItem(key) ?? null, Date.now())
    if (draft) {
      await options.restore(draft.changes)
      restoredAt.value = draft.savedAt
    } else {
      storage()?.removeItem(key)
    }
    ready = true
    window.addEventListener('pagehide', onPageHide)
  })

  onBeforeUnmount(() => {
    window.removeEventListener('pagehide', onPageHide)
  })

  watch(
    options.values,
    () => {
      clearTimeout(timer)
      timer = setTimeout(write, 300)
    },
    { deep: true },
  )

  onBeforeRouteLeave(() => {
    if (write()) {
      showToast({ title: translate('draft.kept') })
    }
  })

  /** After saving: forget the draft; the form as it is now becomes the new start. */
  function clear() {
    clearTimeout(timer)
    storage()?.removeItem(key)
    start = snapshot()
    restoredAt.value = null
  }

  /** Throw the draft away and put the form back as it started. */
  async function discard() {
    clearTimeout(timer)
    storage()?.removeItem(key)
    await options.restore(start)
    restoredAt.value = null
    await nextTick()
    start = snapshot()
  }

  return { restoredAt, clear, discard }
}
