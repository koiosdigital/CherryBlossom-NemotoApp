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
  Cpu,
  FileUp,
  Loader2,
  Moon,
  Plus,
  Power,
  Save,
  Trash2,
  Upload,
  Wifi,
  WifiLow,
  WifiOff,
  Globe,
} from 'lucide-vue-next'
import { apiClient, API_BASE } from '@/api'
import type { components } from '@/api.d'
import { useTime } from '@/composables/useTime'
import { useModules } from '@/composables/useModules'
import { useSchedules } from '@/composables/useSchedules'
import { useToast } from '@/composables/useToast'
import { friendlyError } from '@/lib/errors'

const { toast } = useToast()

type Settings = components['schemas']['Settings']
type QuietWindow = components['schemas']['QuietWindow']
type QuietHours = components['schemas']['QuietHours']
type AboutInfo = components['schemas']['AboutInfo']
type SystemInfo = components['schemas']['SystemInfo']
type PresetMeta = components['schemas']['PresetMeta']

const DAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'] as const
const DAY_FULL = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

// ---------- Device card ----------
const settings = ref<Settings | null>(null)
const about = ref<AboutInfo | null>(null)
const systemInfo = ref<SystemInfo | null>(null)
const presets = ref<PresetMeta[]>([])
const deviceName = ref('')
const deviceNameSaving = ref(false)

async function loadDevice() {
  const [s, a, sys, p] = await Promise.all([
    apiClient.GET('/api/settings'),
    apiClient.GET('/api/about'),
    apiClient.GET('/api/system'),
    apiClient.GET('/api/presets'),
  ])
  if (s.data) {
    settings.value = s.data
    deviceName.value = s.data.device_name
    bootPresetId.value = s.data.boot_preset_id
    speedDraft.value = s.data.default_speed
    accelDraft.value = s.data.default_accel
  }
  if (a.data) about.value = a.data
  if (sys.data) systemInfo.value = sys.data
  if (p.data) presets.value = p.data.presets
}

// ---------- Boot preset ----------
const bootPresetId = ref<number>(0)
const bootPresetSaving = ref(false)
const bootPresetDirty = computed(
  () => !!settings.value && bootPresetId.value !== settings.value.boot_preset_id
)
async function saveBootPreset() {
  if (!bootPresetDirty.value) return
  bootPresetSaving.value = true
  try {
    const { data } = await apiClient.POST('/api/settings', {
      body: { boot_preset_id: bootPresetId.value },
    })
    if (data) settings.value = data
    toast({ title: 'Boot preset saved', variant: 'success' })
  } catch (e) {
    toast({
      title: "Couldn't save",
      description: friendlyError(e),
      variant: 'destructive',
    })
  } finally {
    bootPresetSaving.value = false
  }
}

// ---------- Motor defaults ----------
const speedDraft = ref<number>(0)
const accelDraft = ref<number>(0)
const motorSaving = ref(false)
const motorDirty = computed(() => {
  if (!settings.value) return false
  return (
    speedDraft.value !== settings.value.default_speed ||
    accelDraft.value !== settings.value.default_accel
  )
})
async function saveMotor() {
  if (!motorDirty.value) return
  motorSaving.value = true
  try {
    const { data } = await apiClient.POST('/api/settings', {
      body: {
        default_speed: speedDraft.value,
        default_accel: accelDraft.value,
      },
    })
    if (data) settings.value = data
    toast({ title: 'Motor defaults saved', variant: 'success' })
  } catch (e) {
    toast({
      title: "Couldn't save",
      description: friendlyError(e),
      variant: 'destructive',
    })
  } finally {
    motorSaving.value = false
  }
}

