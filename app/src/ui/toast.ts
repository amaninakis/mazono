import { shallowRef } from 'vue'

export interface ToastMsg {
  id: number
  title: string
  lines?: string[]
  action?: { label: string; run: () => void }
}

export const currentToast = shallowRef<ToastMsg | null>(null)
let timer: number | undefined

export function showToast(message: Omit<ToastMsg, 'id'>) {
  window.clearTimeout(timer)
  currentToast.value = { ...message, id: Date.now() }
  timer = window.setTimeout(() => (currentToast.value = null), 4500)
}

export function closeToast() {
  window.clearTimeout(timer)
  currentToast.value = null
}
