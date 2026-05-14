<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Button,
  Badge,
  Label,
  Slider,
  Switch,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui'
import {
  Eraser,
  Loader2,
  Pencil,
  Play,
  Sparkles,
} from 'lucide-vue-next'
import DisplayCell from '@/components/DisplayCell.vue'
import { apiClient } from '@/api'
import type { components } from '@/api.d'
import { useDisplay } from '@/composables/useDisplay'
import { useDisplaySettings } from '@/composables/useDisplaySettings'
import { useGrid } from '@/composables/useGrid'
import { useFlaps } from '@/composables/useFlaps'
import { useToast } from '@/composables/useToast'
import { friendlyError } from '@/lib/errors'

type PresetMeta = components['schemas']['PresetMeta']

const display = useDisplay()
const displaySettings = useDisplaySettings()
const gridState = useGrid()
const flaps = useFlaps()
const { toast } = useToast()

// ---------- display settings (effect, delay, cycle_type) ----------
const effectId = computed({
  get: () => displaySettings.settings.value?.effect ?? '',
  set: (v: string) => {
    displaySettings.update({ effect: v }).catch((e) =>
      toast({ title: "Couldn't change effect", description: friendlyError(e), variant: 'destructive' })
    )
  },
})
// Local-then-debounced commit for delay so dragging the slider doesn't fire
// dozens of POSTs in a second.
const delayLocal = ref<number>(displaySettings.settings.value?.delay ?? 0)
let delayCommitTimer: ReturnType<typeof setTimeout> | null = null
let lastDelayUserAt = 0
watch(
  () => displaySettings.settings.value?.delay,
  (v) => {
    // Don't fight the user mid-drag: ignore server echoes within 500ms of
    // the last local change.
    if (v != null && Date.now() - lastDelayUserAt > 500) delayLocal.value = v
  }
)
function setDelay(arr: number[]) {
  const v = arr[0] ?? 0
  delayLocal.value = v
  lastDelayUserAt = Date.now()
  if (delayCommitTimer) clearTimeout(delayCommitTimer)
  delayCommitTimer = setTimeout(() => {
    displaySettings.update({ delay: v }).catch((e) =>
      toast({ title: "Couldn't change delay", description: friendlyError(e), variant: 'destructive' })
    )
  }, 250)
}
const fullCycle = computed({
  get: () => displaySettings.settings.value?.cycle_type === 'full',
  set: (v: boolean) => {
    displaySettings.update({ cycle_type: v ? 'full' : 'partial' }).catch((e) =>
      toast({ title: "Couldn't change cycle", description: friendlyError(e), variant: 'destructive' })
    )
  },
})

// ---------- clear display ----------
const clearing = ref(false)
async function clearDisplay() {
  clearing.value = true
  try {
    await apiClient.POST('/api/display/clear', {})
  } catch (e) {
    toast({
      title: "Couldn't clear",
      description: friendlyError(e),
      variant: 'destructive',
    })
  } finally {
    clearing.value = false
  }
}

// ---------- live preview ----------
const gridSize = computed(
  () => gridState.grid.value?.grid ?? { width: 0, height: 0 }
)

const mappedKeys = computed(() => {
  const s = new Set<string>()
  for (const m of gridState.grid.value?.mapping ?? []) s.add(`${m.x},${m.y}`)
  return s
})

const blankFlapId = computed(
  () => flaps.flaps.value.find((f) => f.type === 'blank')?.id ?? null
)

function flapAt(x: number, y: number): number | null {
  const frame = display.lastFrame.value
  if (frame?.valid && frame.flaps) {
    const row = frame.flaps[y]
    if (!row) return null
    const v = row[x]
    return v == null ? null : v
  }
  // Pre-frame state: show a blank flap at every mapped cell, spacers elsewhere.
  return mappedKeys.value.has(`${x},${y}`) ? blankFlapId.value : null
}

// ---------- preset picker ----------
const pickerOpen = ref(false)
const presets = ref<PresetMeta[]>([])
const presetsLoading = ref(false)
const runningPresetId = ref<number | null>(null)

async function openPicker() {
  pickerOpen.value = true
  if (presets.value.length) return
  presetsLoading.value = true
  try {
    const { data } = await apiClient.GET('/api/presets')
    if (data) presets.value = data.presets
  } finally {
    presetsLoading.value = false
  }
}

async function runPreset(p: PresetMeta) {
  runningPresetId.value = p.id
  try {
    await display.showPreset(p.id, p.name)
    pickerOpen.value = false
  } catch (e) {
    toast({
      title: "Couldn't run preset",
      description: friendlyError(e),
      variant: 'destructive',
    })
  } finally {
    runningPresetId.value = null
  }
}

</script>

