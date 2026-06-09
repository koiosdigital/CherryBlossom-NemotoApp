<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useRoute, useRouter, onBeforeRouteLeave, type RouteLocationRaw } from 'vue-router'
import {
  Button,
  Input,
  Label,
  Switch,
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
  Eraser,
  Loader2,
  Move,
  Paintbrush,
  Save,
  Type,
} from 'lucide-vue-next'
import DisplayCell from '@/components/DisplayCell.vue'
import { apiClient } from '@/api'
import { useGrid } from '@/composables/useGrid'
import { useFlaps } from '@/composables/useFlaps'
import { useDisplay } from '@/composables/useDisplay'
import { useDisplaySettings } from '@/composables/useDisplaySettings'
import { useToast } from '@/composables/useToast'
import { friendlyError } from '@/lib/errors'

const route = useRoute()
const router = useRouter()
const gridState = useGrid()
const flaps = useFlaps()
const display = useDisplay()
const displaySettings = useDisplaySettings()
const { toast } = useToast()

// ---------- per-frame effect override (display mode only) ----------
const overrideEnabled = ref(false)
const overrideEffect = ref<string>('')
const overrideDelay = ref<number>(0)

// ---------- context ----------
type Kind = 'display' | 'new-preset' | 'edit-preset'
const kind = ref<Kind>('display')
const editId = ref<number | null>(null)
const presetName = ref('')

// ---------- canvas ----------
const width = ref(0)
const height = ref(0)
const cells = ref<number[][]>([])
const dirty = ref(false)
const ready = ref(false)

// ---------- editing state ----------
type Mode = 'type' | 'paint' | 'erase' | 'move'
const mode = ref<Mode>('type')
const brush = ref<number | null>(null)
const cursor = ref({ x: 0, y: 0 })
const painting = ref(false)

// ---------- move-preset mode ----------
// Set when an edit-preset is loaded whose dimensions don't match the current
// grid. We blow the preset up to grid size and let the user position it.
// `cells.value` is grid-sized at all times — `presetSource` keeps the original
// so movement re-renders fresh (cropped) content rather than scrolling stale.
const presetSource = ref<{ w: number; h: number; flaps: number[][] } | null>(null)
const offset = ref({ x: 0, y: 0 })
const dragOrigin = ref<{ cellX: number; cellY: number; offsetX: number; offsetY: number } | null>(null)

// ---------- derived ----------
const blankId = computed(
  () => flaps.flaps.value.find((f) => f.type === 'blank')?.id ?? 0
)

const paletteGroups = computed(() => ({
  letters: flaps.flaps.value.filter((f) => f.type === 'letter'),
  digits: flaps.flaps.value.filter((f) => f.type === 'digit'),
  specials: flaps.flaps.value.filter((f) => f.type === 'special'),
  colors: flaps.flaps.value.filter((f) => f.type === 'color'),
}))

const title = computed(() => {
  if (kind.value === 'display') return 'Editing live display'
  if (kind.value === 'new-preset') return 'New preset'
  return presetName.value ? `Editing ${presetName.value}` : 'Editing preset'
})

const saveLabel = computed(() => {
  if (kind.value === 'display') return 'Push to display'
  if (kind.value === 'new-preset') return 'Save preset'
  return 'Save changes'
})

// ---------- load ----------
function buildBlank(w: number, h: number) {
  const bl = blankId.value
  return Array.from({ length: h }, () =>
    Array.from({ length: w }, () => bl)
  )
}

function loadFromFrame() {
  const g = gridState.grid.value?.grid
  if (!g) return
  width.value = g.width
  height.value = g.height
  const frame = display.lastFrame.value
  if (frame?.valid && frame.flaps) {
    const bl = blankId.value
    cells.value = frame.flaps.map((row) =>
      row.map((v) => (v < 0 ? bl : v))
    )
  } else {
    cells.value = buildBlank(g.width, g.height)
  }
}

