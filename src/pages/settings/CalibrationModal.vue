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
import { Check, Loader2, Play, Save } from 'lucide-vue-next'
import { useModules } from '@/composables/useModules'
import { useToast } from '@/composables/useToast'
import { useWebsocket } from '@/composables/useWebsocket'

const props = defineProps<{
  open: boolean
  uuid: string | null
}>()
const emit = defineEmits<{ (e: 'update:open', v: boolean): void }>()

const modules = useModules()
const ws = useWebsocket()
const { toast } = useToast()

type State =
  | 'idle'
  | 'homing'
  | 'resetting'
  | 'rehoming'
  | 'calibrating'
  | 'saving'
  | 'error'
const state = ref<State>('idle')

const preparing = computed(
  () =>
    state.value === 'homing' ||
    state.value === 'resetting' ||
    state.value === 'rehoming'
)
const pendingJog = ref<number | null>(null)
const errorText = ref<string | null>(null)

const mod = computed(() =>
  props.uuid ? modules.modules.value.find((m) => m.uuid === props.uuid) : null
)

const status = computed(() => mod.value?.status ?? null)

// On open, seed fresh status + reset state
watch(
  () => [props.open, props.uuid] as const,
  ([open, uuid]) => {
    if (!open || !uuid) return
    state.value = 'idle'
    pendingJog.value = null
    errorText.value = null
    modules.fetchModule(uuid).catch(() => {
      /* non-fatal; WS will deliver status */
    })
  }
)

// If our module reboots mid-flow, bail. Detection is ~100ms via module.rebooted
// instead of 60s of heartbeat timeout, so we can fail fast with a clear toast.
ws.on('module.rebooted', (ev) => {
  if (!props.open || ev.data.uuid !== props.uuid) return
  if (state.value === 'idle') return
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

// Fire a home command and wait for the module to report homed=false (if it
// was homed at dispatch time) then homed=true. Watchers are installed
// synchronously so WS events during the POST are observed.
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
    // 1. Home to a known reference point.
    state.value = 'homing'
    await homeAndWait(uuid)

    // 2. Clear any prior offset so we start from a clean baseline.
    state.value = 'resetting'
    await modules.action(uuid, { action: 'calibrate', param: { step: 'start' } })
    await modules.action(uuid, { action: 'calibrate', param: { step: 'end' } })

    // 3. Rehome against the new baseline.
    state.value = 'rehoming'
    await homeAndWait(uuid)

    // 4. Open a fresh session for the user's jog adjustments.
    await modules.action(uuid, { action: 'calibrate', param: { step: 'start' } })
    state.value = 'calibrating'
  } catch (e) {
    errorText.value = e instanceof Error ? e.message : String(e)
    state.value = 'error'
    toast({
      title: "Couldn't start calibration",
      description: errorText.value ?? undefined,
      variant: 'destructive',
    })
  }
}

async function jog(deci_steps: number) {
  if (!props.uuid || state.value !== 'calibrating') return
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

async function finishAndClose(silent = false) {
  if (!props.uuid) {
    emit('update:open', false)
    return
  }
  if (state.value === 'calibrating') {
    state.value = 'saving'
    try {
      await modules.action(props.uuid, {
        action: 'calibrate',
        param: { step: 'end' },
      })
      // Refresh so info.calibrated flips to true in the grid + unmapped list
      // without waiting for a manual refresh.
      modules.fetchModule(props.uuid).catch(() => {})
      if (!silent) {
        toast({
          title: 'Calibration saved',
          variant: 'success',
        })
      }
    } catch (e) {
      toast({
        title: "Couldn't save",
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      })
    }
  }
  state.value = 'idle'
  emit('update:open', false)
}

function onOpenChange(next: boolean) {
  if (!next) {
    // Closing via X / backdrop / Esc — save any in-progress calibration silently.
    finishAndClose(true)
  } else {
    emit('update:open', next)
  }
}

function shortUuid(u: string) {
  return u.slice(0, 4) + '…' + u.slice(-4)
}
</script>

<template>
  <Dialog :open="props.open" @update:open="onOpenChange">
    <DialogContent>
      <DialogHeader>
        <DialogTitle>
          Calibrate module
          <span v-if="mod" class="num text-muted-foreground">
            · {{ shortUuid(mod.uuid) }}
          </span>
        </DialogTitle>
        <DialogDescription>
          <template v-if="state === 'idle' || state === 'error'">
            The module will reset to its home position, then you'll line up
            the letter A.
          </template>
          <template v-else-if="preparing">
            Resetting the module to its home position.
          </template>
          <template v-else-if="state === 'calibrating'">
            Jog the module until the flapper tip is about 2&nbsp;mm from the
            top of the letter&nbsp;"A".
          </template>
          <template v-else>Saving…</template>
        </DialogDescription>
      </DialogHeader>

      <!-- Status line (minimal) -->
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
        <Badge
          v-if="mod.info?.calibrated"
          variant="success"
          class="gap-1"
        >
          <Check class="size-3" />
          Calibrated
        </Badge>
      </div>

      <!-- Start trigger -->
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

      <div
        v-else-if="preparing"
        class="flex flex-col items-center gap-2 rounded-md border border-border bg-muted/30 p-6"
      >
        <Loader2 class="size-5 animate-spin text-primary" />
        <p class="text-sm font-medium">Getting the module ready…</p>
      </div>

      <div v-else-if="state === 'calibrating'" class="flex flex-col gap-2">
        <p class="eyebrow">Move forward</p>
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

      <div
        v-else-if="state === 'saving'"
        class="flex flex-col items-center gap-2 rounded-md border border-border bg-muted/30 p-6"
      >
        <Loader2 class="size-5 animate-spin text-primary" />
        <p class="text-sm">Saving…</p>
      </div>

      <DialogFooter>
        <Button
          v-if="state === 'calibrating'"
          @click="finishAndClose(false)"
          :disabled="pendingJog !== null"
        >
          <Save />
          Save &amp; close
        </Button>
        <Button
          v-else
          variant="ghost"
          :disabled="preparing || state === 'saving'"
          @click="emit('update:open', false)"
        >
          Close
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