const signal = computed(() => {
  const r = systemInfo.value?.wifi_rssi
  if (r == null) return { label: 'Offline', icon: WifiOff, variant: 'outline' as const }
  if (r >= -70) return { label: `${r} dBm`, icon: Wifi, variant: 'success' as const }
  if (r >= -80) return { label: `${r} dBm`, icon: WifiLow, variant: 'warn' as const }
  return { label: `${r} dBm`, icon: WifiLow, variant: 'warn' as const }
})

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
const schedules = useSchedules()
const gridSummary = computed(() => {
  const g = systemInfo.value?.grid
  if (!g) return null
  return `${g.width} × ${g.height} · ${g.mapped} placed`
})

// ---------- "What runs?" dialog ----------
const whatRunsOpen = ref(false)
const obeyingSchedules = computed(() =>
  schedules.schedules.value.filter(
    (s) => s.enabled && s.obey_quiet_hours
  )
)
const ignoringSchedules = computed(() =>
  schedules.schedules.value.filter(
    (s) => s.enabled && !s.obey_quiet_hours
  )
)

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

// ---------- Manual firmware update ----------
const otaInput = ref<HTMLInputElement | null>(null)
const otaFile = ref<File | null>(null)
const otaUploading = ref(false)
const otaPct = ref(0)
const otaError = ref<string | null>(null)
const otaDone = ref(false)

function pickOtaFile() {
  otaInput.value?.click()
}

function onOtaFileChange(e: Event) {
  const input = e.target as HTMLInputElement
  otaFile.value = input.files?.[0] ?? null
  otaError.value = null
  otaDone.value = false
  input.value = ''
}

function fmtSize(bytes: number) {
  return bytes >= 1_048_576
    ? `${(bytes / 1_048_576).toFixed(1)} MB`
    : `${Math.round(bytes / 1024)} KB`
}