async function loadPreset(id: number) {
  const { data, error: err } = await apiClient.GET('/api/presets/{id}', {
    params: { path: { id } },
  })
  if (err || !data) {
    toast({ title: "Couldn't load preset", variant: 'destructive' })
    router.push('/presets')
    return
  }
  presetName.value = data.name
  await ensureGridLoaded()
  const g = gridState.grid.value?.grid
  if (g && (data.width !== g.width || data.height !== g.height)) {
    // Dimensions don't match the grid — drop into move mode. Canvas becomes
    // grid-sized, the preset gets centered, and the user can drag it around.
    // Save flushes whatever is currently overlaid on the canvas.
    width.value = g.width
    height.value = g.height
    presetSource.value = {
      w: data.width,
      h: data.height,
      flaps: data.flaps.map((r) => [...r]),
    }
    offset.value = {
      x: Math.floor((g.width - data.width) / 2),
      y: Math.floor((g.height - data.height) / 2),
    }
    rebuildFromPreset()
    mode.value = 'move'
    // The on-disk preset won't fit the grid — saving the current overlay
    // resizes it. Treat as dirty so the user can save immediately.
    dirty.value = true
    toast({
      title: 'Preset resized',
      description: `Was ${data.width}×${data.height}, grid is ${g.width}×${g.height}. Drag into position and save.`,
      variant: 'warn',
      duration: 6000,
    })
  } else {
    width.value = data.width
    height.value = data.height
    cells.value = data.flaps.map((r) => [...r])
  }
}

// ---------- move-mode helpers ----------
function rebuildFromPreset() {
  if (!presetSource.value) return
  const next = buildBlank(width.value, height.value)
  const { w: pw, h: ph, flaps: pf } = presetSource.value
  const { x: ox, y: oy } = offset.value
  for (let py = 0; py < ph; py++) {
    for (let px = 0; px < pw; px++) {
      const gx = px + ox
      const gy = py + oy
      if (gx < 0 || gy < 0 || gx >= width.value || gy >= height.value) continue
      next[gy][gx] = pf[py][px]
    }
  }
  cells.value = next
}

function clampedOffset(x: number, y: number) {
  if (!presetSource.value) return { x, y }
  // Allow the preset to slide partially off the grid in either direction so
  // the user can deliberately crop edges — but require at least one cell to
  // remain on-grid so the preview doesn't vanish.
  const minX = -(presetSource.value.w - 1)
  const maxX = width.value - 1
  const minY = -(presetSource.value.h - 1)
  const maxY = height.value - 1
  return {
    x: Math.max(minX, Math.min(maxX, x)),
    y: Math.max(minY, Math.min(maxY, y)),
  }
}

function moveBy(dx: number, dy: number) {
  if (!presetSource.value) return
  const next = clampedOffset(offset.value.x + dx, offset.value.y + dy)
  if (next.x === offset.value.x && next.y === offset.value.y) return
  offset.value = next
  rebuildFromPreset()
  dirty.value = true
}

function centerPreset() {
  if (!presetSource.value) return
  offset.value = {
    x: Math.floor((width.value - presetSource.value.w) / 2),
    y: Math.floor((height.value - presetSource.value.h) / 2),
  }
  rebuildFromPreset()
  dirty.value = true
}

function isInsidePreset(x: number, y: number) {
  if (!presetSource.value) return false
  const px = x - offset.value.x
  const py = y - offset.value.y
  return (
    px >= 0 &&
    py >= 0 &&
    px < presetSource.value.w &&
    py < presetSource.value.h
  )
}

async function ensureFlapsLoaded() {
  if (!flaps.flaps.value.length) await flaps.refresh()
}

async function ensureGridLoaded() {
  if (!gridState.grid.value) await gridState.refresh()
}

async function init() {
  await ensureFlapsLoaded()
  const q = route.query
  const ctx = String(q.context ?? 'display')
  if (ctx === 'edit-preset') {
    const id = Number(q.id)
    if (!id) {
      router.push('/presets')
      return
    }
    kind.value = 'edit-preset'
    editId.value = id
    await loadPreset(id)
  } else if (ctx === 'new-preset') {
    kind.value = 'new-preset'
    await ensureGridLoaded()
    const g = gridState.grid.value?.grid
    if (g) {
      width.value = g.width
      height.value = g.height
      cells.value = buildBlank(g.width, g.height)
    }
  } else {
    kind.value = 'display'
    await ensureGridLoaded()
    loadFromFrame()
  }
  cursor.value = { x: 0, y: 0 }
  dirty.value = false
  ready.value = true
}

