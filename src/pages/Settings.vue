<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
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
  Separator,
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui'
import {
  ChevronRight,
  Clock as ClockIcon,
  Loader2,
  Moon,
  Plus,
  Power,
  Save,
  Trash2,
  Wrench,
  Grid3x3,
} from 'lucide-vue-next'
import { apiClient } from '@/api'
import type { components } from '@/api.d'
import { useTime } from '@/composables/useTime'
import { useModules } from '@/composables/useModules'

type Settings = components['schemas']['Settings']
type QuietWindow = components['schemas']['QuietWindow']
type QuietHours = components['schemas']['QuietHours']
type AboutInfo = components['schemas']['AboutInfo']
type SystemInfo = components['schemas']['SystemInfo']

const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'] as const
const DAY_FULL = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

// ---------- Device card ----------
const settings = ref<Settings | null>(null)
const about = ref<AboutInfo | null>(null)
const systemInfo = ref<SystemInfo | null>(null)
const deviceName = ref('')
const deviceNameSaving = ref(false)

async function loadDevice() {
  const [s, a, sys] = await Promise.all([
    apiClient.GET('/api/settings'),
    apiClient.GET('/api/about'),
    apiClient.GET('/api/system'),
  ])
  if (s.data) {
    settings.value = s.data
    deviceName.value = s.data.device_name
  }
  if (a.data) about.value = a.data
  if (sys.data) systemInfo.value = sys.data
}

const deviceNameDirty = computed(
  () => !!settings.value && deviceName.value !== settings.value.device_name
)

async function saveDeviceName() {
  if (!deviceNameDirty.value) return
  deviceNameSaving.value = true
  try {
    const { data } = await apiClient.POST('/api/settings', {
      body: { device_name: deviceName.value },
    })
    if (data) settings.value = data
  } finally {
    deviceNameSaving.value = false
  }
}

// ---------- Quiet hours ----------
const quiet = ref<QuietHours | null>(null)
const quietWindows = ref<QuietWindow[]>([])
const quietSaving = ref(false)

async function loadQuiet() {
  const { data } = await apiClient.GET('/api/quiet_hours')
  if (data) {
    quiet.value = data
    quietWindows.value = data.windows.map((w) => ({ ...w }))
  }
}

function addWindow() {
  if (quietWindows.value.length >= 7) return
  quietWindows.value.push({
    day_mask: 0b0111110, // Mon-Fri
    start: '22:00',
    end: '07:00',
    enabled: true,
  })
}

function removeWindow(i: number) {
  quietWindows.value.splice(i, 1)
}

function toggleDay(i: number, dayBit: number) {
  const w = quietWindows.value[i]
  w.day_mask ^= 1 << dayBit
}

async function saveQuiet() {
  quietSaving.value = true
  try {
    const { data } = await apiClient.PUT('/api/quiet_hours', {
      body: { windows: quietWindows.value },
    })
    if (data) {
      quiet.value = data
      quietWindows.value = data.windows.map((w) => ({ ...w }))
    }
  } finally {
    quietSaving.value = false
  }
}

const quietDirty = computed(() => {
  if (!quiet.value) return false
  return JSON.stringify(quiet.value.windows) !== JSON.stringify(quietWindows.value)
})

// ---------- Setup subpage summaries ----------
const time = useTime()
const { modules } = useModules()
const gridSummary = computed(() => {
  const g = systemInfo.value?.grid
  if (!g) return null
  return `${g.width} × ${g.height} · ${g.mapped} mapped`
})

// ---------- Actions (reboot) ----------
const rebootOpen = ref(false)
const rebooting = ref(false)

async function reboot() {
  rebooting.value = true
  try {
    await apiClient.POST('/api/system/reboot', {})
  } finally {
    rebooting.value = false
    rebootOpen.value = false
  }
}

// ---------- Boot ----------
onMounted(() => {
  loadDevice()
  loadQuiet()
})
</script>

