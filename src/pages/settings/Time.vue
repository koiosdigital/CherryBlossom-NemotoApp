<script setup lang="ts">
import { ref, computed, watch, onBeforeUnmount } from 'vue'
import { RouterLink } from 'vue-router'
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  Button,
  Input,
  Label,
  Switch,
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui'
import {
  Check,
  ChevronDown,
  ChevronLeft,
  Loader2,
  RefreshCw,
  Save,
  Search,
} from 'lucide-vue-next'
import { useTime } from '@/composables/useTime'
import { useZonedb } from '@/composables/useZonedb'

const time = useTime()
const zonedb = useZonedb()

// ---------- live ticking clock (browser clock rendered in device TZ) ----------
const nowTick = ref(Date.now())
const tick = window.setInterval(() => (nowTick.value = Date.now()), 1000)
onBeforeUnmount(() => window.clearInterval(tick))

const deviceNow = computed(() => time.formatTime(new Date(nowTick.value)))
const deviceDate = computed(() =>
  time.formatter({
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  }).format(new Date(nowTick.value))
)
const browserTz = computed(() => Intl.DateTimeFormat().resolvedOptions().timeZone)

// ---------- timezone picker (local copy of config) ----------
const autoTz = ref(false)
const selectedRule = ref('')
const pickerOpen = ref(false)
const pickerQuery = ref('')

watch(
  () => time.systemConfig.value,
  (c) => {
    if (!c) return
    autoTz.value = c.auto_timezone
    selectedRule.value = c.timezone
  },
  { immediate: true }
)

const selectedEntry = computed(() =>
  selectedRule.value ? zonedb.findByRule(selectedRule.value) : null
)

const filteredZones = computed(() => {
  const q = pickerQuery.value.trim().toLowerCase()
  const all = zonedb.zones.value
  if (!q) return all
  return all.filter(
    (z) =>
      z.name.toLowerCase().includes(q) || z.rule.toLowerCase().includes(q)
  )
})

function pickZone(rule: string) {
  selectedRule.value = rule
  pickerOpen.value = false
  pickerQuery.value = ''
}

const tzDirty = computed(() => {
  const c = time.systemConfig.value
  if (!c) return false
  return autoTz.value !== c.auto_timezone || selectedRule.value !== c.timezone
})

const tzSaving = ref(false)
async function saveTz() {
  tzSaving.value = true
  try {
    await time.updateConfig({
      auto_timezone: autoTz.value,
      timezone: selectedRule.value,
    })
  } finally {
    tzSaving.value = false
  }
}

// ---------- ntp + hostname (local copy of config) ----------
const ntpServer = ref('')
const hostname = ref('')
const ntpSaving = ref(false)

watch(
  () => time.systemConfig.value,
  (c) => {
    if (!c) return
    ntpServer.value = c.ntp_server
    hostname.value = c.wifi_hostname
  },
  { immediate: true }
)

const ntpDirty = computed(() => {
  const c = time.systemConfig.value
  if (!c) return false
  return (
    ntpServer.value !== c.ntp_server || hostname.value !== c.wifi_hostname
  )
})

