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
  Textarea,
} from '@/components/ui'
import { Loader2, Save } from 'lucide-vue-next'
import { apiClient } from '@/api'
import type { components } from '@/api.d'
import { useFlaps } from '@/composables/useFlaps'
import { useTime } from '@/composables/useTime'
import { useSchedules } from '@/composables/useSchedules'
import { useToast } from '@/composables/useToast'
import {
  buildCron,
  describeCron,
  detectTemplate,
  nextFires,
  parseCron,
  type CronTemplate,
} from '@/lib/cron'

type Schedule = components['schemas']['Schedule']
type ScheduleAction = components['schemas']['ScheduleAction']
type PresetMeta = components['schemas']['PresetMeta']

const props = defineProps<{
  open: boolean
  schedule: Schedule | null
}>()
const emit = defineEmits<{
  (e: 'update:open', v: boolean): void
  (e: 'saved', s: Schedule): void
}>()

const flaps = useFlaps()
const time = useTime()
const schedules = useSchedules()
const { toast } = useToast()

// ---------- form state ----------
type Mode = 'every_minutes' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'custom'
type ActionType = 'display_preset' | 'display_solid' | 'clear'

const name = ref('')
const enabled = ref(true)
const obeyQuiet = ref(true)
const mode = ref<Mode>('daily')
const everyN = ref(15)
const hourlyMinute = ref(0)
const dailyTime = ref('09:00')
const weeklyDays = ref<number[]>([1, 2, 3, 4, 5])
const weeklyTime = ref('09:00')
const monthlyDay = ref(1)
const monthlyTime = ref('09:00')
const customCron = ref('0 9 * * 1-5')

const actionType = ref<ActionType>('display_preset')
const presetId = ref<number | null>(null)
const solidFlap = ref<number | null>(null)

// ---------- presets list (loaded lazily) ----------
const presets = ref<PresetMeta[]>([])
const presetsLoaded = ref(false)
async function loadPresets() {
  if (presetsLoaded.value) return
  const { data } = await apiClient.GET('/api/presets')
  if (data) presets.value = data.presets
  presetsLoaded.value = true
}

// ---------- helpers ----------
function parseTime(s: string): { h: number; m: number } {
  const [h, m] = s.split(':').map((n) => parseInt(n, 10))
  return { h: h || 0, m: m || 0 }
}

const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'] as const
const DAY_FULL = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

function toggleWeeklyDay(d: number) {
  if (weeklyDays.value.includes(d)) {
    weeklyDays.value = weeklyDays.value.filter((x) => x !== d)
  } else {
    weeklyDays.value = [...weeklyDays.value, d].sort()
  }
}

// ---------- derive cron from current mode + params ----------
const builtCron = computed<string>(() => {
  let template: CronTemplate
  switch (mode.value) {
    case 'every_minutes':
      template = { kind: 'every_minutes', n: Math.max(1, Math.min(59, everyN.value)) }
      break
    case 'hourly':
      template = { kind: 'hourly', minute: clampInt(hourlyMinute.value, 0, 59) }
      break
    case 'daily': {
      const t = parseTime(dailyTime.value)
      template = { kind: 'daily', hour: t.h, minute: t.m }
      break
    }
    case 'weekly': {
      const t = parseTime(weeklyTime.value)
      template = {
        kind: 'weekly',
        days: weeklyDays.value.length ? weeklyDays.value : [1, 2, 3, 4, 5],
        hour: t.h,
        minute: t.m,
      }
      break
    }
    case 'monthly': {
      const t = parseTime(monthlyTime.value)
      template = {
        kind: 'monthly',
        dayOfMonth: clampInt(monthlyDay.value, 1, 31),
        hour: t.h,
        minute: t.m,
      }
      break
    }
    case 'custom':
      template = { kind: 'custom', cron: customCron.value }
      break
  }
  return buildCron(template)
})

function clampInt(n: number, lo: number, hi: number) {
  if (!Number.isFinite(n)) return lo
  return Math.max(lo, Math.min(hi, Math.round(n)))
}

const cronError = ref<string | null>(null)
const description = computed(() => {
  cronError.value = null
  try {
    const spec = parseCron(builtCron.value)
    return describeCron(spec)
  } catch (e) {
    cronError.value = e instanceof Error ? e.message : String(e)
    return null
  }
})