function uploadOta() {
  const file = otaFile.value
  if (!file || otaUploading.value) return
  otaUploading.value = true
  otaPct.value = 0
  otaError.value = null
  otaDone.value = false

  // XHR instead of fetch: fetch has no upload progress events.
  const xhr = new XMLHttpRequest()
  xhr.open('POST', `${API_BASE}/api/system/ota`)
  xhr.setRequestHeader('Content-Type', 'application/octet-stream')
  xhr.upload.onprogress = (e) => {
    if (e.lengthComputable) {
      otaPct.value = Math.round((e.loaded / e.total) * 100)
    }
  }
  xhr.onload = () => {
    otaUploading.value = false
    if (xhr.status === 200) {
      otaPct.value = 100
      otaDone.value = true
      otaFile.value = null
      toast({
        title: 'Firmware installed',
        description: 'The device is rebooting into the new firmware.',
        variant: 'success',
      })
    } else {
      otaError.value = xhr.responseText || `Upload failed (HTTP ${xhr.status})`
    }
  }
  xhr.onerror = () => {
    otaUploading.value = false
    otaError.value = 'Network error during upload'
  }
  xhr.send(file)
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
      <h1 class="display-face text-3xl font-semibold tracking-tight">
        Settings
      </h1>
    </section>

    <!-- Device card -->
    <Card>
      <CardHeader>
        <div class="flex items-start justify-between gap-4">
          <div class="flex flex-col gap-1">
            <CardTitle>Identity</CardTitle>
            <CardDescription v-if="about">
              {{ about.model }} · firmware {{ about.version }}
            </CardDescription>
          </div>
          <Badge :variant="signal.variant" class="gap-1.5">
            <component :is="signal.icon" class="size-3" />
            {{ signal.label }}
          </Badge>
        </div>
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
          class="grid grid-cols-2 gap-3 text-sm"
          v-if="systemInfo"
        >
          <div class="flex flex-col gap-0.5">
            <dt class="text-xs text-muted-foreground">Uptime</dt>
            <dd class="num">
              {{ Math.floor(systemInfo.uptime_ms / 3_600_000) }}h
            </dd>
          </div>
          <div class="flex flex-col gap-0.5">
            <dt class="text-xs text-muted-foreground">Free memory</dt>
            <dd class="num">
              {{ Math.round(systemInfo.free_heap / 1024) }} KB
            </dd>
          </div>
        </dl>
      </CardContent>
    </Card>

    <!-- Boot preset -->
    <Card>
      <CardHeader>
        <CardTitle>Boot preset</CardTitle>
        <CardDescription>
          Shown automatically a moment after the display powers on.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div class="flex flex-col gap-1.5 sm:flex-row sm:items-end sm:gap-2">
          <div class="flex-1">
            <Label for="boot_preset">Preset</Label>
            <select
              id="boot_preset"
              v-model.number="bootPresetId"
              :disabled="!settings"
              class="h-9 w-full rounded-md border border-border bg-card px-3 text-sm"
            >
              <option :value="0">None</option>
              <option v-for="p in presets" :key="p.id" :value="p.id">
                {{ p.name }}
              </option>
            </select>
          </div>
          <Button
            :disabled="!bootPresetDirty || bootPresetSaving"
            @click="saveBootPreset"
          >
            <Loader2 v-if="bootPresetSaving" class="animate-spin" />
            <Save v-else />
            Save
          </Button>
        </div>
      </CardContent>
    </Card>

    <!-- Motor defaults -->
    <Card>
      <CardHeader>
        <CardTitle>Motor defaults</CardTitle>
        <CardDescription>
          Pushed to every module on boot. 0 leaves the firmware default in
          place.
        </CardDescription>
      </CardHeader>
      <CardContent class="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div class="flex flex-col gap-1.5">
          <Label for="default_speed">Speed (steps/s)</Label>
          <Input
            id="default_speed"
            type="number"
            :min="0"
            :max="65535"
            v-model.number="speedDraft"
            class="w-32"
          />
        </div>
        <div class="flex flex-col gap-1.5">
          <Label for="default_accel">Acceleration (steps/s²)</Label>
          <Input
            id="default_accel"
            type="number"
            :min="0"
            :max="65535"
            v-model.number="accelDraft"
            class="w-32"
          />
        </div>
        <Button
          class="sm:ml-auto"
          :disabled="!motorDirty || motorSaving"
          @click="saveMotor"
        >
          <Loader2 v-if="motorSaving" class="animate-spin" />
          <Save v-else />
          Save
        </Button>
      </CardContent>
    </Card>

    <!-- Quiet hours card -->
    <Card>
      <CardHeader>
        <div class="flex items-start justify-between gap-4">
          <div class="flex flex-col gap-1">
            <CardTitle>Quiet hours</CardTitle>
            <CardDescription>
              Schedules won't run during these windows.
              <button
                type="button"
                class="text-primary hover:underline"
                @click="whatRunsOpen = true"
              >
                What runs?
              </button>
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
        <CardTitle>Device setup</CardTitle>
      </CardHeader>
      <CardContent class="p-0">
        <nav class="flex flex-col divide-y divide-border">
          <RouterLink
            to="/settings/network"
            class="flex items-center gap-4 px-6 py-4 transition-colors hover:bg-muted/50"
          >
            <span
              class="flex size-9 items-center justify-center rounded-md bg-primary/10 text-primary"
            >
              <Globe class="size-4" />
            </span>
            <span class="flex min-w-0 flex-1 flex-col">
              <span class="font-medium">Network</span>
              <span class="text-xs text-muted-foreground num">
                {{ systemInfo?.wifi_ssid ?? 'Offline' }}
                <template v-if="systemInfo?.ip"> · {{ systemInfo.ip }}</template>
              </span>
            </span>
            <ChevronRight class="size-4 text-muted-foreground" />
          </RouterLink>
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
            to="/settings/modules"
            class="flex items-center gap-4 px-6 py-4 transition-colors hover:bg-muted/50"
          >
            <span
              class="flex size-9 items-center justify-center rounded-md bg-primary/10 text-primary"
            >
              <Cpu class="size-4" />
            </span>
            <span class="flex min-w-0 flex-1 flex-col">
              <span class="font-medium">Modules</span>
              <span class="text-xs text-muted-foreground">
                {{ modules.length }} connected
                <template v-if="gridSummary"> · {{ gridSummary }}</template>
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
        <CardTitle>Power</CardTitle>
        <CardDescription>
          Restarts the display. The wall goes blank for a few seconds.
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
              <DialogTitle>Restart the display?</DialogTitle>
              <DialogDescription>
                The wall will clear and modules will reset. Any schedule due in
                the next 10 seconds will be skipped.
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

    <!-- Manual firmware update -->
    <Card>
      <CardHeader>
        <CardTitle>Firmware update</CardTitle>
        <CardDescription>
          Manually install a firmware image (.bin). The device verifies the
          image, then reboots into it<template v-if="about">
            — currently running {{ about.version }}</template>.
        </CardDescription>
      </CardHeader>
      <CardContent class="flex flex-col gap-3">
        <input
          ref="otaInput"
          type="file"
          accept=".bin,application/octet-stream"
          class="hidden"
          @change="onOtaFileChange"
        />
        <div class="flex flex-wrap items-center gap-2">
          <Button variant="outline" :disabled="otaUploading" @click="pickOtaFile">
            <FileUp />
            Choose file
          </Button>
          <span v-if="otaFile" class="text-sm num">
            {{ otaFile.name }} · {{ fmtSize(otaFile.size) }}
          </span>
          <span v-else class="text-sm text-muted-foreground">
            No file selected
          </span>
        </div>
        <div v-if="otaUploading" class="flex flex-col gap-1.5">
          <div
            class="flex items-center justify-between text-xs text-muted-foreground num"
          >
            <span>Uploading…</span>
            <span>{{ otaPct }}%</span>
          </div>
          <div class="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              class="h-full bg-primary transition-[width] duration-200"
              :style="{ width: `${otaPct}%` }"
            />
          </div>
        </div>
        <p v-if="otaDone" class="text-sm text-muted-foreground">
          Upload complete — the device is rebooting into the new firmware.
        </p>
        <p v-if="otaError" class="text-sm text-destructive">
          {{ otaError }}
        </p>
      </CardContent>
      <CardFooter>
        <Button
          variant="destructive"
          :disabled="!otaFile || otaUploading"
          @click="uploadOta"
        >
          <Loader2 v-if="otaUploading" class="animate-spin" />
          <Upload v-else />
          Upload &amp; install
        </Button>
      </CardFooter>
    </Card>

    <!-- What runs during quiet hours -->
    <Dialog v-model:open="whatRunsOpen">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Schedules &amp; quiet hours</DialogTitle>
          <DialogDescription>
            Quiet hours skip schedules tagged "honor quiet hours".
          </DialogDescription>
        </DialogHeader>
        <div class="flex flex-col gap-4 text-sm">
          <div class="flex flex-col gap-1.5">
            <span class="text-xs text-muted-foreground">
              Skipped during quiet hours
            </span>
            <ul
              v-if="obeyingSchedules.length"
              class="flex flex-col gap-1"
            >
              <li
                v-for="s in obeyingSchedules"
                :key="s.id"
                class="rounded-md border border-border bg-muted/30 px-3 py-1.5"
              >
                {{ s.name }}
              </li>
            </ul>
            <p v-else class="text-xs text-muted-foreground">None.</p>
          </div>
          <div class="flex flex-col gap-1.5">
            <span class="text-xs text-muted-foreground">
              Always run, even during quiet hours
            </span>
            <ul
              v-if="ignoringSchedules.length"
              class="flex flex-col gap-1"
            >
              <li
                v-for="s in ignoringSchedules"
                :key="s.id"
                class="rounded-md border border-border bg-muted/30 px-3 py-1.5"
              >
                {{ s.name }}
              </li>
            </ul>
            <p v-else class="text-xs text-muted-foreground">None.</p>
          </div>
        </div>
        <DialogFooter>
          <DialogClose as-child>
            <Button>Close</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