// ---------- edit helpers ----------
function setCell(x: number, y: number, flapId: number) {
  if (y < 0 || y >= height.value || x < 0 || x >= width.value) return
  if (!cells.value[y]) return
  if (cells.value[y][x] === flapId) return
  cells.value[y][x] = flapId
  dirty.value = true
}

function applyBrushAt(x: number, y: number) {
  if (mode.value === 'paint') {
    if (brush.value == null) return
    setCell(x, y, brush.value)
  } else if (mode.value === 'erase') {
    setCell(x, y, blankId.value)
  }
}

function onCellPointerDown(x: number, y: number, e: PointerEvent) {
  if (mode.value === 'move') {
    if (!presetSource.value) return
    dragOrigin.value = {
      cellX: x,
      cellY: y,
      offsetX: offset.value.x,
      offsetY: offset.value.y,
    }
    painting.value = true
    e.preventDefault()
    return
  }
  if (mode.value === 'type') {
    cursor.value = { x, y }
    return
  }
  painting.value = true
  applyBrushAt(x, y)
  e.preventDefault()
}

function onCellPointerEnter(x: number, y: number) {
  if (!painting.value) return
  if (mode.value === 'move') {
    const o = dragOrigin.value
    if (!o) return
    const next = clampedOffset(
      o.offsetX + (x - o.cellX),
      o.offsetY + (y - o.cellY)
    )
    if (next.x !== offset.value.x || next.y !== offset.value.y) {
      offset.value = next
      rebuildFromPreset()
      dirty.value = true
    }
    return
  }
  applyBrushAt(x, y)
}

function onPointerUp() {
  painting.value = false
  dragOrigin.value = null
}

function pickBrush(id: number) {
  brush.value = id
  if (mode.value === 'erase') mode.value = 'paint'
  if (mode.value === 'type') mode.value = 'paint'
}

// ---------- keyboard ----------
function isEditableTarget(e: Event) {
  const t = e.target as HTMLElement | null
  if (!t) return false
  const tag = t.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || t.isContentEditable
}

function onKeyDown(e: KeyboardEvent) {
  if (isEditableTarget(e)) return
  if (nameDialogOpen.value || pendingNav.value) return

  // Mode hotkeys work anywhere
  if (e.key === '1') {
    mode.value = 'type'
    return
  }
  if (e.key === '2') {
    mode.value = 'paint'
    return
  }
  if (e.key === '3') {
    mode.value = 'erase'
    return
  }
  if (e.key === '4' && presetSource.value) {
    mode.value = 'move'
    return
  }

  if (mode.value === 'move') {
    if (e.key === 'ArrowLeft') { moveBy(-1, 0); e.preventDefault(); return }
    if (e.key === 'ArrowRight') { moveBy(1, 0); e.preventDefault(); return }
    if (e.key === 'ArrowUp') { moveBy(0, -1); e.preventDefault(); return }
    if (e.key === 'ArrowDown') { moveBy(0, 1); e.preventDefault(); return }
    return
  }

  if (mode.value !== 'type') return
  const { x, y } = cursor.value

  if (e.key === 'ArrowLeft') {
    cursor.value = { x: Math.max(0, x - 1), y }
    e.preventDefault()
  } else if (e.key === 'ArrowRight') {
    cursor.value = { x: Math.min(width.value - 1, x + 1), y }
    e.preventDefault()
  } else if (e.key === 'ArrowUp') {
    cursor.value = { x, y: Math.max(0, y - 1) }
    e.preventDefault()
  } else if (e.key === 'ArrowDown') {
    cursor.value = { x, y: Math.min(height.value - 1, y + 1) }
    e.preventDefault()
  } else if (e.key === 'Enter') {
    cursor.value = { x: 0, y: Math.min(height.value - 1, y + 1) }
    e.preventDefault()
  } else if (e.key === 'Backspace') {
    const nx = Math.max(0, x - 1)
    setCell(nx, y, blankId.value)
    cursor.value = { x: nx, y }
    e.preventDefault()
  } else if (e.key === 'Delete') {
    setCell(x, y, blankId.value)
    e.preventDefault()
  } else if (e.key === ' ') {
    setCell(x, y, blankId.value)
    if (x < width.value - 1) cursor.value = { x: x + 1, y }
    e.preventDefault()
  } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
    const upper = e.key.toUpperCase()
    const id =
      flaps.byGlyph.value.get(upper) ?? flaps.byGlyph.value.get(e.key)
    if (id != null) {
      setCell(x, y, id)
      if (x < width.value - 1) cursor.value = { x: x + 1, y }
    }
    e.preventDefault()
  }
}

