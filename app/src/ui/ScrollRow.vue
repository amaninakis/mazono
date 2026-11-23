<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, useTemplateRef, watch } from 'vue'

const props = defineProps<{ selectedKey?: string | number }>()
/**
 * A row of buttons that scrolls sideways when it does not fit, the same way as the field
 * chooser: the side with more to see fades out and has an arrow button, and no scroll bar
 * shows. The chosen button (`aria-selected` or `.selected`) is brought into view.
 * Attributes (class, role, aria-*) go on the row itself, so a `role="tablist"` stays the
 * direct parent of its tabs.
 */
defineOptions({ inheritAttrs: false })
const strip = useTemplateRef<HTMLElement>('strip')
const atStart = ref(true)
const atEnd = ref(true)

function update() {
  const element = strip.value
  if (!element) {
    return
  }
  atStart.value = element.scrollLeft <= 2
  atEnd.value = element.scrollLeft + element.clientWidth >= element.scrollWidth - 2
}

function page(direction: 1 | -1) {
  strip.value?.scrollBy({
    left: direction * strip.value.clientWidth * 0.7,
    behavior: 'smooth',
  })
}

/** Scroll just enough that the chosen button is clear of the fades and arrows. */
function showSelected(behavior: ScrollBehavior) {
  const element = strip.value
  const chosen = element?.querySelector<HTMLElement>('[aria-selected="true"], .selected')
  if (!element || !chosen) {
    update()
    return
  }
  const margin = 56
  const left = chosen.offsetLeft - element.offsetLeft
  const right = left + chosen.offsetWidth
  if (left - margin < element.scrollLeft) {
    element.scrollTo({ left: Math.max(left - margin, 0), behavior })
  } else if (right + margin > element.scrollLeft + element.clientWidth) {
    element.scrollTo({ left: right + margin - element.clientWidth, behavior })
  }
  update()
}

let observer: ResizeObserver | undefined

onMounted(() => {
  void nextTick(() => showSelected('auto'))
  if (typeof ResizeObserver !== 'undefined' && strip.value) {
    observer = new ResizeObserver(() => update())
    observer.observe(strip.value)
  }
})
onBeforeUnmount(() => observer?.disconnect())
watch(
  () => props.selectedKey,
  () => void nextTick(() => showSelected('smooth')),
)
</script>

<template>
  <div class="scroll-row" :class="{ 'more-left': !atStart, 'more-right': !atEnd }">
    <div ref="strip" class="scroll-row-strip" v-bind="$attrs" @scroll.passive="update">
      <slot />
    </div>
    <button
      v-if="!atStart"
      type="button"
      class="edge-btn left"
      tabindex="-1"
      :aria-label="$t('common.scrollBack')"
      @click="page(-1)"
    >
      ‹
    </button>
    <button
      v-if="!atEnd"
      type="button"
      class="edge-btn right"
      tabindex="-1"
      :aria-label="$t('common.scrollMore')"
      @click="page(1)"
    >
      ›
    </button>
  </div>
</template>
