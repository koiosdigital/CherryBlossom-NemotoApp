<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Button,
  Badge,
} from '@/components/ui'
import { ArrowRight, Check, Loader2, MapPin, Play, Save } from 'lucide-vue-next'
import { useModules } from '@/composables/useModules'
import { useFlaps } from '@/composables/useFlaps'
import { useGrid } from '@/composables/useGrid'
import { useToast } from '@/composables/useToast'
import { friendlyError } from '@/lib/errors'
import { useWebsocket } from '@/composables/useWebsocket'

const props = defineProps<{
  open: boolean
  uuid: string | null
}>()
const emit = defineEmits<{ (e: 'update:open', v: boolean): void }>()

const modules = useModules()
const { flaps } = useFlaps()
const gridState = useGrid()
const ws = useWebsocket()
const { toast } = useToast()

// Drum geometry (build-time constant on the device, mirrored here). The purple
// flap sits two flaps before "A" (62 → 63 → 0), giving a distinctive visual
// checkpoint the installer can confirm before the final manual approach to A.
const PURPLE_FLAP_ID = 62
const NUM_FLAPS = 64
// 38912 (STEPPER_STEPS_PER_DRUM_REV_X10) / 64 flaps. Deci-steps per flap; used
// only as a fallback when the module hasn't reported its persisted value yet.
const STEPS_PER_FLAP_X10 = 608
// One press of "Advance" during identify. Deci-steps (0.1 motor-step), matching
// the existing jog scale — moves the drum off the ambiguous post-home position
// so the installer can read a definite flap.
const IDENTIFY_DECI = 1000

type State =
  | 'idle'
  | 'homing'
  | 'identify'
  | 'advancing'
  | 'finetune'
  | 'place'
  | 'saving'
  | 'error'
const state = ref<State>('idle')

const currentFlapId = ref<number | null>(null)
const pendingJog = ref<number | null>(null)
const placing = ref<{ x: number; y: number } | null>(null)
const saved = ref(false)
const errorText = ref<string | null>(null)

const mod = computed(() =>
  props.uuid ? modules.modules.value.find((m) => m.uuid === props.uuid) : null
)
const status = computed(() => mod.value?.status ?? null)

// Prefer the module's persisted per-flap step count; fall back to geometry.
const stepsPerFlapX10 = computed(
  () => mod.value?.persisted?.steps_per_flap_x10 || STEPS_PER_FLAP_X10
)

// Flaps to advance from the selected current flap to the purple checkpoint, and
// the corresponding forward jog in deci-steps (the drum only moves forward).
const advance = computed(() => {
  if (currentFlapId.value == null) return null
  const flapsFwd = (PURPLE_FLAP_ID - currentFlapId.value + NUM_FLAPS) % NUM_FLAPS
  return { flaps: flapsFwd, deci: flapsFwd * stepsPerFlapX10.value }
})

// ---- placement grid ----
const gridDef = computed(
  () => gridState.grid.value?.grid ?? { width: 0, height: 0 }
)
const mapping = computed(() => gridState.grid.value?.mapping ?? [])
function occupantAt(x: number, y: number) {
  return mapping.value.find((m) => m.x === x && m.y === y) ?? null
}
function isMine(x: number, y: number) {
  return occupantAt(x, y)?.uuid === props.uuid
}
function isOtherOccupied(x: number, y: number) {
  const occ = occupantAt(x, y)
  return occ != null && occ.uuid !== props.uuid
}

// On open, seed fresh status + reset the wizard.
watch(
  () => [props.open, props.uuid] as const,
  ([open, uuid]) => {
    if (!open || !uuid) return
    state.value = 'idle'
    currentFlapId.value = null
    pendingJog.value = null
    placing.value = null
    saved.value = false
    errorText.value = null
    modules.fetchModule(uuid).catch(() => {
      /* non-fatal; WS will deliver status */
    })
  }
)

// If our module reboots mid-flow, bail with a clear toast.
ws.on('mr', (uuid) => {
  if (!props.open || uuid !== props.uuid) return
  if (state.value === 'idle' || state.value === 'place') return
  state.value = 'error'
  errorText.value = 'The module rebooted during calibration.'
  toast({
    title: 'Module rebooted',
    description: 'Calibration was interrupted. Start again.',
    variant: 'warn',
  })
})

