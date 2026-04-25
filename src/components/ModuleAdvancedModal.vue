<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
  Button,
  Input,
  Label,
  Switch,
} from '@/components/ui'
import { Loader2 } from 'lucide-vue-next'
import { useModules } from '@/composables/useModules'
import { useFlaps } from '@/composables/useFlaps'
import { useToast } from '@/composables/useToast'
import { friendlyError } from '@/lib/errors'

const props = defineProps<{
  open: boolean
  uuid: string | null
}>()
const emit = defineEmits<{ (e: 'update:open', v: boolean): void }>()

const modules = useModules()
const flaps = useFlaps()
const { toast } = useToast()

const mod = computed(() =>
  props.uuid ? modules.modules.value.find((m) => m.uuid === props.uuid) : null
)
const persisted = computed(() => mod.value?.persisted ?? null)
const info = computed(() => mod.value?.info ?? null)

// ---------- form state ----------
const flapId = ref<number>(0)
const speed = ref<number>(0)
const accel = ref<number>(0)
const queueDelay = ref<number>(0)
const stepsPerFlap = ref<number>(0)
const fullCycle = ref(false)
const queueMode = ref(false)

const busy = ref<string | null>(null)

watch(
  () => [props.open, props.uuid] as const,
  ([open, uuid]) => {
    if (!open || !uuid) return
    busy.value = null
    flapId.value = mod.value?.status?.flap ?? 0
    speed.value = 0
    accel.value = 0
    queueDelay.value = 0
    stepsPerFlap.value = persisted.value?.steps_per_flap_x10 ?? 0
    fullCycle.value = persisted.value?.transition_mode === 'full_rotation'
    queueMode.value = false
    // Pull a fresh snapshot in case the user just opened this and the cached
    // status/persisted are stale.
    modules.fetchModule(uuid).catch(() => {})
  }
)

// ---------- helpers ----------
async function dispatch<T>(label: string, fn: () => Promise<T>) {
  busy.value = label
  try {
    await fn()
    toast({ title: `${label} sent`, variant: 'success' })
  } catch (e) {
    toast({
      title: `Couldn't ${label.toLowerCase()}`,
      description: friendlyError(e),
      variant: 'destructive',
    })
  } finally {
    busy.value = null
  }
}

async function showFlap() {
  if (!props.uuid) return
  const uuid = props.uuid
  await dispatch(queueMode.value ? 'Queue flap' : 'Show flap', () =>
    modules.action(uuid, {
      action: queueMode.value ? 'queue_display_flap' : 'display_flap',
      param: flapId.value,
    })
  )
}

async function applySpeed() {
  if (!props.uuid || speed.value <= 0) return
  const uuid = props.uuid
  await dispatch('Set speed', () =>
    modules.action(uuid, { action: 'set_speed', param: speed.value })
  )
}

async function applyAccel() {
  if (!props.uuid || accel.value <= 0) return
  const uuid = props.uuid
  await dispatch('Set acceleration', () =>
    modules.action(uuid, { action: 'set_accel', param: accel.value })
  )
}

async function applyQueueDelay() {
  if (!props.uuid) return
  const uuid = props.uuid
  await dispatch('Set queue delay', () =>
    modules.action(uuid, {
      action: 'set_queue_delay',
      param: queueDelay.value,
    })
  )
}

async function runQueued() {
  if (!props.uuid) return
  // The single-module endpoint doesn't expose run_queued; the queued frame
  // fires on the next bus-wide RUN_QUEUED broadcast. Surface a hint instead.
  toast({
    title: 'Queued',
    description: 'The next display update will pull the queued flap.',
    variant: 'default',
  })
}

async function applyTransition() {
  if (!props.uuid) return
  const uuid = props.uuid
  await dispatch('Set transition', () =>
    modules.action(uuid, {
      action: 'set_transition',
      param: fullCycle.value ? 'full_rotation' : 'minimal',
    })
  )
}

async function applyStepsPerFlap() {
  if (!props.uuid) return
  const uuid = props.uuid
  await dispatch('Set steps/flap', () =>
    modules.action(uuid, {
      action: 'set_steps_per_flap',
      param: stepsPerFlap.value,
    })
  )
}

async function reset() {
  if (!props.uuid) return
  const uuid = props.uuid
  await dispatch('Reset module', () =>
    modules.action(uuid, { action: 'reset' })
  )
}
</script>

