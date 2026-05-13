<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
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
  AlertTriangle,
  Check,
  ChevronLeft,
  Eye,
  FileUp,
  Home,
  Loader2,
  MoreHorizontal,
  Octagon,
  OctagonAlert,
  Pencil,
  Radar,
  RefreshCw,
  Rocket,
  SlidersHorizontal,
  Trash2,
  Undo2,
  Upload,
  Zap,
} from 'lucide-vue-next'
import { apiClient } from '@/api'
import { useModules } from '@/composables/useModules'
import { useGrid } from '@/composables/useGrid'
import { useFlaps } from '@/composables/useFlaps'
import { useBootloader } from '@/composables/useBootloader'
import { useToast } from '@/composables/useToast'
import CalibrationModal from './CalibrationModal.vue'
import ModuleAdvancedModal from '@/components/ModuleAdvancedModal.vue'
import BusActionsModal from '@/components/BusActionsModal.vue'
import { friendlyError } from '@/lib/errors'
import type { components } from '@/api.d'

type BootloaderState = components['schemas']['BootloaderState']
type BootloaderFailReason = components['schemas']['BootloaderFailReason']
type StepperState = components['schemas']['StepperState']

const modules = useModules()
const gridState = useGrid()
const flapsState = useFlaps()
const bootloader = useBootloader()
const { toast } = useToast()

onMounted(() => {
  // Populate `info.fw` and persisted/calibration state for every module.
  modules.fetchAll().catch(() => {})
})

// ---------- visual constants ----------
const CELL_W = 50
const CELL_H = 80
const AXIS = 24

// ---------- grid + modules ----------
const gridSize = computed(
  () => gridState.grid.value?.grid ?? { width: 0, height: 0 }
)

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

const sortedModules = computed(() =>
  [...modules.modules.value].sort((a, b) => a.short_id - b.short_id)
)

// ---------- motion indicator ----------
type Motion = { label: string; spinning: boolean; tone: 'destructive' | 'secondary' }
function motionFor(state: StepperState | undefined | null): Motion | null {
  if (!state || state === 'idle' || state === 'unknown') return null
  if (state === 'error')
    return { label: 'Error', spinning: false, tone: 'destructive' }
  if (state === 'homing' || state === 'rehoming')
    return { label: 'Homing', spinning: true, tone: 'secondary' }
  return { label: 'Moving', spinning: true, tone: 'secondary' }
}

// ---------- dimensions popover ----------
const resizeOpen = ref(false)
const widthDraft = ref(0)
const heightDraft = ref(0)
const resizing = ref(false)
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
async function applyDims() {
  if (!dimsDirty.value) return
  resizing.value = true
  try {
    await gridState.setSize(widthDraft.value, heightDraft.value)
    resizeOpen.value = false
    toast({ title: 'Board resized', variant: 'success' })
  } catch (e) {
    toast({
      title: "Couldn't resize",
      description: friendlyError(e),
      variant: 'destructive',
    })
  } finally {
    resizing.value = false
  }
}

// ---------- reset board ----------
const resetOpen = ref(false)
const resetting = ref(false)
async function resetBoard() {
  resetting.value = true
  try {
    await gridState.resetBoard()
    resetOpen.value = false
    toast({ title: 'Board cleared', variant: 'success' })
  } catch (e) {
    toast({
      title: "Couldn't reset",
      description: friendlyError(e),
      variant: 'destructive',
    })
  } finally {
    resetting.value = false
  }
}

// ---------- identify wave ----------
const wave = ref(new Map<string, number>())
const waveRunning = ref(false)
// 62 flaps available for placement (everything except A=0 and blank=56),
// covering up to 62 modules with unique labels in a single pass.
const placementFlaps = computed(() => flapsState.placement.value)

function flapForUuid(uuid: string) {
  const idx = wave.value.get(uuid)
  if (idx == null) return null
  return flapsState.byId.value.get(idx) ?? null
}

