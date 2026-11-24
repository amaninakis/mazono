<script setup lang="ts">
import type { RouteLocationNormalizedLoaded } from 'vue-router'
import { computed, onBeforeUnmount, ref, useTemplateRef } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { neighbourTab } from '../core/pages'
import { dragAxis, dragOffset, dragResult } from '../core/swipe'
import PagePreview from './PagePreview.vue'

/**
 * Swipe sideways on a page to go to the neighbouring tab of the bottom menu (left: the next
 * one). The page follows the finger and the neighbouring page, drawn live but only to look at,
 * comes in beside it; let go past a third of the width, or flick, and it opens. Past the first
 * and last tab the page only stretches a little. Anything on the page that moves sideways
 * itself (dates, months, years, rows and tables that scroll), text boxes and open dialogs keep
 * their own gestures; up-and-down scrolls as usual, and a mouse doesn't swipe.
 */
const props = defineProps<{ tabs: string[] }>()

const route = useRoute()
const router = useRouter()
const area = useTemplateRef<HTMLElement>('area')

const phase = ref<'drag' | 'idle' | 'settle'>('idle')
const offsetX = ref(0)
/** How far the page is scrolled down, so the neighbours show their top in view. */
const previewTop = ref(0)

const before = computed(() => neighbourTab(route.path, props.tabs, -1))
const after = computed(() => neighbourTab(route.path, props.tabs, 1))

/** A neighbouring page as the router would open it. */
function routeTo(path: string | undefined) {
  return path ? (router.resolve(path) as RouteLocationNormalizedLoaded) : undefined
}
const beforeRoute = computed(() => routeTo(before.value))
const afterRoute = computed(() => routeTo(after.value))

const PAGE_GAP = 24

const stripStyle = computed(() => {
  if (phase.value === 'idle') {
    return undefined
  }

  return {
    transform: `translateX(${offsetX.value}px)`,
    transition: phase.value === 'settle' ? 'transform 0.25s ease-out' : 'none',
  }
})

let start: { id: number; x: number; y: number } | undefined
let last = { time: 0, x: 0 }
let velocity = 0
let axis: 'x' | 'y' | undefined
let draggedAt = 0
let timer: ReturnType<typeof setTimeout> | undefined

/** Whether something under the finger moves sideways itself, or needs the finger. */
function keepsItsOwnGesture(target: EventTarget | null) {
  if (
    !(target instanceof Element) ||
    document.querySelector('.modal-backdrop, .calendar-pop')
  ) {
    return true
  }
  if (target.closest('.swipe-track, input, textarea, select, [data-no-page-swipe]')) {
    return true
  }

  for (
    let node: Element | null = target;
    node && node !== area.value;
    node = node.parentElement
  ) {
    const overflow = getComputedStyle(node).overflowX
    if (
      (overflow === 'auto' || overflow === 'scroll') &&
      node.scrollWidth > node.clientWidth + 1
    ) {
      return true
    }
  }

  return false
}

function onDown(event: PointerEvent) {
  if (
    event.pointerType === 'mouse' ||
    !event.isPrimary ||
    phase.value !== 'idle' ||
    keepsItsOwnGesture(event.target)
  ) {
    return
  }
  start = { id: event.pointerId, x: event.clientX, y: event.clientY }
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
    previewTop.value = Math.max(0, -(area.value?.getBoundingClientRect().top ?? 0))
    phase.value = 'drag'
    area.value?.setPointerCapture(event.pointerId)
  }
  const elapsed = event.timeStamp - last.time
  if (elapsed > 0) {
    velocity = (event.clientX - last.x) / elapsed
  }
  last = { time: event.timeStamp, x: event.clientX }
  offsetX.value = dragOffset(deltaX, !!(deltaX < 0 ? after.value : before.value))
}

function reducedMotion() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
}

function finish() {
  phase.value = 'idle'
  offsetX.value = 0
}

function settle(step: -1 | 0 | 1) {
  const target = { '-1': before.value, '0': undefined, '1': after.value }[step]
  const width = (area.value?.offsetWidth ?? 0) + PAGE_GAP
  phase.value = 'settle'
  offsetX.value = target ? -step * width : 0
  clearTimeout(timer)
  timer = setTimeout(
    () => {
      if (!target) {
        finish()
        return
      }
      // The new page takes the place of the one shown beside, in the same moment.
      void router.push(target).finally(finish)
    },
    reducedMotion() ? 0 : 260,
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
  settle(dragResult(deltaX, area.value?.offsetWidth ?? 1, velocity))
}

function onCancel() {
  start = undefined
  if (phase.value === 'drag') {
    settle(0)
  }
}

/** A swipe that ends on a button or a link must not press it too. */
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
    ref="area"
    class="page-swiper"
    @pointerdown="onDown"
    @pointermove="onMove"
    @pointerup="onUp"
    @pointercancel="onCancel"
    @click.capture="onClick"
  >
    <div class="page-strip" :style="stripStyle">
      <PagePreview
        v-if="phase !== 'idle' && beforeRoute"
        class="page-preview before"
        :route="beforeRoute"
        :style="{ top: `${previewTop}px`, right: `calc(100% + ${PAGE_GAP}px)` }"
      />
      <slot />
      <PagePreview
        v-if="phase !== 'idle' && afterRoute"
        class="page-preview after"
        :route="afterRoute"
        :style="{ top: `${previewTop}px`, left: `calc(100% + ${PAGE_GAP}px)` }"
      />
    </div>
  </div>
</template>