function waitForHomed(target: boolean, timeoutMs = 60000) {
  return new Promise<void>((resolve, reject) => {
    if (status.value?.homed === target) return resolve()
    const timer = setTimeout(() => {
      stop()
      reject(new Error('The module took too long to respond.'))
    }, timeoutMs)
    const stop = watch(
      () => status.value?.homed,
      (v) => {
        if (v === target) {
          clearTimeout(timer)
          stop()
          resolve()
        }
      }
    )
  })
}

async function homeAndWait(uuid: string) {
  const wasHomed = status.value?.homed === true
  const goneFalse = wasHomed ? waitForHomed(false) : Promise.resolve()
  const homePosted = modules.action(uuid, { action: 'home' })
  await goneFalse
  await waitForHomed(true)
  await homePosted
}

async function startCalibration() {
  if (!props.uuid) return
  const uuid = props.uuid
  errorText.value = null
  try {
    const alreadyHomed =
      status.value?.homed === true && status.value?.state === 'idle'
    if (!alreadyHomed) {
      state.value = 'homing'
      await homeAndWait(uuid)
    }
    await modules.action(uuid, { action: 'calibrate', param: { step: 'start' } })
    state.value = 'identify'
  } catch (e) {
    errorText.value = friendlyError(e)
    state.value = 'error'
    toast({
      title: "Couldn't start calibration",
      description: errorText.value ?? undefined,
      variant: 'destructive',
    })
  }
}

// Forward jog used by both the identify pass and the fine-tune step buttons.
async function jog(deci_steps: number) {
  if (!props.uuid) return
  pendingJog.value = deci_steps
  try {
    await modules.action(props.uuid, {
      action: 'calibrate',
      param: { step: 'step', deci_steps },
    })
  } catch (e) {
    toast({
      title: "Couldn't move the module",
      description: e instanceof Error ? e.message : String(e),
      variant: 'destructive',
    })
  } finally {
    pendingJog.value = null
  }
}

// Advance from the selected current flap to the purple checkpoint in one move,
// then hand off to the manual fine-tune to A.
async function continueToPurple() {
  if (!props.uuid || advance.value == null) return
  const { deci } = advance.value
  state.value = 'advancing'
  try {
    if (deci > 0) {
      await modules.action(props.uuid, {
        action: 'calibrate',
        param: { step: 'step', deci_steps: deci },
      })
    }
    state.value = 'finetune'
  } catch (e) {
    toast({
      title: "Couldn't advance to the purple flap",
      description: friendlyError(e),
      variant: 'destructive',
    })
    state.value = 'identify'
  }
}

// User confirms A is aligned — write the offset, then move on to placement.
async function saveCalibration() {
  if (!props.uuid) return
  state.value = 'saving'
  try {
    await modules.action(props.uuid, {
      action: 'calibrate',
      param: { step: 'end' },
    })
    saved.value = true
    modules.fetchModule(props.uuid).catch(() => {})
    gridState.refresh()
    state.value = 'place'
  } catch (e) {
    toast({
      title: "Couldn't save",
      description: friendlyError(e),
      variant: 'destructive',
    })
    state.value = 'finetune'
  }
}

// Placement doesn't need a module picker — the module being calibrated is the
// one we assign, so a cell click drops it straight in.
async function placeAt(x: number, y: number) {
  if (!props.uuid || isOtherOccupied(x, y)) return
  placing.value = { x, y }
  try {
    await gridState.assignCell(x, y, props.uuid)
    toast({ title: 'Module placed', variant: 'success' })
    emit('update:open', false)
  } catch (e) {
    toast({
      title: "Couldn't place module",
      description: friendlyError(e),
      variant: 'destructive',
    })
  } finally {
    placing.value = null
  }
}

