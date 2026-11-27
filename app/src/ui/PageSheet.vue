<script setup lang="ts">
import { computed, ref, useTemplateRef } from 'vue'
import { dragAxis } from '../core/swipe'

/**
 * A page that slides up over the others (the task form), with the page beneath dimmed above
 * it. Tapping the dimmed strip closes it, and so does dragging it down by its top (the handle
 * and the title row) with a finger past a third of its height or with a quick flick.
 */
const emit = defineEmits<{ close: [] }>()

const sheet = useTemplateRef<HTMLElement>('sheet')
const offsetY = ref(0)
const phase = ref<'drag' | 'idle' | 'settle'>('idle')
let start: { id: number; time: number; y: number; x: number } | undefined
let axis: 'x' | 'y' | undefined

const sheetStyle = computed(() =>
  phase.value === 'idle'
    ? undefined
    : {
        transform: `translateY(${offsetY.value}px)`,
        transition: phase.value === 'settle' ? 'transform 0.2s ease-out' : 'none',
      },
)

/** Only from the top of the sheet, and only while it is scrolled to the top. */
function onDown(event: PointerEvent) {
  const target = event.target as HTMLElement
  const fromTop = target.closest('.sheet-handle, .page > :first-child')
  const interactive = target.closest('a, button, input, select, textarea')
  if (
    event.pointerType === 'mouse' ||
    !fromTop ||
    interactive ||
    (sheet.value?.scrollTop ?? 0) > 0
  ) {
    return
  }
  start = { id: event.pointerId, time: event.timeStamp, x: event.clientX, y: event.clientY }
  axis = undefined
}

function onMove(event: PointerEvent) {
  if (!start || event.pointerId !== start.id) {
    return
  }
  const deltaY = event.clientY - start.y
  axis ??= dragAxis(event.clientX - start.x, deltaY)
  if (axis === 'x') {
    start = undefined
    return
  }
  if (axis !== 'y') {
    return
  }
  if (phase.value === 'idle' && deltaY < 0) {
    start = undefined // pulled up: nothing to do
    return
  }
  if (phase.value === 'idle') {
    phase.value = 'drag'
    sheet.value?.setPointerCapture(event.pointerId)
  }
  offsetY.value = Math.max(0, deltaY)
}

function onUp(event: PointerEvent) {
  if (!start || event.pointerId !== start.id) {
    return
  }
  const deltaY = event.clientY - start.y
  const speed = deltaY / Math.max(event.timeStamp - start.time, 1)
  start = undefined
  if (phase.value !== 'drag') {
    return
  }
  const height = sheet.value?.offsetHeight ?? 1
  phase.value = 'settle'
  if (deltaY > height / 3 || speed > 0.6) {
    offsetY.value = height
    setTimeout(emit, 200, 'close')
  } else {
    offsetY.value = 0
    setTimeout(() => {
      phase.value = 'idle'
    }, 200)
  }
}

function onCancel() {
  start = undefined
  if (phase.value === 'drag') {
    phase.value = 'settle'
    offsetY.value = 0
    setTimeout(() => {
      phase.value = 'idle'
    }, 200)
  }
}
</script>

<template>
  <div class="sheet-layer">
    <div class="sheet-scrim" aria-hidden="true" @click="emit('close')"></div>
    <div
      ref="sheet"
      class="sheet"
      role="dialog"
      aria-modal="true"
      :style="sheetStyle"
      @pointerdown="onDown"
      @pointermove="onMove"
      @pointerup="onUp"
      @pointercancel="onCancel"
    >
      <span class="sheet-handle" aria-hidden="true"></span>
      <slot />
    </div>
  </div>
</template>
