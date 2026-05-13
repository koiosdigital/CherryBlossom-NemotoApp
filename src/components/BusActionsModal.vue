<script setup lang="ts">
import { ref } from 'vue'
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
import { apiClient } from '@/api'
import type { components } from '@/api.d'
import { useToast } from '@/composables/useToast'
import { friendlyError } from '@/lib/errors'

defineProps<{ open: boolean }>()
const emit = defineEmits<{ (e: 'update:open', v: boolean): void }>()

const { toast } = useToast()

type BroadcastAction = components['schemas']['BroadcastActionRequest']

const speed = ref<number>(0)
const accel = ref<number>(0)
const stepsPerFlap = ref<number>(0)
const queueDelay = ref<number>(0)
const waveDelay = ref<number>(50)
const fullCycle = ref<boolean>(false)
const identifySeconds = ref<number>(3)

const busy = ref<string | null>(null)

async function dispatch(label: string, body: BroadcastAction) {
  busy.value = label
  try {
    const { error: err } = await apiClient.POST('/api/modules', { body })
    if (err) throw err
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
</script>

<template>
  <Dialog :open="open" @update:open="(v) => emit('update:open', v)">
    <DialogContent class="max-w-lg">
      <DialogHeader>
        <DialogTitle>Bus controls</DialogTitle>
        <DialogDescription>
          Broadcasts to every connected module at once. Use sparingly — these
          override per-module settings.
        </DialogDescription>
      </DialogHeader>

      <div class="flex max-h-[65vh] flex-col gap-5 overflow-y-auto">
        <!-- Identify -->
        <section class="flex flex-col gap-2">
          <Label class="text-sm font-medium">Identify all</Label>
          <p class="text-xs text-muted-foreground">
            Blinks the LED on every module so you can tell the bus is healthy
            end-to-end.
          </p>
          <div class="flex items-end gap-2">
            <div class="flex flex-col gap-1.5">
              <Label for="identify_secs" class="text-xs">Seconds</Label>
              <Input
                id="identify_secs"
                type="number"
                :min="0"
                :max="60"
                v-model.number="identifySeconds"
                class="w-24"
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              :disabled="busy !== null"
              @click="dispatch('Identify all', { action: 'identify_all', param: identifySeconds })"
            >
              <Loader2 v-if="busy === 'Identify all'" class="animate-spin" />
              Blink
            </Button>
            <Button
              variant="ghost"
              size="sm"
              :disabled="busy !== null"
              @click="dispatch('Cancel identify', { action: 'identify_all', param: 0 })"
            >
              Stop
            </Button>
          </div>
        </section>

        <!-- Transition -->
        <section class="flex flex-col gap-2">
          <Label class="text-sm font-medium">Transition mode</Label>
          <div class="flex flex-wrap items-center gap-3">
            <div class="flex items-center gap-2">
              <Switch id="bus_full_cycle" v-model="fullCycle" />
              <Label for="bus_full_cycle" class="cursor-pointer">
                Full rotation
              </Label>
            </div>
            <Button
              variant="outline"
              size="sm"
              :disabled="busy !== null"
              @click="dispatch('Set transition', {
                action: 'set_transition_all',
                param: fullCycle ? 'full_rotation' : 'minimal',
              })"
            >
              Apply to all
            </Button>
          </div>
        </section>

        <!-- Motion defaults -->
        <section class="flex flex-col gap-3">
          <Label class="text-sm font-medium">Motion (all modules)</Label>

          <div class="flex items-end gap-2">
            <div class="flex flex-col gap-1.5">
              <Label for="bus_speed" class="text-xs">Speed (steps/s)</Label>
              <Input
                id="bus_speed"
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
              @click="dispatch('Set speed', { action: 'set_speed_all', param: speed })"
            >
              Set
            </Button>
          </div>

          <div class="flex items-end gap-2">
            <div class="flex flex-col gap-1.5">
              <Label for="bus_accel" class="text-xs">Acceleration (steps/s²)</Label>
              <Input
                id="bus_accel"
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
              @click="dispatch('Set acceleration', { action: 'set_accel_all', param: accel })"
            >
              Set
            </Button>
          </div>

          <div class="flex items-end gap-2">
            <div class="flex flex-col gap-1.5">
              <Label for="bus_steps_per_flap" class="text-xs">
                Steps per flap (deci-steps; 0 = firmware default)
              </Label>
              <Input
                id="bus_steps_per_flap"
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
              @click="dispatch('Set steps/flap', { action: 'set_steps_per_flap_all', param: stepsPerFlap })"
            >
              Set
            </Button>
          </div>
        </section>

        <!-- Queue + wave -->
        <section class="flex flex-col gap-3">
          <Label class="text-sm font-medium">Queue timing</Label>

          <div class="flex items-end gap-2">
            <div class="flex flex-col gap-1.5">
              <Label for="bus_queue_delay" class="text-xs">
                Queue delay (ms — same on every module)
              </Label>
              <Input
                id="bus_queue_delay"
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
              @click="dispatch('Set queue delay', { action: 'set_queue_delay_all', param: queueDelay })"
            >
              Set
            </Button>
          </div>

          <div class="flex items-end gap-2">
            <div class="flex flex-col gap-1.5">
              <Label for="bus_wave_delay" class="text-xs">
                Wave delay (ms per module index — staggered start)
              </Label>
              <Input
                id="bus_wave_delay"
                type="number"
                :min="0"
                v-model.number="waveDelay"
                class="w-32"
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              :disabled="busy !== null"
              @click="dispatch('Set wave delay', { action: 'set_wave_delay', param: waveDelay })"
            >
              Set
            </Button>
          </div>

          <div class="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              :disabled="busy !== null"
              @click="dispatch('Run queued', { action: 'run_queued' })"
            >
              <Loader2 v-if="busy === 'Run queued'" class="animate-spin" />
              Run queued frame
            </Button>
            <span class="text-xs text-muted-foreground">
              Fires the queued moves on every module at once.
            </span>
          </div>
        </section>

        <!-- Reset -->
        <section
          class="flex flex-col gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3"
        >
          <Label class="text-sm font-medium text-destructive">
            Reset all modules
          </Label>
          <p class="text-xs text-muted-foreground">
            Reboots every module. Display goes blank until the next frame.
          </p>
          <Button
            variant="destructive"
            size="sm"
            :disabled="busy !== null"
            class="self-start"
            @click="dispatch('Reset all', { action: 'reset_all' })"
          >
            <Loader2 v-if="busy === 'Reset all'" class="animate-spin" />
            Reset all
          </Button>
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