async function runIdentify() {
  if (!unmapped.value.length) return
  if (!placementFlaps.value.length) {
    toast({
      title: 'Flap catalog unavailable',
      description: 'Try refreshing the page.',
      variant: 'warn',
    })
    return
  }
  waveRunning.value = true
  try {
    const batchSize = Math.min(unmapped.value.length, placementFlaps.value.length)
    const batch = unmapped.value.slice(0, batchSize)
    const flapIds = placementFlaps.value.slice(0, batchSize).map((f) => f.id)
    const { data, error: err } = await apiClient.POST(
      '/api/setup/identify_pass',
      { body: { flaps: flapIds, modules: batch.map((m) => m.uuid) } }
    )
    if (err || !data) throw err ?? new Error('identify failed')
    const next = new Map<string, number>()
    for (const entry of data.pass) next.set(entry.uuid, entry.flap)
    wave.value = next
    toast({
      title: `Identifying ${data.pass.length} module${data.pass.length === 1 ? '' : 's'}`,
      description: 'Each module shows a different letter on the wall.',
      variant: 'success',
    })
  } catch (e) {
    toast({
      title: "Couldn't run identify",
      description: friendlyError(e),
      variant: 'destructive',
    })
  } finally {
    waveRunning.value = false
  }
}

function clearWave() {
  wave.value = new Map()
}

// ---------- cell picker (assign empty cell → module) ----------
const pickerOpen = ref(false)
const pickerCell = ref<{ x: number; y: number } | null>(null)
const assigning = ref(false)

function openPicker(x: number, y: number) {
  pickerCell.value = { x, y }
  pickerOpen.value = true
}

const pickerCandidates = computed(() => {
  type C = {
    uuid: string
    shortId: number
    flap: ReturnType<typeof flapForUuid>
    sortKey: string
    alive: boolean
  }
  const out: C[] = []
  for (const m of unmapped.value) {
    const f = flapForUuid(m.uuid)
    out.push({
      uuid: m.uuid,
      shortId: m.short_id,
      flap: f,
      // Sort by flap id when identified (same order the wave fired) so the
      // list matches the visual order on the wall, then unidentified by uuid.
      sortKey: f ? String(f.id).padStart(3, '0') : `~${m.uuid}`,
      alive: m.alive,
    })
  }
  out.sort((a, b) => a.sortKey.localeCompare(b.sortKey))
  return out
})

async function assign(uuid: string) {
  if (!pickerCell.value) return
  assigning.value = true
  try {
    const { x, y } = pickerCell.value
    await gridState.assignCell(x, y, uuid)
    const next = new Map(wave.value)
    next.delete(uuid)
    wave.value = next
    pickerOpen.value = false
    pickerCell.value = null
  } catch (e) {
    toast({
      title: "Couldn't place module",
      description: friendlyError(e),
      variant: 'destructive',
    })
  } finally {
    assigning.value = false
  }
}

async function removeAt(x: number, y: number) {
  try {
    await gridState.removeCell(x, y)
  } catch (e) {
    toast({
      title: "Couldn't remove",
      description: friendlyError(e),
      variant: 'destructive',
    })
  }
}

// ---------- drag-and-drop move/swap ----------
// HTML5 DnD: drag a placed cell, drop on another cell. Empty target → move,
// placed target → swap. Source coords flow via dataTransfer to survive the
// drop without leaning on a parent ref.
const dragSource = ref<{ x: number; y: number } | null>(null)
const dragOver = ref<{ x: number; y: number } | null>(null)

function onDragStart(e: DragEvent, x: number, y: number) {
  dragSource.value = { x, y }
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', `${x},${y}`)
  }
}

function onDragEnd() {
  dragSource.value = null
  dragOver.value = null
}

function onDragOver(e: DragEvent, x: number, y: number) {
  if (!dragSource.value) return
  if (dragSource.value.x === x && dragSource.value.y === y) return
  e.preventDefault()
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
  dragOver.value = { x, y }
}

function onDragLeave(x: number, y: number) {
  if (dragOver.value?.x === x && dragOver.value?.y === y) {
    dragOver.value = null
  }
}

async function onDrop(e: DragEvent, x: number, y: number) {
  e.preventDefault()
  const src = dragSource.value
  dragSource.value = null
  dragOver.value = null
  if (!src) return
  if (src.x === x && src.y === y) return
  const targetHasModule = !!moduleAt(x, y)
  try {
    if (targetHasModule) {
      await gridState.swapCell(src, { x, y })
    } else {
      await gridState.moveCell(src, { x, y })
    }
  } catch (err) {
    toast({
      title: targetHasModule ? "Couldn't swap" : "Couldn't move",
      description: friendlyError(err),
      variant: 'destructive',
    })
  }
}