<template>
  <div class="flex flex-col gap-6">
    <section class="flex flex-col gap-2">
      <span class="eyebrow">Configuration</span>
      <h1 class="display-face text-3xl font-semibold tracking-tight">
        Settings
      </h1>
      <p class="max-w-xl text-sm text-muted-foreground">
        Device identity, quiet hours, setup tools, and power controls.
      </p>
    </section>

    <!-- Device card -->
    <Card>
      <CardHeader>
        <span class="eyebrow">Device</span>
        <CardTitle>Identity</CardTitle>
        <CardDescription v-if="about">
          {{ about.model }} · {{ about.type }} · fw {{ about.version }}
        </CardDescription>
      </CardHeader>
      <CardContent class="flex flex-col gap-4">
        <div class="flex flex-col gap-1.5 max-w-md">
          <Label for="device_name">Device name</Label>
          <div class="flex items-center gap-2">
            <Input
              id="device_name"
              v-model="deviceName"
              :disabled="!settings"
              placeholder="Front lobby board"
            />
            <Button
              :disabled="!deviceNameDirty || deviceNameSaving"
              @click="saveDeviceName"
            >
              <Loader2 v-if="deviceNameSaving" class="animate-spin" />
              <Save v-else />
              Save
            </Button>
          </div>
        </div>
        <Separator />
        <dl
          class="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3"
          v-if="systemInfo"
        >
          <div class="flex flex-col gap-0.5">
            <dt class="eyebrow">IP</dt>
            <dd class="num">{{ systemInfo.ip ?? '—' }}</dd>
          </div>
          <div class="flex flex-col gap-0.5">
            <dt class="eyebrow">Hostname</dt>
            <dd class="num">{{ systemInfo.wifi_ssid ?? '—' }}</dd>
          </div>
          <div class="flex flex-col gap-0.5">
            <dt class="eyebrow">RSSI</dt>
            <dd class="num">
              {{ systemInfo.wifi_rssi ?? '—' }} dBm
            </dd>
          </div>
          <div class="flex flex-col gap-0.5">
            <dt class="eyebrow">Uptime</dt>
            <dd class="num">
              {{ Math.floor(systemInfo.uptime_ms / 3_600_000) }}h
            </dd>
          </div>
          <div class="flex flex-col gap-0.5">
            <dt class="eyebrow">Free heap</dt>
            <dd class="num">
              {{ Math.round(systemInfo.free_heap / 1024) }} KB
            </dd>
          </div>
          <div class="flex flex-col gap-0.5">
            <dt class="eyebrow">MAC</dt>
            <dd class="num text-xs">{{ systemInfo.mac ?? '—' }}</dd>
          </div>
        </dl>
      </CardContent>
    </Card>

    <!-- Quiet hours card -->
    <Card>
      <CardHeader>
        <div class="flex items-start justify-between gap-4">
          <div class="flex flex-col gap-1">
            <span class="eyebrow">Automation</span>
            <CardTitle>Quiet hours</CardTitle>
            <CardDescription>
              Schedules tagged "obey quiet hours" won't fire inside these
              windows.
            </CardDescription>
          </div>
          <Badge v-if="quiet" :variant="quiet.is_quiet_now ? 'warn' : 'outline'">
            <Moon class="size-3" />
            {{ quiet.is_quiet_now ? 'Quiet now' : 'Active' }}
          </Badge>
        </div>
      </CardHeader>
      <CardContent class="flex flex-col gap-3">
        <div
          v-for="(w, i) in quietWindows"
          :key="i"
          class="flex flex-col gap-3 rounded-md border border-border bg-muted/30 p-3 sm:flex-row sm:items-center"
        >
          <div class="flex items-center gap-1">
            <button
              v-for="(d, bit) in DAY_LABELS"
              :key="bit"
              type="button"
              class="size-7 rounded-sm border border-border text-xs transition-colors"
              :class="
                w.day_mask & (1 << bit)
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'text-muted-foreground hover:bg-muted'
              "
              :aria-label="DAY_FULL[bit]"
              @click="toggleDay(i, bit)"
            >
              {{ d }}
            </button>
          </div>
          <div class="flex items-center gap-2 num">
            <Input
              v-model="w.start"
              type="time"
              class="w-[7.5rem]"
              aria-label="Start"
            />
            <span class="text-muted-foreground">→</span>
            <Input
              v-model="w.end"
              type="time"
              class="w-[7.5rem]"
              aria-label="End"
            />
          </div>
          <div class="flex items-center gap-3 sm:ml-auto">
            <Switch v-model="w.enabled" />
            <Button
              variant="ghost"
              size="icon"
              aria-label="Remove window"
              @click="removeWindow(i)"
            >
              <Trash2 />
            </Button>
          </div>
        </div>
        <div v-if="!quietWindows.length" class="text-sm text-muted-foreground">
          No quiet hour windows. The display is always active.
        </div>
      </CardContent>
      <CardFooter class="justify-between">
        <Button
          variant="outline"
          size="sm"
          :disabled="quietWindows.length >= 7"
          @click="addWindow"
        >
          <Plus />
          Add window
        </Button>
        <Button
          size="sm"
          :disabled="!quietDirty || quietSaving"
          @click="saveQuiet"
        >
          <Loader2 v-if="quietSaving" class="animate-spin" />
          <Save v-else />
          Save
        </Button>
      </CardFooter>
    </Card>

    <!-- Setup card (navigation) -->
    <Card>
      <CardHeader>
        <span class="eyebrow">Setup</span>
        <CardTitle>Device setup</CardTitle>
        <CardDescription>
          Tools for configuring time, calibrating modules, and laying out the
          grid.
        </CardDescription>
      </CardHeader>
      <CardContent class="p-0">
        <nav class="flex flex-col divide-y divide-border">
          <RouterLink
            to="/settings/time"
            class="flex items-center gap-4 px-6 py-4 transition-colors hover:bg-muted/50"
          >
            <span
              class="flex size-9 items-center justify-center rounded-md bg-primary/10 text-primary"
            >
              <ClockIcon class="size-4" />
            </span>
            <span class="flex min-w-0 flex-1 flex-col">
              <span class="font-medium">Time &amp; timezone</span>
              <span class="text-xs text-muted-foreground num">
                {{
                  time.ianaTimezone.value ??
                  time.systemConfig.value?.timezone ??
                  '—'
                }}
                · NTP {{ time.synced.value ? 'synced' : 'not synced' }}
              </span>
            </span>
            <ChevronRight class="size-4 text-muted-foreground" />
          </RouterLink>
          <RouterLink
            to="/settings/calibration"
            class="flex items-center gap-4 px-6 py-4 transition-colors hover:bg-muted/50"
          >
            <span
              class="flex size-9 items-center justify-center rounded-md bg-primary/10 text-primary"
            >
              <Wrench class="size-4" />
            </span>
            <span class="flex min-w-0 flex-1 flex-col">
              <span class="font-medium">Calibration</span>
              <span class="text-xs text-muted-foreground">
                {{ modules.length }} module{{ modules.length === 1 ? '' : 's' }}
                on bus
              </span>
            </span>
            <ChevronRight class="size-4 text-muted-foreground" />
          </RouterLink>
          <RouterLink
            to="/settings/grid"
            class="flex items-center gap-4 px-6 py-4 transition-colors hover:bg-muted/50"
          >
            <span
              class="flex size-9 items-center justify-center rounded-md bg-primary/10 text-primary"
            >
              <Grid3x3 class="size-4" />
            </span>
            <span class="flex min-w-0 flex-1 flex-col">
              <span class="font-medium">Grid management</span>
              <span class="text-xs text-muted-foreground">
                {{ gridSummary ?? '—' }}
              </span>
            </span>
            <ChevronRight class="size-4 text-muted-foreground" />
          </RouterLink>
        </nav>
      </CardContent>
    </Card>

    <!-- Actions (danger) -->
    <Card class="border-destructive/40">
      <CardHeader>
        <span class="eyebrow text-destructive">Actions</span>
        <CardTitle>Power</CardTitle>
        <CardDescription>
          Rebooting drops the bus for ~5 seconds and refreshes the discovery
          cache.
        </CardDescription>
      </CardHeader>
      <CardFooter>
        <Dialog v-model:open="rebootOpen">
          <DialogTrigger as-child>
            <Button variant="destructive">
              <Power />
              Reboot device
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Reboot device?</DialogTitle>
              <DialogDescription>
                The display will clear and all modules will re-home. Ongoing
                schedules in the next 10 seconds will miss their fire.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose as-child>
                <Button variant="ghost">Cancel</Button>
              </DialogClose>
              <Button
                variant="destructive"
                :disabled="rebooting"
                @click="reboot"
              >
                <Loader2 v-if="rebooting" class="animate-spin" />
                <Power v-else />
                Reboot now
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardFooter>
    </Card>
  </div>
</template>