<template>
  <Dialog :open="props.open" @update:open="(v) => emit('update:open', v)">
    <DialogContent class="max-w-lg">
      <DialogHeader>
        <DialogTitle>
          Module advanced
          <span v-if="mod" class="num text-muted-foreground">
            · {{ mod.uuid }}
          </span>
        </DialogTitle>
        <DialogDescription>
          Direct controls for this module. Most users never need these.
        </DialogDescription>
      </DialogHeader>

      <div class="flex max-h-[65vh] flex-col gap-5 overflow-y-auto">
        <!-- Show flap -->
        <section class="flex flex-col gap-2">
          <Label class="text-sm font-medium">Show flap</Label>
          <div class="flex items-end gap-2">
            <select
              v-model.number="flapId"
              class="h-9 flex-1 rounded-md border border-border bg-card px-3 text-sm"
            >
              <option v-for="f in flaps.flaps.value" :key="f.id" :value="f.id">
                {{ f.id }} — {{ f.glyph ?? f.label }}
              </option>
            </select>
            <Button :disabled="busy !== null" @click="showFlap">
              <Loader2 v-if="busy?.startsWith('Show') || busy?.startsWith('Queue')" class="animate-spin" />
              {{ queueMode ? 'Queue' : 'Show' }}
            </Button>
          </div>
          <div class="flex items-center gap-2 text-xs">
            <Switch id="queue_mode" v-model="queueMode" />
            <Label for="queue_mode" class="cursor-pointer text-muted-foreground">
              Queue (fires on next display update)
            </Label>
          </div>
          <div v-if="queueMode" class="flex items-end gap-2">
            <div class="flex flex-col gap-1.5">
              <Label for="queue_delay" class="text-xs">Queue delay (ms)</Label>
              <Input
                id="queue_delay"
                type="number"
                :min="0"
                v-model.number="queueDelay"
                class="w-32"
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              :disabled="busy !== null"
              @click="applyQueueDelay"
            >
              Apply delay
            </Button>
            <Button
              variant="ghost"
              size="sm"
              :disabled="busy !== null"
              @click="runQueued"
            >
              Hint
            </Button>
          </div>
        </section>

        <!-- Motion -->
        <section class="flex flex-col gap-2">
          <Label class="text-sm font-medium">Motion</Label>
          <div class="flex items-end gap-2">
            <div class="flex flex-col gap-1.5">
              <Label for="speed" class="text-xs">Speed (steps/s)</Label>
              <Input
                id="speed"
                type="number"
                :min="0"
                :max="65535"
                v-model.number="speed"
                class="w-32"
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              :disabled="busy !== null || speed <= 0"
              @click="applySpeed"
            >
              Set
            </Button>
          </div>
          <div class="flex items-end gap-2">
            <div class="flex flex-col gap-1.5">
              <Label for="accel" class="text-xs">Acceleration (steps/s²)</Label>
              <Input
                id="accel"
                type="number"
                :min="0"
                :max="65535"
                v-model.number="accel"
                class="w-32"
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              :disabled="busy !== null || accel <= 0"
              @click="applyAccel"
            >
              Set
            </Button>
          </div>
        </section>

        <!-- Transition -->
        <section class="flex flex-col gap-2">
          <Label class="text-sm font-medium">Transition</Label>
          <div class="flex flex-wrap items-center gap-3">
            <div class="flex items-center gap-2">
              <Switch id="full_cycle_mod" v-model="fullCycle" />
              <Label for="full_cycle_mod" class="cursor-pointer">
                Full rotation
              </Label>
            </div>
            <Button
              variant="outline"
              size="sm"
              :disabled="busy !== null"
              @click="applyTransition"
            >
              Apply
            </Button>
          </div>
        </section>

        <!-- Calibration override -->
        <section class="flex flex-col gap-2">
          <Label class="text-sm font-medium">Steps per flap</Label>
          <div class="flex items-end gap-2">
            <div class="flex flex-col gap-1.5">
              <Label for="steps_per_flap" class="text-xs">
                Deci-steps (0 = firmware default)
              </Label>
              <Input
                id="steps_per_flap"
                type="number"
                :min="0"
                v-model.number="stepsPerFlap"
                class="w-32"
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              :disabled="busy !== null"
              @click="applyStepsPerFlap"
            >
              Set
            </Button>
          </div>
        </section>

        <!-- Reset -->
        <section
          class="flex flex-col gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3"
        >
          <Label class="text-sm font-medium text-destructive">
            Reset module
          </Label>
          <p class="text-xs text-muted-foreground">
            Reboots this module. Display position is lost until the next
            update.
          </p>
          <Button
            variant="destructive"
            size="sm"
            :disabled="busy !== null"
            class="self-start"
            @click="reset"
          >
            <Loader2 v-if="busy === 'Reset module'" class="animate-spin" />
            Reset
          </Button>
        </section>

        <!-- Diagnostic snapshot -->
        <section
          v-if="info || persisted"
          class="flex flex-col gap-1.5 rounded-md border border-border bg-muted/30 p-3 text-xs"
        >
          <span class="text-muted-foreground">Snapshot</span>
          <dl class="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
            <div v-if="info" class="flex flex-col">
              <dt class="text-muted-foreground">Firmware</dt>
              <dd class="num">{{ info.fw }}</dd>
            </div>
            <div v-if="info" class="flex flex-col">
              <dt class="text-muted-foreground">Uptime</dt>
              <dd class="num">{{ info.uptime_min }} min</dd>
            </div>
            <div v-if="mod?.status?.temp_c != null" class="flex flex-col">
              <dt class="text-muted-foreground">Temp</dt>
              <dd class="num">{{ mod.status.temp_c.toFixed(1) }}°C</dd>
            </div>
            <div v-if="mod?.status" class="flex flex-col">
              <dt class="text-muted-foreground">Step</dt>
              <dd class="num">{{ mod.status.step }}</dd>
            </div>
            <div v-if="persisted" class="flex flex-col">
              <dt class="text-muted-foreground">Calibrated</dt>
              <dd>{{ persisted.calibrated ? 'Yes' : 'No' }}</dd>
            </div>
            <div v-if="persisted" class="flex flex-col">
              <dt class="text-muted-foreground">Mode</dt>
              <dd>{{ persisted.transition_mode }}</dd>
            </div>
          </dl>
        </section>
      </div>

      <DialogFooter>
        <DialogClose as-child>
          <Button variant="ghost">Close</Button>
        </DialogClose>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