// Persist any in-progress (but not-yet-saved) calibration on close so a stray
// dismissal doesn't discard the jogging the user already did.
async function finishAndClose(silent = false) {
  const uuid = props.uuid
  const active =
    state.value === 'identify' ||
    state.value === 'advancing' ||
    state.value === 'finetune'
  if (uuid && active && !saved.value) {
    try {
      await modules.action(uuid, { action: 'calibrate', param: { step: 'end' } })
      modules.fetchModule(uuid).catch(() => {})
      if (!silent) toast({ title: 'Calibration saved', variant: 'success' })
    } catch (e) {
      toast({
        title: "Couldn't save",
        description: friendlyError(e),
        variant: 'destructive',
      })
    }
  }
  state.value = 'idle'
  emit('update:open', false)
}

function onOpenChange(next: boolean) {
  if (!next) finishAndClose(true)
  else emit('update:open', next)
}
</script>

<template>
  <Dialog :open="props.open" @update:open="onOpenChange">
    <DialogContent>
      <DialogHeader>
        <DialogTitle>
          Calibrate module
          <span v-if="mod" class="num text-muted-foreground">
            · {{ mod.uuid }}
          </span>
        </DialogTitle>
        <DialogDescription>
          <template v-if="state === 'idle' || state === 'error'">
            The module homes, then you'll identify its current flap, line it up
            to&nbsp;"A", and place it on the wall.
          </template>
          <template v-else-if="state === 'homing'">
            Resetting the module to its home position.
          </template>
          <template v-else-if="state === 'identify'">
            Step the drum forward until you can clearly read a flap, then select
            which one it's showing.
          </template>
          <template v-else-if="state === 'advancing'">
            Advancing to the purple flap…
          </template>
          <template v-else-if="state === 'finetune'">
            It should now show <span class="text-purple-500">purple</span>. Step
            forward until the letter&nbsp;"A" is aligned.
          </template>
          <template v-else-if="state === 'place'">
            Click the module's cell on the wall to place it.
          </template>
          <template v-else>Saving…</template>
        </DialogDescription>
      </DialogHeader>

      <!-- Status line -->
      <div class="flex items-center gap-2 text-sm" v-if="mod">
        <Badge :variant="mod.alive ? 'success' : 'warn'">
          <span
            class="status-dot"
            :class="mod.alive ? 'text-emerald-500' : 'text-amber-500'"
          />
          {{ mod.alive ? 'Online' : 'Offline' }}
        </Badge>
        <Badge :variant="status?.homed ? 'success' : 'outline'">
          {{ status?.homed ? 'Homed' : 'Not homed' }}
        </Badge>
        <Badge v-if="saved || mod.info?.calibrated" variant="success" class="gap-1">
          <Check class="size-3" />
          Calibrated
        </Badge>
      </div>

      <!-- Start -->
      <div
        v-if="state === 'idle' || state === 'error'"
        class="flex flex-col gap-3"
      >
        <Button @click="startCalibration">
          <Play />
          Start calibration
        </Button>
        <p v-if="state === 'error' && errorText" class="text-xs text-destructive">
          {{ errorText }}
        </p>
      </div>

      <!-- Homing / advancing / saving spinner -->
      <div
        v-else-if="state === 'homing' || state === 'advancing' || state === 'saving'"
        class="flex flex-col items-center gap-2 rounded-md border border-border bg-muted/30 p-6"
      >
        <Loader2 class="size-5 animate-spin text-primary" />
        <p class="text-sm font-medium">
          <template v-if="state === 'homing'">Getting the module ready…</template>
          <template v-else-if="state === 'advancing'">Advancing to purple…</template>
          <template v-else>Saving…</template>
        </p>
      </div>

      <!-- Identify: advance + pick current flap -->
      <div v-else-if="state === 'identify'" class="flex flex-col gap-3">
        <Button
          variant="outline"
          class="justify-between"
          :disabled="pendingJog !== null"
          @click="jog(IDENTIFY_DECI)"
        >
          <span>Advance drum</span>
          <span class="num text-muted-foreground">+{{ IDENTIFY_DECI.toLocaleString() }}</span>
          <Loader2 v-if="pendingJog === IDENTIFY_DECI" class="animate-spin" />
        </Button>

        <p class="text-xs text-muted-foreground">Which flap is it showing?</p>
        <div class="max-h-52 overflow-y-auto rounded-md border border-border">
          <div class="grid grid-cols-6 gap-1 p-2">
            <button
              v-for="f in flaps"
              :key="f.id"
              type="button"
              :title="f.label"
              class="flex aspect-square flex-col items-center justify-center rounded-sm border text-sm transition-colors"
              :class="
                currentFlapId === f.id
                  ? 'border-primary bg-primary/10 ring-2 ring-primary'
                  : 'border-border hover:border-primary/50'
              "
              @click="currentFlapId = f.id"
            >
              <span
                v-if="f.type === 'color'"
                class="size-4 rounded-full border border-border"
                :style="{ backgroundColor: f.color ?? '#000000' }"
              />
              <span
                v-else-if="f.type === 'blank'"
                class="text-[10px] text-muted-foreground"
              >
                blank
              </span>
              <span v-else class="num text-base">{{ f.glyph }}</span>
            </button>
          </div>
        </div>
      </div>

      <!-- Fine-tune to A -->
      <div v-else-if="state === 'finetune'" class="flex flex-col gap-2">
        <p class="text-xs text-muted-foreground">Move forward</p>
        <div class="flex flex-col gap-2">
          <Button
            v-for="n in [5000, 1000, 100]"
            :key="n"
            variant="outline"
            class="justify-between"
            :disabled="pendingJog !== null"
            @click="jog(n)"
          >
            <span class="num">+{{ n.toLocaleString() }}</span>
            <Loader2 v-if="pendingJog === n" class="animate-spin" />
          </Button>
        </div>
      </div>

      <!-- Place on the wall -->
      <div
        v-else-if="state === 'place'"
        class="flex flex-col items-center gap-2"
      >
        <div
          v-if="gridDef.width && gridDef.height"
          class="max-w-full overflow-x-auto"
        >
          <div
            class="grid w-max gap-1"
            :style="{ gridTemplateColumns: `repeat(${gridDef.width}, 2.25rem)` }"
          >
            <template v-for="y in gridDef.height" :key="`r-${y}`">
              <button
                v-for="x in gridDef.width"
                :key="`${x}-${y}`"
                type="button"
                :title="`(${x - 1}, ${y - 1})`"
                :disabled="isOtherOccupied(x - 1, y - 1) || placing !== null"
                class="flex aspect-square items-center justify-center rounded-sm border transition-colors"
                :class="
                  isMine(x - 1, y - 1)
                    ? 'border-primary bg-primary/10'
                    : isOtherOccupied(x - 1, y - 1)
                      ? 'cursor-not-allowed border-border bg-muted/40 opacity-60'
                      : 'border-border hover:border-primary hover:bg-muted/50'
                "
                @click="placeAt(x - 1, y - 1)"
              >
                <Loader2
                  v-if="placing && placing.x === x - 1 && placing.y === y - 1"
                  class="size-3 animate-spin text-primary"
                />
                <MapPin v-else-if="isMine(x - 1, y - 1)" class="size-3 text-primary" />
                <span
                  v-else-if="isOtherOccupied(x - 1, y - 1)"
                  class="status-dot size-1.5! text-muted-foreground"
                />
              </button>
            </template>
          </div>
        </div>
        <p v-else class="text-xs text-muted-foreground">
          No wall configured yet — calibration is saved. Set a board size to place
          this module.
        </p>
      </div>

      <DialogFooter>
        <Button
          v-if="state === 'identify'"
          :disabled="currentFlapId === null || pendingJog !== null"
          @click="continueToPurple"
        >
          Continue
          <ArrowRight />
        </Button>
        <Button
          v-else-if="state === 'finetune'"
          :disabled="pendingJog !== null"
          @click="saveCalibration"
        >
          <Save />
          A is aligned — save
        </Button>
        <Button
          v-else-if="state === 'place'"
          variant="ghost"
          @click="emit('update:open', false)"
        >
          Finish
        </Button>
        <Button
          v-else
          variant="ghost"
          :disabled="state === 'homing' || state === 'advancing' || state === 'saving'"
          @click="emit('update:open', false)"
        >
          Close
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
