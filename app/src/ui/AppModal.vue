<script setup lang="ts">
import { onBeforeUnmount, onMounted, useTemplateRef } from 'vue'

/**
 * A dialog sheet. Keyboard: focus moves into it (the first field or button, so Cancel in a
 * delete question), Tab stays inside, Escape closes it, and focus goes back to what opened it.
 */
defineProps<{ title: string }>()
const emit = defineEmits<{ close: [] }>()
const dialog = useTemplateRef<HTMLElement>('dialog')
const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]):not([type=hidden]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

function focusable(): HTMLElement[] {
  return [...(dialog.value?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])].filter(
    (element) => element.offsetParent !== null,
  )
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault()
    emit('close')

    return
  }
  if (event.key !== 'Tab') {
    return
  }
  const items = focusable()
  if (items.length === 0) {
    event.preventDefault()
    return
  }
  const first = items[0]
  const last = items.at(-1)!
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
}

onMounted(() => {
  const autofocus = dialog.value?.querySelector<HTMLElement>('[autofocus]')
  const target = autofocus ?? focusable()[0] ?? dialog.value
  target?.focus()
})

onBeforeUnmount(() => {
  if (opener?.isConnected) {
    opener.focus()
  }
})
</script>

<template>
  <div class="modal-backdrop" @click="emit('close')">
    <div
      ref="dialog"
      class="modal"
      role="dialog"
      aria-modal="true"
      :aria-label="title"
      tabindex="-1"
      @click.stop
      @keydown="onKeydown"
    >
      <h2>{{ title }}</h2>
      <slot />
    </div>
  </div>
</template>
