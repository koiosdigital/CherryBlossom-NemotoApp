<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  Button,
  Badge,
  Input,
  Label,
  Separator,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui'
import {
  ChevronLeft,
  Eye,
  Loader2,
  RefreshCw,
  Save,
  Trash2,
  Undo2,
} from 'lucide-vue-next'
import { apiClient } from '@/api'
import { useModules } from '@/composables/useModules'
import { useGrid } from '@/composables/useGrid'
import { useFlaps } from '@/composables/useFlaps'
import { useToast } from '@/composables/useToast'

const modules = useModules()
const gridState = useGrid()
const flapsState = useFlaps()
const { toast } = useToast()

const CELL_W = 50
const CELL_H = 80
const AXIS = 24

function uuidParts(u: string) {
  return [u.slice(0, 4), u.slice(4, 8), u.slice(8, 12)]
}

// ---------- dimensions ----------
const gridSize = computed(
  () => gridState.grid.value?.grid ?? { width: 0, height: 0 }
)
const widthDraft = ref(0)
const heightDraft = ref(0)
watch(
  () => gridSize.value,
  (g) => {
    widthDraft.value = g.width
    heightDraft.value = g.height
  },
  { immediate: true }
)

const dimsDirty = computed(
  () =>
    widthDraft.value !== gridSize.value.width ||
    heightDraft.value !== gridSize.value.height
)
const dimsSaving = ref(false)

async function applyDims() {
  if (!dimsDirty.value) return
  dimsSaving.value = true
  try {
    await apiClient.POST('/api/grid/size', {
      body: { width: widthDraft.value, height: heightDraft.value },
    })
    toast({ title: 'Grid size updated', variant: 'success' })
  } catch (e) {
    toast({
      title: "Couldn't resize grid",
      description: e instanceof Error ? e.message : String(e),
      variant: 'destructive',
    })
  } finally {
    dimsSaving.value = false
  }
}

// ---------- mapping lookup ----------
const cellIndex = computed(() => {
  const m = new Map<string, string>()
  for (const entry of gridState.grid.value?.mapping ?? []) {
    m.set(`${entry.x},${entry.y}`, entry.uuid)
  }
  return m
})
function moduleAt(x: number, y: number) {
  const uuid = cellIndex.value.get(`${x},${y}`)
  return uuid ? modules.modules.value.find((m) => m.uuid === uuid) : null
}
const unmapped = computed(() =>
  modules.modules.value.filter((m) => !m.grid)
)

// ---------- identify wave ----------
// Local map of UUID → FlapIndex currently displayed on the module.
const wave = ref(new Map<string, number>())
const waveRunning = ref(false)

const letterFlaps = computed(() => flapsState.letters.value)

function glyphForUuid(uuid: string): string | null {
  const idx = wave.value.get(uuid)
  if (idx == null) return null
  return flapsState.byId.value.get(idx)?.glyph ?? null
}

async function runIdentify() {
  if (!unmapped.value.length) return
  if (!letterFlaps.value.length) {
    toast({
      title: 'Flap catalog unavailable',
      description: 'Try refreshing the page.',
      variant: 'warn',
    })
    return
  }
  waveRunning.value = true
  try {
    const batchSize = Math.min(unmapped.value.length, letterFlaps.value.length)
    const batch = unmapped.value.slice(0, batchSize)
    const flapIds = letterFlaps.value.slice(0, batchSize).map((f) => f.id)
    const { data, error: err } = await apiClient.POST(
      '/api/setup/identify_pass',
      {
        body: {
          flaps: flapIds,
          modules: batch.map((m) => m.uuid),
        },
      }
    )
    if (err || !data) throw err ?? new Error('identify failed')
    const next = new Map<string, number>()
    for (const entry of data.pass) next.set(entry.uuid, entry.flap)
    wave.value = next
    toast({
      title: `Identifying ${data.pass.length} module${data.pass.length === 1 ? '' : 's'}`,
      description: 'Each module now shows a different letter.',
      variant: 'success',
    })
  } catch (e) {
    toast({
      title: "Couldn't run identify",
      description: e instanceof Error ? e.message : String(e),
      variant: 'destructive',
    })
  } finally {
    waveRunning.value = false
  }
}

function clearWave() {
  wave.value = new Map()
}

