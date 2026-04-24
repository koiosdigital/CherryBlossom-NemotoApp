<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useFlaps } from '@/composables/useFlaps'

const props = withDefaults(
  defineProps<{
    flapIndex: number | null
    duration?: number
  }>(),
  { duration: 90 }
)

const flaps = useFlaps()

const displayedIdx = ref<number | null>(null)
const incomingIdx = ref<number | null>(null)
const phase = ref<'idle' | 'top' | 'bottom'>('idle')

const topIdx = computed(() =>
  phase.value === 'idle' ? displayedIdx.value : incomingIdx.value
)
const bottomIdx = computed(() => displayedIdx.value)

const halfDur = computed(() => `${props.duration / 2}ms`)

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

let running = false
let pending: number | null = null

async function flipOnce(next: number) {
  incomingIdx.value = next
  phase.value = 'top'
  await wait(props.duration / 2)
  displayedIdx.value = next
  phase.value = 'bottom'
  await wait(props.duration / 2)
  phase.value = 'idle'
}

async function flipTo(target: number) {
  pending = target
  if (running) return
  running = true
  try {
    while (pending !== null && displayedIdx.value !== pending) {
      const catalog = flaps.flaps.value
      if (!catalog.length) break
      const ids = catalog.map((f) => f.id).sort((a, b) => a - b)
      const cur = displayedIdx.value
      const pos = cur == null ? -1 : ids.indexOf(cur)
      const nextPos = (pos + 1 + ids.length) % ids.length
      await flipOnce(ids[nextPos])
    }
  } finally {
    pending = null
    running = false
  }
}

watch(
  () => props.flapIndex,
  (newIdx) => {
    if (newIdx == null) {
      displayedIdx.value = null
      phase.value = 'idle'
      return
    }
    if (displayedIdx.value == null) {
      // First value — seed without animation.
      displayedIdx.value = newIdx
      return
    }
    flipTo(newIdx)
  },
  { immediate: true }
)

function entry(idx: number | null) {
  if (idx == null) return null
  return flaps.byId.value.get(idx) ?? null
}
function isColor(idx: number | null) {
  return entry(idx)?.type === 'color'
}
function glyph(idx: number | null) {
  const e = entry(idx)
  return e?.type === 'color' ? '' : e?.glyph ?? ' '
}
function colorOf(idx: number | null) {
  return entry(idx)?.color ?? '#000'
}
</script>

<template>
  <div class="flap" :style="{ '--flap-half-dur': halfDur }">
    <div
      class="flap-half flap-top"
      :class="isColor(topIdx) ? 'is-color' : ''"
      :style="isColor(topIdx) ? { '--flap-color': colorOf(topIdx) } : undefined"
    >
      <span v-if="!isColor(topIdx)" class="flap-char">{{ glyph(topIdx) }}</span>
    </div>
    <div
      class="flap-half flap-bottom"
      :class="isColor(bottomIdx) ? 'is-color' : ''"
      :style="
        isColor(bottomIdx) ? { '--flap-color': colorOf(bottomIdx) } : undefined
      "
    >
      <span v-if="!isColor(bottomIdx)" class="flap-char">
        {{ glyph(bottomIdx) }}
      </span>
    </div>
    <div
      v-if="phase === 'top'"
      :key="'top-' + displayedIdx + '-' + incomingIdx"
      class="flap-half flap-top flap-leaf flap-leaf-top"
      :class="isColor(displayedIdx) ? 'is-color' : ''"
      :style="
        isColor(displayedIdx)
          ? { '--flap-color': colorOf(displayedIdx) }
          : undefined
      "
    >
      <span v-if="!isColor(displayedIdx)" class="flap-char">
        {{ glyph(displayedIdx) }}
      </span>
    </div>
    <div
      v-if="phase === 'bottom'"
      :key="'bot-' + displayedIdx + '-' + incomingIdx"
      class="flap-half flap-bottom flap-leaf flap-leaf-bottom"
      :class="isColor(incomingIdx) ? 'is-color' : ''"
      :style="
        isColor(incomingIdx)
          ? { '--flap-color': colorOf(incomingIdx) }
          : undefined
      "
    >
      <span v-if="!isColor(incomingIdx)" class="flap-char">
        {{ glyph(incomingIdx) }}
      </span>
    </div>
  </div>
</template>

<style scoped>
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
  flex-shrink: 0;
  perspective: 260px;
  font-family: 'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, monospace;
  font-weight: 700;
  user-select: none;
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
  backface-visibility: hidden;
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

.flap-top.is-color {
  background: linear-gradient(
    180deg,
    color-mix(in oklch, var(--flap-color) 95%, white 5%) 0%,
    color-mix(in oklch, var(--flap-color) 85%, black 15%) 100%
  );
  border-bottom-color: rgba(0, 0, 0, 0.55);
}
.flap-bottom.is-color {
  background: linear-gradient(
    180deg,
    color-mix(in oklch, var(--flap-color) 80%, black 20%) 0%,
    color-mix(in oklch, var(--flap-color) 68%, black 32%) 100%
  );
}

.flap-leaf {
  z-index: 2;
  will-change: transform;
}
.flap-leaf-top {
  transform-origin: bottom center;
  animation: flap-fall var(--flap-half-dur)
    cubic-bezier(0.55, 0.05, 0.9, 0.5) forwards;
}
.flap-leaf-bottom {
  transform-origin: top center;
  animation: flap-rise var(--flap-half-dur)
    cubic-bezier(0.15, 0.5, 0.4, 1) forwards;
}

@keyframes flap-fall {
  from {
    transform: rotateX(0deg);
  }
  to {
    transform: rotateX(-90deg);
  }
}
@keyframes flap-rise {
  from {
    transform: rotateX(90deg);
  }
  to {
    transform: rotateX(0deg);
  }
}
</style>
