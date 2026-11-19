import { onBeforeUnmount, ref } from 'vue'

/**
 * Whether the phone shows the dark theme (the app follows the phone's setting). Some texts
 * describe colours, which are the other way round in the dark theme: there, stronger
 * shades are lighter.
 */
export function usePrefersDark() {
  const query =
    typeof window === 'undefined'
      ? undefined
      : window.matchMedia('(prefers-color-scheme: dark)')
  const dark = ref(query?.matches ?? false)
  function update(event: MediaQueryListEvent) {
    dark.value = event.matches
  }
  query?.addEventListener('change', update)
  onBeforeUnmount(() => query?.removeEventListener('change', update))

  return dark
}