async function saveNtp() {
  ntpSaving.value = true
  try {
    await time.updateConfig({
      ntp_server: ntpServer.value,
      wifi_hostname: hostname.value,
    })
  } finally {
    ntpSaving.value = false
  }
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
      <span class="eyebrow">Setup</span>
      <h1 class="display-face text-3xl font-semibold tracking-tight">
        Time &amp; timezone
      </h1>
      <p class="max-w-xl text-sm text-muted-foreground">
        The display renders times in the device's timezone. The browser stays
        on {{ browserTz }}.
      </p>
    </section>

    <!-- Live clock -->
    <Card>
      <CardHeader>
        <div class="flex items-start justify-between gap-4">
          <div class="flex flex-col gap-1">
            <span class="eyebrow">Live clock</span>
            <CardTitle class="num text-4xl tabular-nums">
              {{ deviceNow }}
            </CardTitle>
            <CardDescription class="num">{{ deviceDate }}</CardDescription>
          </div>
          <span
            class="flex items-center gap-1.5 text-xs"
            :class="
              time.synced.value ? 'text-emerald-500' : 'text-amber-500'
            "
          >
            <span class="status-dot" />
            {{ time.synced.value ? 'NTP synced' : 'NTP not synced' }}
          </span>
        </div>
      </CardHeader>
      <CardContent>
        <dl class="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
          <div class="flex flex-col gap-0.5">
            <dt class="eyebrow">Device zone</dt>
            <dd class="truncate font-medium">
              {{ time.ianaTimezone.value ?? '—' }}
            </dd>
          </div>
          <div class="flex flex-col gap-0.5">
            <dt class="eyebrow">POSIX rule</dt>
            <dd class="num truncate text-xs">
              {{ time.systemConfig.value?.timezone ?? '—' }}
            </dd>
          </div>
          <div class="flex flex-col gap-0.5">
            <dt class="eyebrow">NTP server</dt>
            <dd class="num truncate text-xs">
              {{ time.systemConfig.value?.ntp_server ?? '—' }}
            </dd>
          </div>
          <div class="flex flex-col gap-0.5">
            <dt class="eyebrow">Browser zone</dt>
            <dd class="num truncate text-xs">{{ browserTz }}</dd>
          </div>
        </dl>
      </CardContent>
      <CardFooter>
        <Button variant="ghost" size="sm" @click="time.refresh">
          <RefreshCw />
          Refresh
        </Button>
      </CardFooter>
    </Card>

    <!-- Timezone -->
    <Card>
      <CardHeader>
        <span class="eyebrow">Location</span>
        <CardTitle>Timezone</CardTitle>
        <CardDescription>
          Sets the timezone used for schedule cron evaluation and display
          formatting.
        </CardDescription>
      </CardHeader>
      <CardContent class="flex flex-col gap-4">
        <div
          class="flex items-center justify-between gap-4 rounded-md border border-border bg-muted/30 p-3"
        >
          <div class="flex flex-col">
            <span class="text-sm font-medium">Auto timezone</span>
            <span class="text-xs text-muted-foreground">
              Derive from geolocation. The manual picker below is ignored.
            </span>
          </div>
          <Switch v-model="autoTz" />
        </div>

        <div class="flex flex-col gap-1.5" :class="autoTz ? 'opacity-60' : ''">
          <Label>Manual zone</Label>
          <Dialog v-model:open="pickerOpen">
            <DialogTrigger as-child>
              <Button
                variant="outline"
                class="h-auto w-full justify-between py-2.5 text-left"
                :disabled="autoTz || zonedb.loading.value"
              >
                <span v-if="selectedEntry" class="flex flex-col items-start">
                  <span class="font-medium">{{ selectedEntry.name }}</span>
                  <span class="num text-xs text-muted-foreground">
                    {{ selectedEntry.rule }}
                  </span>
                </span>
                <span v-else-if="zonedb.loading.value" class="text-muted-foreground">
                  Loading zonedb…
                </span>
                <span v-else class="text-muted-foreground">
                  Select a zone…
                </span>
                <ChevronDown class="size-4 shrink-0 text-muted-foreground" />
              </Button>
            </DialogTrigger>
            <DialogContent class="gap-3">
              <DialogHeader>
                <DialogTitle>Select timezone</DialogTitle>
                <DialogDescription>
                  {{ zonedb.zones.value.length }} zones from the IANA database.
                </DialogDescription>
              </DialogHeader>
              <div class="relative">
                <Search
                  class="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                />
                <Input
                  v-model="pickerQuery"
                  placeholder="Filter (e.g. New_York, PST)"
                  class="pl-8"
                />
              </div>
              <div
                class="max-h-[55vh] overflow-y-auto rounded-md border border-border"
              >
                <button
                  v-for="z in filteredZones"
                  :key="z.rule"
                  type="button"
                  class="flex w-full items-center justify-between gap-2 border-b border-border/60 px-3 py-2 text-left text-sm last:border-b-0 hover:bg-muted/60"
                  @click="pickZone(z.rule)"
                >
                  <div class="flex flex-col">
                    <span>{{ z.name }}</span>
                    <span class="num text-xs text-muted-foreground">
                      {{ z.rule }}
                    </span>
                  </div>
                  <Check
                    v-if="z.rule === selectedRule"
                    class="size-4 shrink-0 text-primary"
                  />
                </button>
                <div
                  v-if="!filteredZones.length"
                  class="p-8 text-center text-sm text-muted-foreground"
                >
                  No zones match "{{ pickerQuery }}".
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </CardContent>
      <CardFooter class="justify-end">
        <Button :disabled="!tzDirty || tzSaving" @click="saveTz">
          <Loader2 v-if="tzSaving" class="animate-spin" />
          <Save v-else />
          Save timezone
        </Button>
      </CardFooter>
    </Card>

    <!-- NTP + hostname -->
    <Card>
      <CardHeader>
        <span class="eyebrow">Network</span>
        <CardTitle>NTP &amp; hostname</CardTitle>
        <CardDescription>
          The device re-syncs against the NTP server on boot and periodically
          thereafter.
        </CardDescription>
      </CardHeader>
      <CardContent class="flex flex-col gap-3">
        <div class="flex flex-col gap-1.5 max-w-md">
          <Label for="ntp">NTP server</Label>
          <Input id="ntp" v-model="ntpServer" placeholder="pool.ntp.org" />
        </div>
        <div class="flex flex-col gap-1.5 max-w-md">
          <Label for="hostname">WiFi hostname</Label>
          <Input id="hostname" v-model="hostname" placeholder="splitflap" />
          <p class="text-xs text-muted-foreground">
            Advertised over DHCP and mDNS. 1–63 characters.
          </p>
        </div>
      </CardContent>
      <CardFooter class="justify-end">
        <Button :disabled="!ntpDirty || ntpSaving" @click="saveNtp">
          <Loader2 v-if="ntpSaving" class="animate-spin" />
          <Save v-else />
          Save
        </Button>
      </CardFooter>
    </Card>
  </div>
</template>
