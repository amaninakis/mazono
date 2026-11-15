import { liveQuery, type Subscription } from 'dexie'
import { onScopeDispose, shallowRef, type ShallowRef, watch, type WatchSource } from 'vue'

/**
 * Run a Dexie query and keep the result up to date whenever the data changes.
 * The value is `undefined` until the first result arrives. When `source` changes,
 * the query is restarted.
 */
export function useLiveQuery<T>(
  query: () => Promise<T>,
  source?: WatchSource,
): ShallowRef<T | undefined> {
  const value = shallowRef<T | undefined>()
  let sub: Subscription | undefined
  function start() {
    sub?.unsubscribe()
    sub = liveQuery(query).subscribe({
      next: (result) => (value.value = result),
      error: (error) => console.error(error),
    })
  }
  if (source) {
    watch(source, start, { immediate: true })
  } else {
    start()
  }
  onScopeDispose(() => sub?.unsubscribe())

  return value
}