// ---------- calibration modal ----------
const calibrationUuid = ref<string | null>(null)
const calibrationOpen = ref(false)
function openCalibration(uuid: string) {
  calibrationUuid.value = uuid
  calibrationOpen.value = true
}

// ---------- advanced module modal ----------
const advancedUuid = ref<string | null>(null)
const advancedOpen = ref(false)
function openAdvanced(uuid: string) {
  advancedUuid.value = uuid
  advancedOpen.value = true
}

// ---------- bus actions modal ----------
const busActionsOpen = ref(false)

// ---------- bus-wide recovery actions ----------
const homingAll = ref(false)
const stoppingAll = ref(false)

const recoveryConfirmOpen = ref(false)
const pendingRecovery = ref<'home_all' | 'emergency_stop' | null>(null)

function askRecovery(kind: 'home_all' | 'emergency_stop') {
  pendingRecovery.value = kind
  recoveryConfirmOpen.value = true
}

async function runRecovery() {
  const kind = pendingRecovery.value
  if (!kind) return
  recoveryConfirmOpen.value = false
  if (kind === 'home_all') homingAll.value = true
  else stoppingAll.value = true
  try {
    await apiClient.POST('/api/modules', { body: { action: kind } })
    toast({
      title:
        kind === 'home_all' ? 'Homing every module' : 'Emergency stop sent',
      variant: kind === 'home_all' ? 'success' : 'warn',
    })
  } catch (e) {
    toast({
      title: kind === 'home_all' ? "Couldn't home modules" : "Couldn't stop",
      description: friendlyError(e),
      variant: 'destructive',
    })
  } finally {
    homingAll.value = false
    stoppingAll.value = false
    pendingRecovery.value = null
  }
}

// ---------- bootloader / firmware ----------
const STATE_LABEL: Record<BootloaderState, string> = {
  idle: 'Idle',
  arming: 'Waking up modules',
  connecting: 'Connecting',
  flashing: 'Updating',
  finalizing: 'Wrapping up',
  rediscover: 'Waiting for restart',
  success: 'Done',
  failed: 'Failed',
  aborted: 'Cancelled',
}

const STATE_VARIANT: Record<
  BootloaderState,
  'default' | 'success' | 'warn' | 'destructive' | 'outline' | 'secondary'
> = {
  idle: 'outline',
  arming: 'secondary',
  connecting: 'secondary',
  flashing: 'default',
  finalizing: 'default',
  rediscover: 'secondary',
  success: 'success',
  failed: 'destructive',
  aborted: 'warn',
}

const FAIL_LABEL: Record<BootloaderFailReason, string> = {
  none: '',
  no_bootloaders: 'No modules responded.',
  block_ack_timeout: 'A module stopped responding part way through.',
  block_nacked: 'A module rejected the firmware.',
  eof_failed: "A module didn't confirm the end of the file.",
  complete_failed: "Couldn't tell modules to restart.",
  invalid_image: "That file doesn't look like valid firmware.",
  aborted_by_user: 'You cancelled the update.',
  internal: 'Something went wrong on the display.',
}

const progressPct = computed(() => Math.round(bootloader.progress.value * 100))
const showSessionCard = computed(() => bootloader.isActive.value)

const fileInput = ref<HTMLInputElement | null>(null)
const file = ref<File | null>(null)
const assumeInBl = ref(false)
const emergency = ref(false)
function pickFile() { fileInput.value?.click() }
function onFileChange(e: Event) {
  const input = e.target as HTMLInputElement
  file.value = input.files?.[0] ?? null
}
function clearFile() {
  file.value = null
  if (fileInput.value) fileInput.value.value = ''
}

const uploading = ref(false)
const probing = ref(false)
const entering = ref(false)
const aborting = ref(false)
const confirmFlashOpen = ref(false)

async function startFlash() {
  if (!file.value) return
  confirmFlashOpen.value = false
  uploading.value = true
  try {
    const res = await bootloader.upload(file.value, {
      assumeInBl: assumeInBl.value,
      emergency: emergency.value,
    })
    if (!res.ok) {
      toast({ title: 'File rejected', description: res.error, variant: 'destructive' })
      return
    }
    toast({
      title: emergency.value
        ? `Emergency-updating to ${res.fw}`
        : `Updating to ${res.fw}`,
      variant: 'success',
    })
  } catch (e) {
    toast({
      title: "Couldn't start update",
      description: friendlyError(e),
      variant: 'destructive',
    })
  } finally {
    uploading.value = false
  }
}

