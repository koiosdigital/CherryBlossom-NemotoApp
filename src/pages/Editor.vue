<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useRoute, useRouter, onBeforeRouteLeave, type RouteLocationRaw } from 'vue-router'
import {
  Button,
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
  Eraser,
  Loader2,
  Paintbrush,
  Save,
  Type,
} from 'lucide-vue-next'
import DisplayCell from '@/components/DisplayCell.vue'
import { apiClient } from '@/api'
import { useGrid } from '@/composables/useGrid'
import { useFlaps } from '@/composables/useFlaps'
import { useDisplay } from '@/composables/useDisplay'
import { useToast } from '@/composables/useToast'

const route = useRoute()
const router = useRouter()
const gridState = useGrid()
const flaps = useFlaps()
const display = useDisplay()
const { toast } = useToast()

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
type Mode = 'type' | 'paint' | 'erase'
const mode = ref<Mode>('type')
const brush = ref<number | null>(null)
const cursor = ref({ x: 0, y: 0 })
const painting = ref(false)

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
  width.value = data.width
  height.value = data.height
  cells.value = data.flaps.map((r) => [...r])
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
  applyBrushAt(x, y)
}

function onPointerUp() {
  painting.value = false
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
      const { error: err } = await apiClient.POST('/api/display', {
        body: { flaps: cells.value },
      })
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
      description: e instanceof Error ? e.message : String(e),
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
        Save
      </Button>
    </div>

    <!-- Mode toggle -->
    <div class="flex items-center gap-2">
      <div
        class="inline-flex rounded-md border border-border bg-card p-0.5"
        role="group"
      >
        <button
          v-for="m in (['type', 'paint', 'erase'] as const)"
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
          <Type v-if="m === 'type'" class="size-3.5" />
          <Paintbrush v-if="m === 'paint'" class="size-3.5" />
          <Eraser v-if="m === 'erase'" class="size-3.5" />
          {{ m }}
        </button>
      </div>
      <span class="hidden text-xs text-muted-foreground sm:inline">
        Press 1/2/3 to switch modes
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
            class="relative cursor-pointer select-none touch-none"
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
