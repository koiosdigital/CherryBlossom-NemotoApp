<script setup lang="ts">
import { computed } from 'vue'
import { useFlaps } from '@/composables/useFlaps'
import SplitFlapCell from '@/components/SplitFlapCell.vue'

const props = withDefaults(
  defineProps<{
    flapIndex: number | null
    animate?: boolean
  }>(),
  { animate: false }
)

const flaps = useFlaps()

const entry = computed(() => {
  if (props.flapIndex == null || props.flapIndex < 0) return null
  return flaps.byId.value.get(props.flapIndex) ?? null
})

const isEmpty = computed(() => !entry.value)
const isColor = computed(() => entry.value?.type === 'color')
const glyph = computed(() => entry.value?.glyph ?? ' ')
</script>

<template>
  <!-- Empty cell: transparent spacer, same footprint -->
  <div v-if="isEmpty" class="flap-spacer" aria-hidden="true" />
  <!-- Animated: delegate to SplitFlapCell (handles text + color + flipping) -->
  <SplitFlapCell v-else-if="animate" :flap-index="flapIndex" />
  <!-- Static: render the face directly -->
  <div
    v-else
    class="flap"
    :class="isColor ? 'flap-color' : 'flap-text'"
    :style="isColor ? { '--flap-color': entry!.color ?? '#000' } : undefined"
  >
    <div class="flap-half flap-top">
      <span v-if="!isColor" class="flap-char">{{ glyph }}</span>
    </div>
    <div class="flap-half flap-bottom">
      <span v-if="!isColor" class="flap-char">{{ glyph }}</span>
    </div>
  </div>
</template>

<style scoped>
.flap-spacer {
  width: 44px;
  height: 64px;
  flex-shrink: 0;
}

/* Light mode defaults — dark chars on warm cream faces */
.flap {
  --flap-bg: #3a2e1a;
  --flap-char: #211609;
  --flap-char-shadow:
    0 1px 0 rgba(255, 255, 255, 0.25), 0 0 1px rgba(0, 0, 0, 0.35);
  --flap-top-grad: linear-gradient(180deg, #fbf2d6 0%, #e2d2a3 100%);
  --flap-bot-grad: linear-gradient(180deg, #cdbc87 0%, #a8976a 100%);
  --flap-top-shadow: inset 0 0 5px rgba(0, 0, 0, 0.12);
  --flap-bot-shadow: inset 0 0 7px rgba(0, 0, 0, 0.22);
  --flap-divider: 1px solid rgba(0, 0, 0, 0.45);

  position: relative;
  width: 44px;
  height: 64px;
  background: var(--flap-bg);
  color: var(--flap-char);
  border-radius: 4px;
  overflow: hidden;
  user-select: none;
  flex-shrink: 0;
  font-family: 'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, monospace;
  font-weight: 700;
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.08);
}

:global(.dark) .flap {
  box-shadow: none;
  --flap-bg: #050403;
  --flap-char: #f3e9c6;
  --flap-char-shadow:
    0 1px 0 rgba(0, 0, 0, 0.65), 0 0 12px rgba(243, 233, 198, 0.35);
  --flap-top-grad: linear-gradient(180deg, #2a241d 0%, #1a1511 100%);
  --flap-bot-grad: linear-gradient(180deg, #17120e 0%, #0b0806 100%);
  --flap-top-shadow: inset 0 0 8px rgba(0, 0, 0, 0.55);
  --flap-bot-shadow: inset 0 0 10px rgba(0, 0, 0, 0.7);
  --flap-divider: 1px solid #000;
}

.flap-half {
  position: absolute;
  left: 0;
  width: 100%;
  height: 50%;
  overflow: hidden;
}

.flap-top {
  top: 0;
  background: var(--flap-top-grad);
  border-bottom: var(--flap-divider);
  box-shadow: var(--flap-top-shadow);
}

.flap-bottom {
  bottom: 0;
  background: var(--flap-bot-grad);
  box-shadow: var(--flap-bot-shadow);
}

.flap-char {
  position: absolute;
  left: 0;
  width: 100%;
  height: 200%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 44px;
  line-height: 1;
  letter-spacing: -0.02em;
  text-shadow: var(--flap-char-shadow);
}

.flap-top .flap-char {
  top: 0;
}
.flap-bottom .flap-char {
  bottom: 0;
}

.flap-color .flap-top {
  background: linear-gradient(
    180deg,
    color-mix(in oklch, var(--flap-color) 95%, white 5%) 0%,
    color-mix(in oklch, var(--flap-color) 85%, black 15%) 100%
  );
  border-bottom-color: rgba(0, 0, 0, 0.55);
}
.flap-color .flap-bottom {
  background: linear-gradient(
    180deg,
    color-mix(in oklch, var(--flap-color) 80%, black 20%) 0%,
    color-mix(in oklch, var(--flap-color) 68%, black 32%) 100%
  );
}
</style>