async function runProbe() {
  probing.value = true
  try {
    const r = await bootloader.probe()
    if (!r) return
    toast({
      title: r.any_in_bootloader ? 'A module is ready to update' : 'No modules ready to update',
      variant: r.any_in_bootloader ? 'success' : 'warn',
    })
  } catch (e) {
    toast({ title: "Couldn't check", description: friendlyError(e), variant: 'destructive' })
  } finally {
    probing.value = false
  }
}

async function runEnter() {
  entering.value = true
  try {
    const r = await bootloader.enterBootloader()
    toast({
      title: r?.ok ? 'Modules switching to update mode' : "Couldn't switch modes",
      variant: r?.ok ? 'success' : 'destructive',
    })
  } catch (e) {
    toast({ title: "Couldn't switch modes", description: friendlyError(e), variant: 'destructive' })
  } finally {
    entering.value = false
  }
}

async function runAbort() {
  aborting.value = true
  try {
    const r = await bootloader.abort()
    toast({ title: r?.ok ? 'Cancelling update' : 'Nothing to cancel', variant: r?.ok ? 'warn' : 'default' })
  } catch (e) {
    toast({ title: "Couldn't cancel", description: friendlyError(e), variant: 'destructive' })
  } finally {
    aborting.value = false
  }
}

function refreshAll() {
  gridState.refresh()
  bootloader.refresh()
  modules.fetchAll().catch(() => {})
}

function deviceEntry(uuid: string) {
  return bootloader.devicesByUuid.value.get(uuid) ?? null
}

function fmtSize(bytes: number) {
  if (!bytes) return '—'
  if (bytes < 1024) return `${bytes} B`
  return `${(bytes / 1024).toFixed(1)} KB`
}