// ---------- cell picker ----------
const pickerOpen = ref(false)
const pickerCell = ref<{ x: number; y: number } | null>(null)
const assigning = ref(false)

function openPicker(x: number, y: number) {
  pickerCell.value = { x, y }
  pickerOpen.value = true
}

// Sort unmapped by wave letter if present, UUID otherwise, so identified
// modules come first and in alphabetical letter order.
const pickerCandidates = computed(() => {
  const withWave: Array<{ uuid: string; shortId: number; letter: string | null; sortKey: string }> = []
  for (const m of unmapped.value) {
    const letter = glyphForUuid(m.uuid)
    withWave.push({
      uuid: m.uuid,
      shortId: m.short_id,
      letter,
      sortKey: letter ?? `~${m.uuid}`, // '~' sorts after letters
    })
  }
  withWave.sort((a, b) => a.sortKey.localeCompare(b.sortKey))
  return withWave
})

async function assign(uuid: string) {
  if (!pickerCell.value) return
  assigning.value = true
  try {
    const { x, y } = pickerCell.value
    const { error: err } = await apiClient.PUT('/api/grid/cell', {
      body: { x, y, uuid },
    })
    if (err) throw err
    // Clear from wave since it's now mapped
    const next = new Map(wave.value)
    next.delete(uuid)
    wave.value = next
    pickerOpen.value = false
    pickerCell.value = null
  } catch (e) {
    toast({
      title: "Couldn't place module",
      description: e instanceof Error ? e.message : String(e),
      variant: 'destructive',
    })
  } finally {
    assigning.value = false
  }
}

// ---------- remove ----------
async function removeAt(x: number, y: number) {
  try {
    await apiClient.DELETE('/api/grid/cell', {
      body: { x, y },
    })
  } catch (e) {
    toast({
      title: "Couldn't unassign cell",
      description: e instanceof Error ? e.message : String(e),
      variant: 'destructive',
    })
  }
}

// ---------- persistence ----------
const saving = ref(false)
const resetOpen = ref(false)
const resetting = ref(false)

async function save() {
  saving.value = true
  try {
    await apiClient.POST('/api/grid/save', {})
    toast({ title: 'Grid saved to device', variant: 'success' })
  } catch (e) {
    toast({
      title: "Couldn't save",
      description: e instanceof Error ? e.message : String(e),
      variant: 'destructive',
    })
  } finally {
    saving.value = false
  }
}

async function resetGrid() {
  resetting.value = true
  try {
    await apiClient.POST('/api/grid/reset', {})
    toast({ title: 'Grid cleared', variant: 'success' })
    resetOpen.value = false
  } catch (e) {
    toast({
      title: "Couldn't reset",
      description: e instanceof Error ? e.message : String(e),
      variant: 'destructive',
    })
  } finally {
    resetting.value = false
  }
}
</script>

