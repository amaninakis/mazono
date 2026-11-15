<script setup lang="ts">
import { useTranslation } from 'i18next-vue';
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { FieldProgress } from '../core/progress';

/**
 * Field chooser. Up to four fields show as a plain 2-column grid. With more, the fields sit
 * in two rows that scroll sideways: the next column peeks in at the edge, with a fade and an
 * arrow button, so it is clear there are more.
 */
const props = defineProps<{ fields: FieldProgress[] }>();
const model = defineModel<string | undefined>({ required: true });
const { t } = useTranslation();

const scrolling = computed(() => props.fields.length > 4);
const strip = ref<HTMLElement>();
const atStart = ref(true);
const atEnd = ref(false);

function update() {
  const el = strip.value;
  if (!el) return;
  atStart.value = el.scrollLeft <= 2;
  atEnd.value = el.scrollLeft + el.clientWidth >= el.scrollWidth - 2;
}

function page(dir: 1 | -1) {
  const el = strip.value;
  if (el) el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: 'smooth' });
}

/** Keep the chosen field in view (e.g. the default field may be in a later column). */
function showSelected() {
  const el = strip.value?.querySelector<HTMLElement>('.field-chip.selected');
  if (!el || !strip.value) return;
  const s = strip.value;
  const left = el.offsetLeft - s.offsetLeft;
  if (left < s.scrollLeft || left + el.offsetWidth > s.scrollLeft + s.clientWidth) {
    s.scrollTo({ left: Math.max(left - 8, 0) });
  }
  update();
}

onMounted(() => {
  void nextTick(showSelected);
  window.addEventListener('resize', update);
});
onBeforeUnmount(() => window.removeEventListener('resize', update));
watch(model, () => void nextTick(showSelected));
watch(() => props.fields.length, () => void nextTick(update));
</script>

<template>
  <div :class="['field-picker', { scrolling }]">
    <div ref="strip" class="field-chips" @scroll.passive="update">
      <button
        v-for="p in fields"
        :key="p.field.id"
        type="button"
        :class="['field-chip', { selected: p.field.id === model, done: p.finished }]"
        :aria-pressed="p.field.id === model"
        @click="model = p.field.id"
      >
        <span class="fc-name">{{ p.field.name }}</span>
        <span class="fc-meta">
          {{
            p.finished
              ? t('today.finished')
              : p.remaining != null
                ? t('today.treesLeft', { left: p.remaining, total: p.field.trees })
                : ' '
          }}
        </span>
      </button>
    </div>
    <template v-if="scrolling">
      <div v-if="!atStart" class="edge left" aria-hidden="true" />
      <div v-if="!atEnd" class="edge right" aria-hidden="true" />
      <button v-if="!atStart" type="button" class="edge-btn left" :aria-label="t('today.prevFields')" @click="page(-1)">‹</button>
      <button v-if="!atEnd" type="button" class="edge-btn right" :aria-label="t('today.moreFields')" @click="page(1)">›</button>
      <p class="hint more-hint">
        {{ atEnd ? t('today.allFieldsCount', { count: fields.length }) : t('today.swipeForMore', { count: fields.length }) }}
      </p>
    </template>
  </div>
</template>
