<script setup lang="ts">
import type { Area, Level, Permissions, PresetName } from '../core/access'
import { computed } from 'vue'
import { AREAS, presetOf, PRESETS } from '../core/access'

/** Choose what someone may see and change: a ready-made set, or area by area. */
const model = defineModel<Permissions>({ required: true })
const preset = computed(() => presetOf(model.value))
const PRESET_NAMES = Object.keys(PRESETS) as PresetName[]

function levelsFor(area: Area): Level[] {
  return area === 'reports' ? ['none', 'see'] : ['none', 'see', 'change']
}

function setLevel(area: Area, level: Level) {
  model.value = { ...model.value, [area]: level }
}
</script>

<template>
  <div class="permissions">
    <div class="chips tight" role="radiogroup" :aria-label="$t('users.preset')">
      <button
        v-for="name in PRESET_NAMES"
        :key="name"
        type="button"
        role="radio"
        class="chip small"
        :class="{ selected: preset === name }"
        :aria-checked="preset === name"
        @click="model = { ...PRESETS[name] }"
      >
        {{ $t(`users.presets.${name}`) }}
      </button>
      <span v-if="!preset" class="chip small selected static">{{
        $t('users.presets.custom')
      }}</span>
    </div>
    <p v-if="preset" class="hint">{{ $t(`users.presetHelp.${preset}`) }}</p>
    <table class="permission-grid">
      <tbody>
        <tr v-for="area in AREAS" :key="area">
          <th scope="row">{{ $t(`users.areas.${area}`) }}</th>
          <td>
            <div class="segmented" role="radiogroup" :aria-label="$t(`users.areas.${area}`)">
              <button
                v-for="level in levelsFor(area)"
                :key="level"
                type="button"
                role="radio"
                :class="{ selected: model[area] === level }"
                :aria-checked="model[area] === level"
                @click="setLevel(area, level)"
              >
                {{ $t(`users.levels.${level}`) }}
              </button>
            </div>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