<template>
  <div class="flex flex-col gap-6">
    <RouterLink
      to="/settings"
      class="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
    >
      <ChevronLeft class="size-4" />
      Settings
    </RouterLink>

    <section class="flex flex-col gap-2">
      <div class="flex flex-wrap items-end justify-between gap-4">
        <div class="flex flex-col gap-1">
          <h1 class="display-face text-3xl font-semibold tracking-tight">
            Grid management
          </h1>
          <p class="max-w-xl text-sm text-muted-foreground">
            Lay out where each module sits on the wall. Use Identify to label
            unplaced modules, then tap their cell.
          </p>
        </div>
        <Button variant="ghost" size="sm" @click="gridState.refresh">
          <RefreshCw />
          Refresh
        </Button>
      </div>
    </section>

    <!-- Dimensions -->
    <Card>
      <CardHeader>
        <CardTitle>Board size</CardTitle>
        <CardDescription>
          Cells outside the new size are removed.
        </CardDescription>
      </CardHeader>
      <CardContent class="flex flex-wrap items-end gap-4">
        <div class="flex flex-col gap-1.5">
          <Label for="w">Columns</Label>
          <Input
            id="w"
            type="number"
            :min="1"
            :max="32"
            v-model.number="widthDraft"
            class="w-24"
          />
        </div>
        <span class="mb-2 text-muted-foreground">×</span>
        <div class="flex flex-col gap-1.5">
          <Label for="h">Rows</Label>
          <Input
            id="h"
            type="number"
            :min="1"
            :max="16"
            v-model.number="heightDraft"
            class="w-24"
          />
        </div>
        <Button
          class="ml-auto"
          :disabled="!dimsDirty || dimsSaving"
          @click="applyDims"
        >
          <Loader2 v-if="dimsSaving" class="animate-spin" />
          <Save v-else />
          Apply size
        </Button>
      </CardContent>
    </Card>

    <!-- Identify -->
    <Card>
      <CardHeader>
        <div class="flex items-start justify-between gap-4">
          <div class="flex flex-col gap-1">
            <CardTitle>Identify unplaced modules</CardTitle>
            <CardDescription>
              Shows a different letter on each unplaced module so you can tell
              them apart on the wall.
            </CardDescription>
          </div>
          <Badge variant="outline">
            {{ unmapped.length }} unplaced
          </Badge>
        </div>
      </CardHeader>
      <CardFooter class="gap-2">
        <Button
          :disabled="!unmapped.length || waveRunning"
          @click="runIdentify"
        >
          <Loader2 v-if="waveRunning" class="animate-spin" />
          <Eye v-else />
          Identify unplaced
        </Button>
        <Button v-if="wave.size" variant="ghost" size="sm" @click="clearWave">
          Clear letters
        </Button>
      </CardFooter>
    </Card>

    <!-- Mapped grid -->
    <Card>
      <CardHeader>
        <CardTitle>
          {{ gridSize.width }} × {{ gridSize.height }}
        </CardTitle>
        <CardDescription>
          Tap a cell to add or remove a module.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div
          v-if="gridSize.width && gridSize.height"
          class="-mx-6 overflow-x-auto px-6 sm:mx-0 sm:px-0"
        >
          <div
            class="mx-auto grid w-max gap-1"
            :style="{
              gridTemplateColumns: `${AXIS}px repeat(${gridSize.width}, ${CELL_W}px)`,
              gridTemplateRows: `${AXIS}px repeat(${gridSize.height}, ${CELL_H}px)`,
            }"
          >
            <div />
            <div
              v-for="x in gridSize.width"
              :key="`col-${x}`"
              class="num flex items-end justify-center pb-1 text-[10px] text-muted-foreground"
            >
              {{ x - 1 }}
            </div>
            <template v-for="y in gridSize.height" :key="`row-${y}`">
              <div
                class="num flex items-center justify-end pr-2 text-[10px] text-muted-foreground"
              >
                {{ y - 1 }}
              </div>
              <template v-for="x in gridSize.width" :key="`${x}-${y}`">
                <button
                  v-if="moduleAt(x - 1, y - 1)"
                  type="button"
                  :title="`(${x - 1}, ${y - 1}) · ${moduleAt(x - 1, y - 1)!.uuid}`"
                  class="flex flex-col items-center justify-between gap-1 rounded-sm border border-border bg-muted/40 p-1.5 transition-colors hover:border-destructive hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  @click="removeAt(x - 1, y - 1)"
                >
                  <span
                    class="status-dot size-1.5!"
                    :class="
                      moduleAt(x - 1, y - 1)?.alive
                        ? 'text-emerald-500'
                        : 'text-amber-500'
                    "
                  />
                  <span
                    class="flex flex-col items-center font-mono text-[10px] leading-tight tracking-tight"
                  >
                    <span
                      v-for="part in uuidParts(moduleAt(x - 1, y - 1)!.uuid)"
                      :key="part"
                    >
                      {{ part }}
                    </span>
                  </span>
                </button>
                <button
                  v-else
                  type="button"
                  :title="`(${x - 1}, ${y - 1})`"
                  class="rounded-sm border border-dashed border-border/50 text-xs text-muted-foreground/60 transition-colors hover:border-primary hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  @click="openPicker(x - 1, y - 1)"
                >
                  +
                </button>
              </template>
            </template>
          </div>
        </div>
        <p v-else class="text-sm text-muted-foreground">
          Set a board size above to start placing modules.
        </p>
      </CardContent>
    </Card>

    <!-- Unmapped list -->
    <Card>
      <CardHeader>
        <CardTitle>
          {{ unmapped.length }} unplaced
        </CardTitle>
      </CardHeader>
      <CardContent class="px-0">
        <div v-if="unmapped.length" class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr
                class="border-b border-border text-xs text-muted-foreground [&>th]:px-4 [&>th]:py-2 [&>th]:text-left"
              >
                <th class="w-12">Shown</th>
                <th>UUID</th>
                <th class="num">Short ID</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="c in pickerCandidates"
                :key="c.uuid"
                class="border-b border-border last:border-b-0 [&>td]:px-4 [&>td]:py-2.5"
              >
                <td>
                  <span
                    v-if="c.letter"
                    class="inline-flex size-8 items-center justify-center rounded-sm bg-primary font-mono text-sm font-bold text-primary-foreground"
                  >
                    {{ c.letter }}
                  </span>
                  <span v-else class="text-muted-foreground">—</span>
                </td>
                <td class="num text-xs">{{ c.uuid }}</td>
                <td class="num text-muted-foreground">{{ c.shortId }}</td>
                <td>
                  <Badge
                    :variant="
                      modules.modules.value.find((m) => m.uuid === c.uuid)?.alive
                        ? 'success'
                        : 'warn'
                    "
                  >
                    {{
                      modules.modules.value.find((m) => m.uuid === c.uuid)?.alive
                        ? 'Online'
                        : 'Offline'
                    }}
                  </Badge>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div
          v-else
          class="px-6 py-8 text-center text-sm text-muted-foreground"
        >
          All discovered modules are placed.
        </div>
      </CardContent>
    </Card>

    <!-- Persistence -->
    <div class="flex flex-wrap items-center justify-end gap-2">
      <Dialog v-model:open="resetOpen">
        <Button variant="outline" @click="resetOpen = true">
          <Undo2 />
          Reset board
        </Button>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset the board?</DialogTitle>
            <DialogDescription>
              Clears all placements and restores default dimensions. Saved
              configuration stays on the device until you hit Save.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose as-child>
              <Button variant="ghost">Cancel</Button>
            </DialogClose>
            <Button
              variant="destructive"
              :disabled="resetting"
              @click="resetGrid"
            >
              <Loader2 v-if="resetting" class="animate-spin" />
              <Trash2 v-else />
              Reset
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Separator orientation="vertical" class="mx-1 h-6" />
      <Button :disabled="saving" @click="save">
        <Loader2 v-if="saving" class="animate-spin" />
        <Save v-else />
        Save to device
      </Button>
    </div>

    <!-- Cell picker dialog -->
    <Dialog v-model:open="pickerOpen">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Place at
            <span class="num text-muted-foreground" v-if="pickerCell">
              ({{ pickerCell.x }}, {{ pickerCell.y }})
            </span>
          </DialogTitle>
          <DialogDescription>
            Pick the module whose letter is at this position on the wall.
          </DialogDescription>
        </DialogHeader>
        <div
          class="max-h-[55vh] overflow-y-auto rounded-md border border-border"
        >
          <button
            v-for="c in pickerCandidates"
            :key="c.uuid"
            type="button"
            class="flex w-full items-center gap-3 border-b border-border/60 px-3 py-2.5 text-left last:border-b-0 hover:bg-muted/60 disabled:opacity-50"
            :disabled="assigning"
            @click="assign(c.uuid)"
          >
            <span
              v-if="c.letter"
              class="inline-flex size-10 shrink-0 items-center justify-center rounded-sm bg-primary font-mono text-base font-bold text-primary-foreground"
            >
              {{ c.letter }}
            </span>
            <span
              v-else
              class="inline-flex size-10 shrink-0 items-center justify-center rounded-sm border border-dashed border-border text-xs text-muted-foreground"
            >
              —
            </span>
            <div class="flex min-w-0 flex-col">
              <span class="num truncate text-xs">{{ c.uuid }}</span>
              <span class="text-[11px] text-muted-foreground">
                short {{ c.shortId }}
              </span>
            </div>
          </button>
          <div
            v-if="!pickerCandidates.length"
            class="px-3 py-8 text-center text-sm text-muted-foreground"
          >
            No unplaced modules left.
          </div>
        </div>
        <DialogFooter>
          <DialogClose as-child>
            <Button variant="ghost">Cancel</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