// ---------- save ----------
const saving = ref(false)
const nameDialogOpen = ref(false)
const nameDraft = ref('')

async function save() {
  if (kind.value === 'new-preset' && !presetName.value.trim()) {
    nameDraft.value = ''
    nameDialogOpen.value = true
    return
  }
  saving.value = true
  try {
    if (kind.value === 'display') {
      const body: {
        flaps: number[][]
        effect?: string
        delay?: number
      } = { flaps: cells.value }
      if (overrideEnabled.value) {
        if (overrideEffect.value) body.effect = overrideEffect.value
        if (overrideDelay.value > 0) body.delay = overrideDelay.value
      }
      const { error: err } = await apiClient.POST('/api/display', { body })
      if (err) throw err
      toast({ title: 'Display updated', variant: 'success' })
      dirty.value = false
    } else if (kind.value === 'new-preset') {
      const { error: err } = await apiClient.POST('/api/presets', {
        body: { name: presetName.value.trim(), flaps: cells.value },
      })
      if (err) throw err
      toast({ title: 'Preset saved', variant: 'success' })
      dirty.value = false
      router.push('/presets')
      return
    } else if (kind.value === 'edit-preset' && editId.value != null) {
      const { error: err } = await apiClient.PUT('/api/presets/{id}', {
        params: { path: { id: editId.value } },
        body: { name: presetName.value.trim(), flaps: cells.value },
      })
      if (err) throw err
      toast({ title: 'Preset updated', variant: 'success' })
      dirty.value = false
    }
  } catch (e) {
    toast({
      title: "Couldn't save",
      description: friendlyError(e),
      variant: 'destructive',
    })
  } finally {
    saving.value = false
  }
}

function confirmNewName() {
  const v = nameDraft.value.trim()
  if (!v) return
  presetName.value = v
  nameDialogOpen.value = false
  save()
}

// ---------- unsaved-changes guard ----------
const pendingNav = ref<RouteLocationRaw | null>(null)

onBeforeRouteLeave((to) => {
  if (!dirty.value) return true
  pendingNav.value = to.fullPath
  return false
})

function discardAndLeave() {
  dirty.value = false
  const nav = pendingNav.value
  pendingNav.value = null
  if (nav) router.push(nav)
}

// ---------- mount / unmount ----------
onMounted(() => {
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('pointerup', onPointerUp)
  init()
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeyDown)
  window.removeEventListener('pointerup', onPointerUp)
})
</script>

