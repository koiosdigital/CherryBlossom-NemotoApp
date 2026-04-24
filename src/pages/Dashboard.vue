<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'
import {
  Card,
  CardContent,
  Button,
  Badge,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui'
import { Loader2, Pencil, Play, Zap } from 'lucide-vue-next'
import DisplayCell from '@/components/DisplayCell.vue'
import { apiClient } from '@/api'
import type { components } from '@/api.d'
import { useDisplay } from '@/composables/useDisplay'
import { useGrid } from '@/composables/useGrid'
import { useFlaps } from '@/composables/useFlaps'
import { useModules } from '@/composables/useModules'
import { useToast } from '@/composables/useToast'

type PresetMeta = components['schemas']['PresetMeta']

const display = useDisplay()
const gridState = useGrid()
const flaps = useFlaps()
const modules = useModules()
const { toast } = useToast()

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
      description: e instanceof Error ? e.message : String(e),
      variant: 'destructive',
    })
  } finally {
    runningPresetId.value = null
  }
}

// ---------- (placeholder) summary sections ----------
const activity = [
  { t: '14:22', text: 'Preset "ARRIVALS" activated', kind: 'info' },
  { t: '14:21', text: 'Schedule "Morning" ran', kind: 'info' },
  { t: '13:58', text: 'Module M-05 high temperature', kind: 'warn' },
  { t: '13:45', text: 'NTP sync completed', kind: 'ok' },
]
</script>

<template>
  <div class="flex flex-col gap-8">
    <section class="flex flex-col gap-2">
      <span class="eyebrow">Control plane</span>
      <h1 class="display-face text-3xl font-semibold tracking-tight">
        Display overview
      </h1>
      <p class="max-w-xl text-sm text-muted-foreground">
        Live state of the wall.
      </p>
    </section>

    <!-- HERO: full-width live display preview -->
    <section class="flex flex-col gap-3">
      <div
        v-if="display.currentPresetName.value"
        class="flex items-baseline gap-2"
      >
        <span class="eyebrow">Preset</span>
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

      <div class="flex justify-center">
        <Button variant="ghost" size="sm" @click="openPicker">
          <Play />
          Run preset
        </Button>
      </div>
    </section>

    <section class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardContent class="flex flex-col gap-2 py-5">
          <span class="eyebrow">Modules online</span>
          <div class="flex items-baseline gap-2">
            <span class="display-face text-2xl font-semibold num">
              {{ modules.modules.value.filter((m) => m.alive).length }}
            </span>
            <span class="text-xs text-muted-foreground num">
              / {{ modules.modules.value.length }}
            </span>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent class="flex flex-col gap-2 py-5">
          <span class="eyebrow">Grid size</span>
          <div class="flex items-baseline gap-2">
            <span class="display-face text-2xl font-semibold num">
              {{ gridSize.width }} × {{ gridSize.height }}
            </span>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent class="flex flex-col gap-2 py-5">
          <span class="eyebrow">Mapped cells</span>
          <div class="flex items-baseline gap-2">
            <span class="display-face text-2xl font-semibold num">
              {{ gridState.grid.value?.mapping.length ?? 0 }}
            </span>
            <span class="text-xs text-muted-foreground num">
              / {{ gridSize.width * gridSize.height }}
            </span>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent class="flex flex-col gap-2 py-5">
          <span class="eyebrow">Catalog</span>
          <div class="flex items-baseline gap-2">
            <span class="display-face text-2xl font-semibold num">
              {{ flaps.flaps.value.length }}
            </span>
            <span class="text-xs text-muted-foreground">flaps</span>
          </div>
        </CardContent>
      </Card>
    </section>

    <Card>
      <CardContent class="py-4">
        <span class="eyebrow">Recent activity</span>
        <ol class="mt-3 flex flex-col gap-3">
          <li
            v-for="(a, i) in activity"
            :key="i"
            class="flex items-start gap-3 text-sm"
          >
            <span class="num mt-0.5 w-10 text-xs text-muted-foreground">
              {{ a.t }}
            </span>
            <Zap
              class="mt-0.5 size-3.5 shrink-0"
              :class="
                a.kind === 'warn'
                  ? 'text-amber-500'
                  : a.kind === 'ok'
                    ? 'text-emerald-500'
                    : 'text-muted-foreground'
              "
            />
            <span>{{ a.text }}</span>
          </li>
        </ol>
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
