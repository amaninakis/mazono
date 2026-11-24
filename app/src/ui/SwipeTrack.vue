<script setup lang="ts">
import { computed, onBeforeUnmount, ref, useTemplateRef } from 'vue'
import { dragAxis, dragOffset, dragResult } from '../core/swipe'
import { markDragged } from './slide'

/**
 * A value you can drag sideways with a finger (a date, a month, a year, a month of days). The
 * slot draws the value at `offset` 0; while dragging it also draws the previous (-1) and next
 * (+1) value beside it, and everything follows the finger. Let go past a third of the width,
 * or with a quick flick, and it moves on (left: the next value); otherwise it springs back.
 * Where `canGo` says there is nothing more, it only stretches a little. Up-and-down still
 * scrolls the page, and a mouse keeps selecting text and pressing buttons as usual.
 */
const props = withDefaults(defineProps<{ canGo?: (step: 1 | -1) => boolean }>(), {
  canGo: () => true,
})
const emit = defineEmits<{ step: [step: 1 | -1] }>()

const track = useTemplateRef<HTMLElement>('track')
const strip = useTemplateRef<HTMLElement>('strip')
/** idle: only the value; drag: following the finger; settle: gliding to where it lands. */
const phase = ref<'drag' | 'idle' | 'settle'>('idle')
const offsetX = ref(0)
/** The size it had before the drag, kept while the neighbours are beside it. */
const lockedSize = ref<{ height: number; width: number }>()

let start: { id: number; time: number; x: number; y: number } | undefined
let last = { time: 0, x: 0 }
let velocity = 0
let axis: 'x' | 'y' | undefined
let draggedAt = 0
let timer: ReturnType<typeof setTimeout> | undefined

const stripStyle = computed(() => {
  if (phase.value === 'idle') {
    return undefined
  }

  return {
    transform: `translateX(calc(-100% - var(--swipe-gap) + ${offsetX.value}px))`,
    transition: phase.value === 'settle' ? 'transform 0.22s ease-out' : 'none',
  }
})

function allowed(step: -1 | 1) {
  return props.canGo(step)
}

function reducedMotion() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
}

function onDown(event: PointerEvent) {
  if (event.pointerType === 'mouse' || !event.isPrimary || phase.value === 'settle') {
    return
  }
  start = { id: event.pointerId, time: event.timeStamp, x: event.clientX, y: event.clientY }
  last = { time: event.timeStamp, x: event.clientX }
  velocity = 0
  axis = undefined
}

function onMove(event: PointerEvent) {
  if (!start || event.pointerId !== start.id) {
    return
  }
  const deltaX = event.clientX - start.x
  axis ??= dragAxis(deltaX, event.clientY - start.y)
  if (axis === 'y') {
    start = undefined // the page is scrolling
    return
  }
  if (axis !== 'x') {
    return
  }
  if (phase.value === 'idle') {
    lockedSize.value = track.value
      ? { height: track.value.offsetHeight, width: track.value.offsetWidth }
      : undefined
    phase.value = 'drag'
    track.value?.setPointerCapture(event.pointerId)
  }
  const elapsed = event.timeStamp - last.time
  if (elapsed > 0) {
    velocity = (event.clientX - last.x) / elapsed
  }
  last = { time: event.timeStamp, x: event.clientX }
  offsetX.value = dragOffset(deltaX, allowed(deltaX < 0 ? 1 : -1))
}

/** The space between the value and its neighbours (--swipe-gap). */
function gap() {
  return strip.value ? Number.parseFloat(getComputedStyle(strip.value).columnGap) || 0 : 0
}

function settle(step: -1 | 0 | 1) {
  const width = (track.value?.offsetWidth ?? 0) + gap()
  phase.value = 'settle'
  offsetX.value = -step * width
  clearTimeout(timer)
  timer = setTimeout(
    () => {
      if (step !== 0) {
        markDragged()
        emit('step', step)
      }
      phase.value = 'idle'
      offsetX.value = 0
      lockedSize.value = undefined
    },
    reducedMotion() ? 0 : 230,
  )
}

function onUp(event: PointerEvent) {
  if (!start || event.pointerId !== start.id) {
    return
  }
  const deltaX = event.clientX - start.x
  start = undefined
  if (phase.value !== 'drag') {
    return
  }
  draggedAt = Date.now()
  const width = track.value?.offsetWidth ?? 1
  const step = dragResult(deltaX, width, velocity)
  settle(step !== 0 && allowed(step) ? step : 0)
}

function onCancel() {
  start = undefined
  if (phase.value === 'drag') {
    settle(0)
  }
}

/** A drag that ends on a button or a day must not press it too. */
function onClick(event: MouseEvent) {
  if (Date.now() - draggedAt < 400) {
    event.preventDefault()
    event.stopPropagation()
  }
}

onBeforeUnmount(() => clearTimeout(timer))
</script>

<template>
  <div
    ref="track"
    class="swipe-track"
    :class="{ moving: phase !== 'idle' }"
    :style="
      lockedSize
        ? { height: `${lockedSize.height}px`, width: `${lockedSize.width}px` }
        : undefined
    "
    @pointerdown="onDown"
    @pointermove="onMove"
    @pointerup="onUp"
    @pointercancel="onCancel"
    @click.capture="onClick"
  >
    <div ref="strip" class="swipe-strip" :style="stripStyle">
      <div v-if="phase !== 'idle'" class="swipe-panel" aria-hidden="true" inert>
        <slot v-if="allowed(-1)" :offset="-1" />
      </div>
      <div class="swipe-panel">
        <slot :offset="0" />
      </div>
      <div v-if="phase !== 'idle'" class="swipe-panel" aria-hidden="true" inert>
        <slot v-if="allowed(1)" :offset="1" />
      </div>
    </div>
  </div>
</template>