<template>
  <div class="flex flex-col gap-4">
    <!-- Header -->
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div class="flex items-center gap-3">
        <Button variant="ghost" size="sm" @click="router.back()">
          <ChevronLeft />
          Back
        </Button>
        <div class="flex flex-col">
          <h1 class="display-face text-xl font-semibold tracking-tight">
            {{ title }}
          </h1>
        </div>
      </div>
      <Button :disabled="!dirty || saving || !ready" @click="save">
        <Loader2 v-if="saving" class="animate-spin" />
        <Save v-else />
        {{ saveLabel }}
      </Button>
    </div>

    <!-- Per-frame effect override (display mode only) -->
    <details
      v-if="kind === 'display'"
      class="rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-sm"
    >
      <summary
        class="cursor-pointer list-none text-xs text-muted-foreground hover:text-foreground"
      >
        Effect override (uses default effect if off)
      </summary>
      <div class="mt-3 flex flex-col gap-3">
        <div class="flex items-center gap-2">
          <Switch id="override_on" v-model="overrideEnabled" />
          <Label for="override_on" class="cursor-pointer">
            Override for this push
          </Label>
        </div>
        <div
          v-if="overrideEnabled"
          class="flex flex-col gap-3 sm:flex-row sm:items-end"
        >
          <div class="flex flex-col gap-1.5">
            <Label for="override_effect">Effect</Label>
            <select
              id="override_effect"
              v-model="overrideEffect"
              class="h-9 w-48 rounded-md border border-border bg-card px-3 text-sm"
            >
              <option value="">Default</option>
              <option
                v-for="ef in displaySettings.effects.value"
                :key="ef.id"
                :value="ef.id"
              >
                {{ ef.name }}
              </option>
            </select>
          </div>
          <div class="flex flex-col gap-1.5">
            <Label for="override_delay">Delay (ms, 0 = default)</Label>
            <Input
              id="override_delay"
              type="number"
              :min="0"
              :max="500"
              v-model.number="overrideDelay"
              class="w-32"
            />
          </div>
        </div>
      </div>
    </details>

    <!-- Mismatch banner: shown when the loaded preset doesn't fit the grid -->
    <div
      v-if="presetSource"
      class="flex flex-wrap items-center gap-3 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs"
    >
      <span class="font-medium text-amber-700 dark:text-amber-300">
        Resized to fit the grid
      </span>
      <span class="text-muted-foreground">
        Was {{ presetSource.w }} × {{ presetSource.h }}, grid is {{ width }} × {{ height }}.
        Drag the preset into position — anything outside the edges is cropped on save.
      </span>
      <Button
        size="sm"
        variant="ghost"
        class="ml-auto"
        @click="centerPreset"
      >
        Center
      </Button>
    </div>

    <!-- Mode toggle -->
    <div class="flex items-center gap-2">
      <div
        class="inline-flex rounded-md border border-border bg-card p-0.5"
        role="group"
      >
        <button
          v-for="m in (presetSource
            ? (['move', 'type', 'paint', 'erase'] as const)
            : (['type', 'paint', 'erase'] as const))"
          :key="m"
          type="button"
          class="inline-flex items-center gap-1.5 rounded-sm px-2.5 py-1 text-xs capitalize transition-colors"
          :class="
            mode === m
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:text-foreground'
          "
          @click="mode = m"
        >
          <Move v-if="m === 'move'" class="size-3.5" />
          <Type v-if="m === 'type'" class="size-3.5" />
          <Paintbrush v-if="m === 'paint'" class="size-3.5" />
          <Eraser v-if="m === 'erase'" class="size-3.5" />
          {{ m }}
        </button>
      </div>
      <span class="hidden text-xs text-muted-foreground sm:inline">
        Press {{ presetSource ? '1/2/3/4' : '1/2/3' }} to switch modes
      </span>
      <span
        v-if="mode === 'move' && presetSource"
        class="num ml-auto text-xs text-muted-foreground"
      >
        offset ({{ offset.x }}, {{ offset.y }})
      </span>
    </div>

    <!-- Palette -->
    <div
      class="flex flex-col gap-2 rounded-md border border-border bg-card p-3"
    >
      <div class="flex flex-wrap gap-1">
        <button
          v-for="f in [
            ...paletteGroups.letters,
            ...paletteGroups.digits,
            ...paletteGroups.specials,
          ]"
          :key="f.id"
          type="button"
          class="inline-flex size-8 items-center justify-center rounded-sm border font-mono text-sm transition-colors"
          :class="
            brush === f.id
              ? 'border-primary bg-primary text-primary-foreground'
              : 'border-border bg-muted/40 hover:bg-muted'
          "
          :title="f.label"
          @click="pickBrush(f.id)"
        >
          {{ f.glyph }}
        </button>
      </div>
      <Separator v-if="paletteGroups.colors.length" />
      <div v-if="paletteGroups.colors.length" class="flex flex-wrap gap-1">
        <button
          v-for="f in paletteGroups.colors"
          :key="f.id"
          type="button"
          class="size-8 rounded-sm border-2 transition-all"
          :class="
            brush === f.id
              ? 'border-primary scale-110'
              : 'border-transparent hover:border-border'
          "
          :style="{ backgroundColor: f.color ?? '#000' }"
          :title="f.label"
          @click="pickBrush(f.id)"
        />
      </div>
    </div>

    <!-- Canvas -->
    <div
      class="-mx-6 overflow-x-auto bg-muted p-4 shadow-[inset_0_2px_14px_rgba(0,0,0,0.08)] sm:mx-0 sm:rounded-lg sm:p-6 sm:ring-1 sm:ring-border dark:bg-[#0a0807] dark:shadow-[inset_0_2px_14px_rgba(0,0,0,0.9)] sm:dark:ring-white/5"
    >
      <div
        v-if="ready && width && height"
        class="mx-auto grid w-max gap-1"
        :style="{
          gridTemplateColumns: `repeat(${width}, 44px)`,
          gridTemplateRows: `repeat(${height}, 64px)`,
        }"
      >
        <template v-for="y in height" :key="y">
          <div
            v-for="x in width"
            :key="`${x}-${y}`"
            class="relative select-none touch-none"
            :class="
              mode === 'move'
                ? painting
                  ? 'cursor-grabbing'
                  : 'cursor-grab'
                : 'cursor-pointer'
            "
            @pointerdown="onCellPointerDown(x - 1, y - 1, $event)"
            @pointerenter="onCellPointerEnter(x - 1, y - 1)"
          >
            <DisplayCell :flap-index="cells[y - 1]?.[x - 1] ?? null" />
            <div
              v-if="
                mode === 'type' &&
                cursor.x === x - 1 &&
                cursor.y === y - 1
              "
              class="pointer-events-none absolute inset-0 rounded-[4px] ring-2 ring-primary ring-inset"
            />
            <!-- Move-mode overlay: ring around the preset's footprint, dim
                 mask over anything outside it. -->
            <div
              v-else-if="mode === 'move' && isInsidePreset(x - 1, y - 1)"
              class="pointer-events-none absolute inset-0 rounded-[4px] ring-2 ring-primary/70 ring-inset"
            />
            <div
              v-else-if="mode === 'move'"
              class="pointer-events-none absolute inset-0 rounded-[4px] bg-black/30"
            />
          </div>
        </template>
      </div>
      <p
        v-else-if="ready"
        class="py-10 text-center text-sm text-muted-foreground dark:text-white/50"
      >
        Set a grid size in Settings before editing.
      </p>
      <div v-else class="flex justify-center py-10">
        <Loader2
          class="size-4 animate-spin text-muted-foreground dark:text-white/50"
        />
      </div>
    </div>

    <!-- Name dialog (new preset) -->
    <Dialog v-model:open="nameDialogOpen">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Name this preset</DialogTitle>
          <DialogDescription>
            Shown in the presets list and the dashboard's preset label.
          </DialogDescription>
        </DialogHeader>
        <div class="flex flex-col gap-1.5">
          <Label for="preset-name">Name</Label>
          <Input
            id="preset-name"
            v-model="nameDraft"
            placeholder="Arrivals"
            @keydown.enter="confirmNewName"
          />
        </div>
        <DialogFooter>
          <DialogClose as-child>
            <Button variant="ghost">Cancel</Button>
          </DialogClose>
          <Button :disabled="!nameDraft.trim()" @click="confirmNewName">
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- Unsaved-changes guard -->
    <Dialog
      :open="pendingNav !== null"
      @update:open="(v) => !v && (pendingNav = null)"
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Discard changes?</DialogTitle>
          <DialogDescription>
            You have unsaved edits. Leaving now will throw them away.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" @click="pendingNav = null">
            Keep editing
          </Button>
          <Button variant="destructive" @click="discardAndLeave">
            Discard
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