<template>
  <div class="flex flex-col gap-8">
    <section class="flex flex-col gap-2">
      <h1 class="display-face text-3xl font-semibold tracking-tight">
        Display overview
      </h1>
    </section>

    <!-- HERO: full-width live display preview -->
    <section class="flex flex-col gap-3">
      <div
        v-if="display.currentPresetName.value"
        class="flex items-baseline gap-2"
      >
        <span class="text-sm text-muted-foreground">Showing</span>
        <span class="display-face text-lg font-medium">
          {{ display.currentPresetName.value }}
        </span>
      </div>

      <div
        class="relative -mx-6 overflow-x-auto rounded-none bg-muted p-4 shadow-[inset_0_2px_14px_rgba(0,0,0,0.08)] sm:mx-0 sm:rounded-lg sm:p-6 sm:ring-1 sm:ring-border dark:bg-[#0a0807] dark:shadow-[inset_0_2px_14px_rgba(0,0,0,0.9)] sm:dark:ring-white/5"
      >
        <RouterLink
          to="/editor?context=display"
          class="absolute right-3 top-3 z-10 inline-flex size-8 items-center justify-center rounded-md border border-white/10 bg-black/30 text-white/60 backdrop-blur transition-colors hover:border-white/30 hover:bg-black/50 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          aria-label="Edit display"
          title="Edit display"
        >
          <Pencil class="size-4" />
        </RouterLink>
        <div
          v-if="gridSize.width && gridSize.height"
          class="mx-auto grid w-max gap-1"
          :style="{
            gridTemplateColumns: `repeat(${gridSize.width}, 44px)`,
            gridTemplateRows: `repeat(${gridSize.height}, 64px)`,
          }"
        >
          <template v-for="y in gridSize.height" :key="y">
            <DisplayCell
              v-for="x in gridSize.width"
              :key="`${x}-${y}`"
              :flap-index="flapAt(x - 1, y - 1)"
              animate
            />
          </template>
        </div>
        <p
          v-else
          class="py-10 text-center text-sm text-muted-foreground dark:text-white/50"
        >
          Set up the grid in Settings to see the live display.
        </p>
      </div>

      <div class="flex flex-wrap items-center justify-center gap-2">
        <Button variant="ghost" size="sm" @click="openPicker">
          <Play />
          Run preset
        </Button>
        <Button
          variant="ghost"
          size="sm"
          :disabled="clearing"
          @click="clearDisplay"
        >
          <Loader2 v-if="clearing" class="animate-spin" />
          <Eraser v-else />
          Clear
        </Button>
      </div>
    </section>

    <!-- Display effect controls -->
    <Card v-if="displaySettings.settings.value">
      <CardHeader>
        <CardTitle class="flex items-center gap-2 text-base">
          <Sparkles class="size-4 text-primary" />
          Display effect
        </CardTitle>
      </CardHeader>
      <CardContent class="flex flex-col gap-4 sm:flex-row sm:items-end">
        <div class="flex flex-1 flex-col gap-1.5">
          <Label for="effect">Stagger</Label>
          <select
            id="effect"
            v-model="effectId"
            class="h-9 w-full rounded-md border border-border bg-card px-3 text-sm"
          >
            <option
              v-for="ef in displaySettings.effects.value"
              :key="ef.id"
              :value="ef.id"
            >
              {{ ef.name }}
            </option>
          </select>
        </div>
        <div class="flex flex-1 flex-col gap-1.5">
          <div class="flex items-baseline justify-between">
            <Label for="delay">Step delay</Label>
            <span class="num text-xs text-muted-foreground">
              {{ delayLocal }} ms
            </span>
          </div>
          <Slider
            id="delay"
            :model-value="[delayLocal]"
            :min="0"
            :max="500"
            :step="5"
            @update:model-value="setDelay"
          />
        </div>
        <div class="flex items-center gap-2">
          <Switch id="full_cycle" v-model="fullCycle" />
          <Label for="full_cycle" class="cursor-pointer">
            Full rotation
          </Label>
        </div>
      </CardContent>
    </Card>

    <!-- Preset picker -->
    <Dialog v-model:open="pickerOpen">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Run a preset</DialogTitle>
          <DialogDescription>
            Pick a saved frame to push to the wall.
          </DialogDescription>
        </DialogHeader>
        <div
          class="max-h-[55vh] overflow-y-auto rounded-md border border-border"
        >
          <div
            v-if="presetsLoading"
            class="flex items-center justify-center py-8"
          >
            <Loader2 class="size-4 animate-spin text-muted-foreground" />
          </div>
          <button
            v-for="p in presets"
            v-else
            :key="p.id"
            type="button"
            class="flex w-full items-center justify-between gap-3 border-b border-border/60 px-4 py-3 text-left last:border-b-0 hover:bg-muted/60 disabled:opacity-50"
            :disabled="runningPresetId !== null"
            @click="runPreset(p)"
          >
            <div class="flex flex-col">
              <span class="font-medium">{{ p.name }}</span>
              <span class="num text-xs text-muted-foreground">
                {{ p.width }} × {{ p.height }}
              </span>
            </div>
            <Badge
              v-if="display.currentPresetId.value === p.id"
              variant="success"
            >
              Showing
            </Badge>
            <Loader2
              v-else-if="runningPresetId === p.id"
              class="size-4 animate-spin"
            />
            <Play v-else class="size-4 text-muted-foreground" />
          </button>
          <div
            v-if="!presetsLoading && !presets.length"
            class="px-4 py-8 text-center text-sm text-muted-foreground"
          >
            No presets saved yet.
          </div>
        </div>
        <DialogFooter>
          <DialogClose as-child>
            <Button variant="ghost">Close</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