function uuidParts(u: string) {
  return [u.slice(0, 4), u.slice(4, 8), u.slice(8, 12)]
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
            Modules
          </h1>
          <p class="max-w-xl text-sm text-muted-foreground">
            Lay out the wall, calibrate each module, and update firmware.
          </p>
        </div>
        <div class="flex flex-wrap items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            :disabled="homingAll"
            @click="askRecovery('home_all')"
          >
            <Loader2 v-if="homingAll" class="animate-spin" />
            <Home v-else />
            Home all
          </Button>
          <Button
            variant="outline"
            size="sm"
            :disabled="stoppingAll"
            class="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
            @click="askRecovery('emergency_stop')"
          >
            <Loader2 v-if="stoppingAll" class="animate-spin" />
            <OctagonAlert v-else />
            Stop
          </Button>
          <Button variant="outline" size="sm" @click="busActionsOpen = true">
            <SlidersHorizontal />
            Bus controls
          </Button>
          <Button variant="ghost" size="sm" @click="refreshAll">
            <RefreshCw />
            Refresh
          </Button>
        </div>
      </div>
    </section>

    <!-- Wall layout -->
    <Card>
      <CardHeader>
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div class="flex flex-col gap-1">
            <CardTitle>
              {{ gridSize.width }} × {{ gridSize.height }} board
            </CardTitle>
            <CardDescription>
              Tap an empty cell to place a module. Tap a placed module to
              calibrate it.
            </CardDescription>
          </div>
          <div class="flex items-center gap-1">
            <Dialog v-model:open="resizeOpen">
              <Button variant="outline" size="sm" @click="resizeOpen = true">
                <Pencil />
                Resize
              </Button>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Resize the board</DialogTitle>
                  <DialogDescription>
                    Cells outside the new size will be removed.
                  </DialogDescription>
                </DialogHeader>
                <div class="flex items-end gap-3">
                  <div class="flex flex-col gap-1.5">
                    <Label for="cols">Columns</Label>
                    <Input
                      id="cols"
                      type="number"
                      :min="1"
                      :max="32"
                      v-model.number="widthDraft"
                      class="w-24"
                    />
                  </div>
                  <span class="mb-2 text-muted-foreground">×</span>
                  <div class="flex flex-col gap-1.5">
                    <Label for="rows">Rows</Label>
                    <Input
                      id="rows"
                      type="number"
                      :min="1"
                      :max="16"
                      v-model.number="heightDraft"
                      class="w-24"
                    />
                  </div>
                </div>
                <DialogFooter>
                  <DialogClose as-child>
                    <Button variant="ghost">Cancel</Button>
                  </DialogClose>
                  <Button :disabled="!dimsDirty || resizing" @click="applyDims">
                    <Loader2 v-if="resizing" class="animate-spin" />
                    Apply
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            <Dialog v-model:open="resetOpen">
              <Button variant="ghost" size="sm" @click="resetOpen = true">
                <Undo2 />
                Reset
              </Button>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Clear all placements?</DialogTitle>
                  <DialogDescription>
                    Removes every module from the board. The modules
                    themselves stay connected.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <DialogClose as-child>
                    <Button variant="ghost">Cancel</Button>
                  </DialogClose>
                  <Button
                    variant="destructive"
                    :disabled="resetting"
                    @click="resetBoard"
                  >
                    <Loader2 v-if="resetting" class="animate-spin" />
                    <Trash2 v-else />
                    Clear
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>
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
                  draggable="true"
                  :title="`(${x - 1}, ${y - 1}) · ${moduleAt(x - 1, y - 1)!.uuid} — drag to move or swap`"
                  class="relative flex cursor-grab flex-col items-center justify-between gap-1 rounded-sm border border-border bg-muted/40 p-1.5 transition-colors hover:border-primary hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
                  :class="[
                    moduleAt(x - 1, y - 1)?.info &&
                    !moduleAt(x - 1, y - 1)?.info?.calibrated
                      ? 'border-amber-500/60'
                      : '',
                    dragOver && dragOver.x === x - 1 && dragOver.y === y - 1
                      ? 'ring-2 ring-primary'
                      : '',
                    dragSource && dragSource.x === x - 1 && dragSource.y === y - 1
                      ? 'opacity-50'
                      : '',
                  ]"
                  @click="openCalibration(moduleAt(x - 1, y - 1)!.uuid)"
                  @dragstart="onDragStart($event, x - 1, y - 1)"
                  @dragend="onDragEnd"
                  @dragover="onDragOver($event, x - 1, y - 1)"
                  @dragleave="onDragLeave(x - 1, y - 1)"
                  @drop="onDrop($event, x - 1, y - 1)"
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
                  <Loader2
                    v-if="motionFor(moduleAt(x - 1, y - 1)?.status?.state)?.spinning"
                    class="absolute right-0.5 top-0.5 size-2.5 animate-spin text-primary"
                  />
                  <Check
                    v-else-if="moduleAt(x - 1, y - 1)?.info?.calibrated"
                    class="absolute right-0.5 top-0.5 size-2.5 text-emerald-500"
                  />
                  <AlertTriangle
                    v-else-if="
                      moduleAt(x - 1, y - 1)?.info &&
                      !moduleAt(x - 1, y - 1)?.info?.calibrated
                    "
                    class="absolute right-0.5 top-0.5 size-2.5 text-amber-500"
                  />
                </button>
                <button
                  v-else
                  type="button"
                  :title="`(${x - 1}, ${y - 1})`"
                  class="rounded-sm border border-dashed border-border/50 text-xs text-muted-foreground/60 transition-colors hover:border-primary hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  :class="
                    dragOver && dragOver.x === x - 1 && dragOver.y === y - 1
                      ? 'border-primary bg-primary/15 text-primary'
                      : ''
                  "
                  @click="openPicker(x - 1, y - 1)"
                  @dragover="onDragOver($event, x - 1, y - 1)"
                  @dragleave="onDragLeave(x - 1, y - 1)"
                  @drop="onDrop($event, x - 1, y - 1)"
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
      <CardFooter
        v-if="gridSize.width && gridSize.height"
        class="flex flex-wrap items-center justify-between gap-2"
      >
        <span class="text-xs text-muted-foreground">
          {{ unmapped.length }} unplaced
          module{{ unmapped.length === 1 ? '' : 's' }}
        </span>
        <div class="flex gap-2">
          <Button
            v-if="wave.size"
            variant="ghost"
            size="sm"
            @click="clearWave"
          >
            Clear letters
          </Button>
          <Button
            size="sm"
            :disabled="!unmapped.length || waveRunning"
            @click="runIdentify"
          >
            <Loader2 v-if="waveRunning" class="animate-spin" />
            <Eye v-else />
            Identify unplaced
          </Button>
        </div>
      </CardFooter>
    </Card>

    <!-- Modules list -->
    <Card>
      <CardHeader>
        <CardTitle>
          {{ sortedModules.length }} module{{ sortedModules.length === 1 ? '' : 's' }}
        </CardTitle>
      </CardHeader>
      <CardContent class="px-0">
        <div
          v-if="sortedModules.length"
          class="max-h-[28rem] overflow-y-auto"
        >
          <table class="w-full text-sm">
            <thead
              class="sticky top-0 z-10 border-b border-border bg-card text-xs text-muted-foreground"
            >
              <tr class="[&>th]:px-4 [&>th]:py-2 [&>th]:text-left">
                <th class="w-10"></th>
                <th class="num w-16">ID</th>
                <th>Module</th>
                <th>Position</th>
                <th>Firmware</th>
                <th>Status</th>
                <th class="w-32 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="m in sortedModules"
                :key="m.uuid"
                class="border-b border-border last:border-b-0 hover:bg-muted/40 [&>td]:px-4 [&>td]:py-2.5"
              >
                <td>
                  <span
                    class="status-dot"
                    :class="m.alive ? 'text-emerald-500' : 'text-amber-500'"
                    :title="m.alive ? 'Online' : 'Offline'"
                  />
                </td>
                <td class="num text-muted-foreground">{{ m.short_id }}</td>
                <td>
                  <span class="num text-xs">{{ m.uuid }}</span>
                </td>
                <td>
                  <span v-if="m.grid" class="num text-xs text-muted-foreground">
                    ({{ m.grid.x }}, {{ m.grid.y }})
                  </span>
                  <span v-else class="text-xs text-muted-foreground">Unplaced</span>
                </td>
                <td>
                  <span v-if="m.info?.fw" class="num">{{ m.info.fw }}</span>
                  <span v-else class="text-xs text-muted-foreground">—</span>
                </td>
                <td>
                  <Badge
                    v-if="motionFor(m.status?.state)"
                    :variant="motionFor(m.status?.state)!.tone"
                    class="gap-1"
                  >
                    <Loader2
                      v-if="motionFor(m.status?.state)!.spinning"
                      class="size-3 animate-spin"
                    />
                    <AlertTriangle
                      v-else
                      class="size-3"
                    />
                    {{ motionFor(m.status?.state)!.label }}
                  </Badge>
                  <Badge
                    v-else-if="deviceEntry(m.uuid)?.came_back"
                    variant="success"
                    class="gap-1"
                  >
                    <Check class="size-3" />
                    Updated
                  </Badge>
                  <Badge
                    v-else-if="m.info?.calibrated"
                    variant="success"
                    class="gap-1"
                  >
                    <Check class="size-3" />
                    Ready
                  </Badge>
                  <Badge
                    v-else-if="m.info"
                    variant="warn"
                    class="gap-1"
                  >
                    <AlertTriangle class="size-3" />
                    Calibrate
                  </Badge>
                  <span v-else class="text-xs text-muted-foreground">—</span>
                </td>
                <td>
                  <div class="flex justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      @click="openCalibration(m.uuid)"
                    >
                      Calibrate
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Advanced"
                      title="Advanced"
                      @click="openAdvanced(m.uuid)"
                    >
                      <MoreHorizontal />
                    </Button>
                    <Button
                      v-if="m.grid"
                      variant="ghost"
                      size="icon"
                      aria-label="Remove from board"
                      title="Remove from board"
                      @click="removeAt(m.grid.x, m.grid.y)"
                    >
                      <Trash2 />
                    </Button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div
          v-else
          class="px-6 py-10 text-center text-sm text-muted-foreground"
        >
          No modules connected.
        </div>
      </CardContent>
    </Card>

    <!-- Active update card (only while running) -->
    <Card v-if="showSessionCard && bootloader.status.value">
      <CardHeader>
        <div class="flex items-start justify-between gap-4">
          <div class="flex flex-col gap-1">
            <CardTitle>
              {{ STATE_LABEL[bootloader.status.value.state] }}
            </CardTitle>
            <CardDescription>
              Don't power off the display until this finishes.
            </CardDescription>
          </div>
          <Badge :variant="STATE_VARIANT[bootloader.status.value.state]">
            {{ STATE_LABEL[bootloader.status.value.state] }}
          </Badge>
        </div>
      </CardHeader>
      <CardContent class="flex flex-col gap-4">
        <div
          v-if="bootloader.status.value.image_blocks > 0"
          class="flex flex-col gap-2"
        >
          <div class="flex items-baseline justify-between text-xs text-muted-foreground">
            <span>{{ bootloader.status.value.message || 'Working…' }}</span>
            <span class="num">{{ progressPct }}%</span>
          </div>
          <div class="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              class="h-full bg-primary transition-[width] duration-200"
              :style="{ width: `${progressPct}%` }"
            />
          </div>
        </div>

        <dl
          v-if="bootloader.status.value.fw"
          class="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3"
        >
          <div class="flex flex-col gap-0.5">
            <dt class="text-xs text-muted-foreground">New version</dt>
            <dd class="num">{{ bootloader.status.value.fw }}</dd>
          </div>
          <div class="flex flex-col gap-0.5">
            <dt class="text-xs text-muted-foreground">File size</dt>
            <dd class="num">{{ fmtSize(bootloader.status.value.image_size) }}</dd>
          </div>
          <div class="flex flex-col gap-0.5">
            <dt class="text-xs text-muted-foreground">Modules updated</dt>
            <dd class="num">
              {{ bootloader.status.value.post_ota_back }} /
              {{ bootloader.status.value.pre_ota_assigned }}
            </dd>
          </div>
        </dl>
      </CardContent>
      <CardFooter class="justify-end">
        <Button
          variant="destructive"
          size="sm"
          :disabled="aborting"
          @click="runAbort"
        >
          <Loader2 v-if="aborting" class="animate-spin" />
          <Octagon v-else />
          Cancel update
        </Button>
      </CardFooter>
    </Card>

    <!-- Failure summary -->
    <Card
      v-else-if="
        bootloader.status.value?.state === 'failed' &&
        bootloader.status.value.fail_reason !== 'none'
      "
      class="border-destructive/40"
    >
      <CardHeader>
        <CardTitle>Update failed</CardTitle>
        <CardDescription>
          {{ FAIL_LABEL[bootloader.status.value.fail_reason] }}
          You can try again with the same file.
        </CardDescription>
      </CardHeader>
    </Card>

    <!-- Update card -->
    <Card>
      <CardHeader>
        <CardTitle>Update firmware</CardTitle>
        <CardDescription>
          Updates every module at once. The display goes dark for about 30
          seconds.
        </CardDescription>
      </CardHeader>
      <CardContent class="flex flex-col gap-4">
        <input
          ref="fileInput"
          type="file"
          accept=".bin,application/octet-stream"
          class="hidden"
          @change="onFileChange"
        />
        <div
          class="flex flex-col items-stretch gap-3 rounded-md border border-dashed border-border bg-muted/30 p-4 sm:flex-row sm:items-center"
        >
          <div class="flex min-w-0 flex-1 items-center gap-3">
            <span
              class="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary"
            >
              <FileUp class="size-5" />
            </span>
            <div class="flex min-w-0 flex-col">
              <span class="truncate text-sm font-medium">
                {{ file?.name ?? 'No file selected' }}
              </span>
              <span class="text-xs text-muted-foreground">
                {{ file ? fmtSize(file.size) : 'Pick a .bin firmware file' }}
              </span>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <Button
              v-if="file"
              variant="ghost"
              size="sm"
              :disabled="uploading || bootloader.isActive.value"
              @click="clearFile"
            >
              Clear
            </Button>
            <Button
              variant="outline"
              size="sm"
              :disabled="uploading || bootloader.isActive.value"
              @click="pickFile"
            >
              <Upload />
              Choose file
            </Button>
          </div>
        </div>

        <details class="group rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-sm">
          <summary
            class="cursor-pointer list-none text-xs text-muted-foreground hover:text-foreground"
          >
            Advanced options
          </summary>
          <div class="mt-3 flex flex-col gap-3">
            <div class="flex flex-col gap-1">
              <div class="flex items-center gap-2">
                <Switch id="assume_bl" v-model="assumeInBl" />
                <Label for="assume_bl" class="cursor-pointer">
                  Skip wake-up step
                </Label>
              </div>
              <p class="ml-10 text-xs text-muted-foreground">
                Use this if a module is stuck without firmware. Otherwise
                leave it off.
              </p>
            </div>
            <div class="flex flex-col gap-1">
              <div class="flex items-center gap-2">
                <Switch id="emergency" v-model="emergency" />
                <Label for="emergency" class="cursor-pointer">
                  Emergency mode (slow, blind)
                </Label>
              </div>
              <p class="ml-10 text-xs text-muted-foreground">
                Each block is sent three times without waiting for replies,
                with extra pacing between frames. Much slower, but works
                when normal updates fail because some modules don't ACK.
                Use as a last resort.
              </p>
            </div>
            <div class="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                :disabled="probing || bootloader.isActive.value"
                @click="runProbe"
              >
                <Loader2 v-if="probing" class="animate-spin" />
                <Radar v-else />
                Check for ready modules
              </Button>
              <Button
                variant="outline"
                size="sm"
                :disabled="entering || bootloader.isActive.value"
                @click="runEnter"
              >
                <Loader2 v-if="entering" class="animate-spin" />
                <Zap v-else />
                Put modules in update mode
              </Button>
            </div>
          </div>
        </details>
      </CardContent>
      <CardFooter class="justify-end">
        <Dialog v-model:open="confirmFlashOpen">
          <Button
            :disabled="!file || uploading || bootloader.isActive.value"
            @click="confirmFlashOpen = true"
          >
            <Loader2 v-if="uploading" class="animate-spin" />
            <Rocket v-else />
            Update all modules
          </Button>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Update every connected module?</DialogTitle>
              <DialogDescription>
                The display will go dark for about 30 seconds. Any module that
                doesn't respond keeps its current firmware — just run the
                update again to catch them.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose as-child>
                <Button variant="ghost">Cancel</Button>
              </DialogClose>
              <Button :disabled="uploading" @click="startFlash">
                <Loader2 v-if="uploading" class="animate-spin" />
                <Rocket v-else />
                Update now
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardFooter>
    </Card>

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
            Pick the module that's at this position on the wall.
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
              v-if="c.flap?.color"
              class="inline-flex size-10 shrink-0 items-center justify-center rounded-sm border border-border"
              :style="{ background: c.flap.color }"
              :title="c.flap.label"
            />
            <span
              v-else-if="c.flap?.glyph"
              class="inline-flex size-10 shrink-0 items-center justify-center rounded-sm bg-primary font-mono text-base font-bold text-primary-foreground"
              :title="c.flap.label"
            >
              {{ c.flap.glyph }}
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
                ID {{ c.shortId }} · {{ c.alive ? 'Online' : 'Offline' }}
              </span>
            </div>
          </button>
          <div
            v-if="!pickerCandidates.length"
            class="px-3 py-8 text-center text-sm text-muted-foreground"
          >
            No unplaced modules.
          </div>
        </div>
        <DialogFooter class="justify-between sm:justify-between">
          <Button
            v-if="unmapped.length"
            variant="outline"
            size="sm"
            :disabled="waveRunning"
            @click="runIdentify"
          >
            <Loader2 v-if="waveRunning" class="animate-spin" />
            <Eye v-else />
            Identify
          </Button>
          <DialogClose as-child>
            <Button variant="ghost">Cancel</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <CalibrationModal
      v-model:open="calibrationOpen"
      :uuid="calibrationUuid"
    />

    <ModuleAdvancedModal
      v-model:open="advancedOpen"
      :uuid="advancedUuid"
    />

    <BusActionsModal v-model:open="busActionsOpen" />

    <!-- Recovery confirm -->
    <Dialog v-model:open="recoveryConfirmOpen">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {{
              pendingRecovery === 'home_all'
                ? 'Home every module?'
                : 'Emergency stop every module?'
            }}
          </DialogTitle>
          <DialogDescription>
            <template v-if="pendingRecovery === 'home_all'">
              Sends a home command to every connected module. Useful if
              modules look stuck or out of sync.
            </template>
            <template v-else>
              Halts all motion immediately. The display will be wrong until
              you push another frame or home everything.
            </template>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose as-child>
            <Button variant="ghost">Cancel</Button>
          </DialogClose>
          <Button
            :variant="pendingRecovery === 'emergency_stop' ? 'destructive' : 'default'"
            @click="runRecovery"
          >
            {{ pendingRecovery === 'home_all' ? 'Home all' : 'Stop all' }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