const nextFireDates = computed<Date[]>(() => {
  if (cronError.value) return []
  try {
    const spec = parseCron(builtCron.value)
    return nextFires(spec, 3, new Date(), time.ianaTimezone.value ?? undefined)
  } catch {
    return []
  }
})

function fmtFire(d: Date) {
  return time
    .formatter({
      weekday: 'short',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
    .format(d)
}

// ---------- action validation ----------
const actionValid = computed(() => {
  if (actionType.value === 'display_preset') return presetId.value != null
  if (actionType.value === 'display_solid') return solidFlap.value != null
  return true
})

const formValid = computed(
  () => name.value.trim().length > 0 && !cronError.value && actionValid.value
)

// ---------- preload form when (re)opening ----------
watch(
  () => [props.open, props.schedule] as const,
  ([open, sched]) => {
    if (!open) return
    loadPresets()
    cronError.value = null
    if (sched) {
      // Edit
      name.value = sched.name
      enabled.value = sched.enabled
      obeyQuiet.value = sched.obey_quiet_hours
      const tpl = detectTemplate(sched.cron)
      applyTemplate(tpl)
      const a = sched.action
      actionType.value = a.type
      presetId.value = a.type === 'display_preset' ? a.preset_id : null
      solidFlap.value = a.type === 'display_solid' ? a.flap : null
    } else {
      // New
      name.value = ''
      enabled.value = true
      obeyQuiet.value = true
      mode.value = 'daily'
      dailyTime.value = '09:00'
      everyN.value = 15
      hourlyMinute.value = 0
      weeklyDays.value = [1, 2, 3, 4, 5]
      weeklyTime.value = '09:00'
      monthlyDay.value = 1
      monthlyTime.value = '09:00'
      customCron.value = '0 9 * * 1-5'
      actionType.value = 'display_preset'
      presetId.value = null
      solidFlap.value = null
    }
  },
  { immediate: true }
)

function applyTemplate(t: CronTemplate) {
  switch (t.kind) {
    case 'every_minutes':
      mode.value = 'every_minutes'
      everyN.value = t.n
      break
    case 'hourly':
      mode.value = 'hourly'
      hourlyMinute.value = t.minute
      break
    case 'daily':
      mode.value = 'daily'
      dailyTime.value = `${pad(t.hour)}:${pad(t.minute)}`
      break
    case 'weekly':
      mode.value = 'weekly'
      weeklyDays.value = [...t.days]
      weeklyTime.value = `${pad(t.hour)}:${pad(t.minute)}`
      break
    case 'monthly':
      mode.value = 'monthly'
      monthlyDay.value = t.dayOfMonth
      monthlyTime.value = `${pad(t.hour)}:${pad(t.minute)}`
      break
    case 'custom':
      mode.value = 'custom'
      customCron.value = t.cron
      break
  }
}

function pad(n: number) {
  return n.toString().padStart(2, '0')
}

// ---------- save ----------
const saving = ref(false)

function buildAction(): ScheduleAction {
  if (actionType.value === 'display_preset')
    return { type: 'display_preset', preset_id: presetId.value! }
  if (actionType.value === 'display_solid')
    return { type: 'display_solid', flap: solidFlap.value! }
  return { type: 'clear' }
}

async function save() {
  if (!formValid.value) return
  saving.value = true
  try {
    const body = {
      name: name.value.trim(),
      cron: builtCron.value,
      enabled: enabled.value,
      obey_quiet_hours: obeyQuiet.value,
      action: buildAction(),
    }
    const result = props.schedule
      ? await schedules.update(props.schedule.id, body)
      : await schedules.create(body)
    toast({
      title: props.schedule ? 'Schedule updated' : 'Schedule created',
      variant: 'success',
    })
    emit('saved', result)
    emit('update:open', false)
  } catch (e) {
    toast({
      title: "Couldn't save schedule",
      description: e instanceof Error ? e.message : String(e),
      variant: 'destructive',
    })
  } finally {
    saving.value = false
  }
}

const MODE_LABELS: Record<Mode, string> = {
  every_minutes: 'Repeat',
  hourly: 'Hourly',
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
  custom: 'Custom',
}

const ACTION_LABELS: Record<ActionType, string> = {
  display_preset: 'Show preset',
  display_solid: 'Show single flap',
  clear: 'Clear display',
}

const flapOptions = computed(() => flaps.flaps.value)
</script>

<template>
  <Dialog :open="props.open" @update:open="(v) => emit('update:open', v)">
    <DialogContent class="max-w-lg">
      <DialogHeader>
        <DialogTitle>
          {{ props.schedule ? 'Edit schedule' : 'New schedule' }}
        </DialogTitle>
        <DialogDescription>
          Pick when and what to show. Times use the display's timezone.
        </DialogDescription>
      </DialogHeader>

      <div class="flex flex-col gap-5 max-h-[65vh] overflow-y-auto">
        <!-- Name -->
        <div class="flex flex-col gap-1.5">
          <Label for="sched_name">Name</Label>
          <Input
            id="sched_name"
            v-model="name"
            placeholder="Morning greeting"
          />
        </div>

        <!-- When -->
        <div class="flex flex-col gap-2">
          <Label>When</Label>
          <div class="flex flex-wrap gap-1 rounded-md border border-border bg-muted/30 p-1">
            <button
              v-for="m in (Object.keys(MODE_LABELS) as Mode[])"
              :key="m"
              type="button"
              class="flex-1 min-w-[5rem] rounded-sm px-2.5 py-1.5 text-xs font-medium transition-colors"
              :class="
                mode === m
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              "
              @click="mode = m"
            >
              {{ MODE_LABELS[m] }}
            </button>
          </div>

          <!-- Mode-specific controls -->
          <div class="rounded-md border border-border bg-card p-3">
            <div v-if="mode === 'every_minutes'" class="flex items-center gap-2 text-sm">
              <span>Every</span>
              <Input
                type="number"
                :min="1"
                :max="59"
                v-model.number="everyN"
                class="w-20"
              />
              <span>minutes</span>
            </div>

            <div v-else-if="mode === 'hourly'" class="flex items-center gap-2 text-sm">
              <span>At minute</span>
              <Input
                type="number"
                :min="0"
                :max="59"
                v-model.number="hourlyMinute"
                class="w-20"
              />
              <span>of every hour</span>
            </div>

            <div v-else-if="mode === 'daily'" class="flex items-center gap-2 text-sm">
              <span>Every day at</span>
              <Input
                type="time"
                v-model="dailyTime"
                class="w-[7.5rem]"
              />
            </div>

            <div v-else-if="mode === 'weekly'" class="flex flex-col gap-3 text-sm">
              <div class="flex items-center gap-1">
                <button
                  v-for="(d, bit) in DAY_LABELS"
                  :key="bit"
                  type="button"
                  class="size-8 rounded-sm border border-border text-xs transition-colors"
                  :class="
                    weeklyDays.includes(bit)
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'text-muted-foreground hover:bg-muted'
                  "
                  :aria-label="DAY_FULL[bit]"
                  @click="toggleWeeklyDay(bit)"
                >
                  {{ d }}
                </button>
              </div>
              <div class="flex items-center gap-2">
                <span>at</span>
                <Input
                  type="time"
                  v-model="weeklyTime"
                  class="w-[7.5rem]"
                />
              </div>
            </div>

            <div v-else-if="mode === 'monthly'" class="flex items-center gap-2 text-sm">
              <span>On day</span>
              <Input
                type="number"
                :min="1"
                :max="31"
                v-model.number="monthlyDay"
                class="w-20"
              />
              <span>at</span>
              <Input
                type="time"
                v-model="monthlyTime"
                class="w-[7.5rem]"
              />
            </div>

            <div v-else-if="mode === 'custom'" class="flex flex-col gap-1.5">
              <Textarea
                v-model="customCron"
                :rows="2"
                placeholder="0 9 * * 1-5"
                class="num text-xs"
              />
              <p class="text-xs text-muted-foreground">
                Standard 5- or 6-field cron.
                <code class="num">min hour day-of-month month day-of-week</code>
              </p>
            </div>
          </div>

          <!-- Cron preview + next fires -->
          <div
            class="flex flex-col gap-2 rounded-md border border-border/60 bg-muted/20 p-3 text-xs"
          >
            <p
              v-if="cronError"
              class="text-destructive"
            >
              {{ cronError }}
            </p>
            <template v-else>
              <p class="font-medium text-foreground">{{ description }}</p>
              <p class="text-muted-foreground">
                Cron: <span class="num">{{ builtCron }}</span>
              </p>
              <div v-if="nextFireDates.length" class="flex flex-col gap-0.5 text-muted-foreground">
                <span class="font-medium text-foreground">Next runs</span>
                <span v-for="(d, i) in nextFireDates" :key="i" class="num">
                  · {{ fmtFire(d) }}
                </span>
              </div>
            </template>
          </div>
        </div>

        <!-- What -->
        <div class="flex flex-col gap-2">
          <Label>What to show</Label>
          <div class="flex flex-wrap gap-1 rounded-md border border-border bg-muted/30 p-1">
            <button
              v-for="a in (Object.keys(ACTION_LABELS) as ActionType[])"
              :key="a"
              type="button"
              class="flex-1 min-w-[8rem] rounded-sm px-2.5 py-1.5 text-xs font-medium transition-colors"
              :class="
                actionType === a
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              "
              @click="actionType = a"
            >
              {{ ACTION_LABELS[a] }}
            </button>
          </div>

          <div
            v-if="actionType === 'display_preset'"
            class="flex flex-col gap-1.5"
          >
            <select
              v-model="presetId"
              class="h-9 w-full rounded-md border border-border bg-card px-3 text-sm"
            >
              <option :value="null" disabled>Pick a preset…</option>
              <option v-for="p in presets" :key="p.id" :value="p.id">
                {{ p.name }} ({{ p.width }} × {{ p.height }})
              </option>
            </select>
            <p
              v-if="!presets.length"
              class="text-xs text-muted-foreground"
            >
              No presets yet — create one in the editor first.
            </p>
          </div>

          <div
            v-else-if="actionType === 'display_solid'"
            class="flex flex-col gap-1.5"
          >
            <div
              class="grid max-h-40 grid-cols-8 gap-1 overflow-y-auto rounded-md border border-border p-2 sm:grid-cols-12"
            >
              <button
                v-for="f in flapOptions"
                :key="f.id"
                type="button"
                class="flex aspect-square items-center justify-center rounded-sm border text-xs font-mono transition-colors"
                :class="
                  solidFlap === f.id
                    ? 'border-primary ring-2 ring-primary/40'
                    : 'border-border hover:border-primary/50'
                "
                :style="
                  f.color
                    ? { background: f.color, color: '#fff' }
                    : { background: 'hsl(var(--muted))' }
                "
                :title="f.label"
                @click="solidFlap = f.id"
              >
                {{ f.glyph ?? '' }}
              </button>
            </div>
            <p
              v-if="solidFlap == null"
              class="text-xs text-muted-foreground"
            >
              Pick a flap to fill the entire display with.
            </p>
          </div>

          <p
            v-else
            class="text-xs text-muted-foreground"
          >
            Blanks every cell on the display.
          </p>
        </div>

        <!-- Toggles -->
        <div class="flex flex-col gap-2 rounded-md border border-border bg-muted/30 p-3">
          <div class="flex items-center justify-between gap-3">
            <div class="flex flex-col">
              <span class="text-sm font-medium">Enabled</span>
              <span class="text-xs text-muted-foreground">
                Off = won't fire automatically.
              </span>
            </div>
            <Switch v-model="enabled" />
          </div>
          <div class="flex items-center justify-between gap-3">
            <div class="flex flex-col">
              <span class="text-sm font-medium">Honor quiet hours</span>
              <span class="text-xs text-muted-foreground">
                Skip this schedule during quiet hours.
              </span>
            </div>
            <Switch v-model="obeyQuiet" />
          </div>
        </div>
      </div>

      <DialogFooter>
        <DialogClose as-child>
          <Button variant="ghost">Cancel</Button>
        </DialogClose>
        <Button :disabled="!formValid || saving" @click="save">
          <Loader2 v-if="saving" class="animate-spin" />
          <Save v-else />
          {{ props.schedule ? 'Save changes' : 'Create' }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
