<script setup lang="ts">
import type { FieldProgress } from '../core/progress'
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  useTemplateRef,
  watch,
} from 'vue'

/**
 * Field chooser. Up to four fields show as a plain 2-column grid. With more, the fields sit
 * in two rows that scroll sideways: the next column peeks in at the edge, with a fade and an
 * arrow button, so it is clear there are more. The chosen field stays in the middle.
 */
const props = defineProps<{ fields: FieldProgress[] }>()
const model = defineModel<string | undefined>({ required: true })

const scrolling = computed(() => props.fields.length > 4)
const strip = useTemplateRef<HTMLElement>('strip')
const atStart = ref(true)
const atEnd = ref(false)

function update() {
  const el = strip.value
  if (!el) {
    return
  }
  atStart.value = el.scrollLeft <= 2
  atEnd.value = el.scrollLeft + el.clientWidth >= el.scrollWidth - 2
}

function page(dir: 1 | -1) {
  const el = strip.value
  if (el) {
    el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: 'smooth' })
  }
}

/**
 * Put the chosen field's column in the middle, so it is never half under an arrow or the fade.
 * In the first or last column the strip simply stops at its edge, where there is no arrow.
 */
function showSelected(behavior: ScrollBehavior) {
  const element = strip.value
  const chip = element?.querySelector<HTMLElement>('.field-chip.selected')
  if (!element || !chip) {
    return
  }
  const middle = chip.offsetLeft - element.offsetLeft + chip.offsetWidth / 2
  const largest = element.scrollWidth - element.clientWidth
  const left = Math.min(Math.max(middle - element.clientWidth / 2, 0), largest)
  element.scrollTo({ left, behavior })
  update()
}

onMounted(() => {
  void nextTick(() => showSelected('auto'))
  window.addEventListener('resize', update)
})
onBeforeUnmount(() => window.removeEventListener('resize', update))
watch(model, () => void nextTick(() => showSelected('smooth')))
watch(
  () => props.fields.length,
  () => void nextTick(update),
)
</script>

<template>
  <div class="field-picker" :class="[{ scrolling }]">
    <div ref="strip" class="field-chips" @scroll.passive="update">
      <button
        v-for="p in fields"
        :key="p.field.id"
        type="button"
        class="field-chip"
        :class="[{ selected: p.field.id === model, done: p.finished }]"
        :aria-pressed="p.field.id === model"
        @click="model = p.field.id"
      >
        <span class="fc-name">{{ p.field.name }}</span>
        <span class="fc-meta">
          {{
            p.finished
              ? $t('today.finished')
              : p.remaining != null
                ? $t('today.treesLeft', { left: p.remaining, total: p.field.trees })
                : '\u00A0'
          }}
        </span>
      </button>
    </div>
    <template v-if="scrolling">
      <div v-if="!atStart" class="edge left" aria-hidden="true"></div>
      <div v-if="!atEnd" class="edge right" aria-hidden="true"></div>
      <button
        v-if="!atStart"
        type="button"
        class="edge-btn left"
        :aria-label="$t('today.prevFields')"
        @click="page(-1)"
      >
        ‹
      </button>
      <button
        v-if="!atEnd"
        type="button"
        class="edge-btn right"
        :aria-label="$t('today.moreFields')"
        @click="page(1)"
      >
        ›
      </button>
      <p class="hint more-hint">
        {{
          atEnd
            ? $t('today.allFieldsCount', { count: fields.length })
            : $t('today.swipeForMore', { count: fields.length })
        }}
      </p>
    </template>
  </div>
</template>
