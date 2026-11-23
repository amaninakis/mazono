const EFFECTS = ['slide-next', 'slide-prev', 'nudge-next', 'nudge-prev']

/** Start an effect again from the beginning, even if it is still playing. */
function restart(element: HTMLElement | null | undefined, effect: string) {
  if (!element) {
    return
  }
  element.classList.remove(...EFFECTS)
  // Reading the size makes the browser drop the old effect before the new one starts.
  element.getBoundingClientRect()
  element.classList.add(effect)
}

/**
 * Show that a value changed: the new value slides in from the right when it is later (step
 * > 0), from the left when it is earlier, the same way a swipe moves it.
 */
export function slideIn(element: HTMLElement | null | undefined, step: number) {
  restart(element, step > 0 ? 'slide-next' : 'slide-prev')
}

/** At the last value there is: a small push in the swipe's direction that springs back. */
export function nudge(element: HTMLElement | null | undefined, step: number) {
  restart(element, step > 0 ? 'nudge-next' : 'nudge-prev')
}
