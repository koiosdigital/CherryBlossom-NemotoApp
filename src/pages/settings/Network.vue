<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
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
} from '@/components/ui'
import {
  Check,
  ChevronLeft,
  Copy,
  Loader2,
  RefreshCw,
  Save,
  Wifi,
  WifiLow,
  WifiOff,
} from 'lucide-vue-next'
import { apiClient } from '@/api'
import type { components } from '@/api.d'
import { useTime } from '@/composables/useTime'
import { useToast } from '@/composables/useToast'
import { friendlyError } from '@/lib/errors'

type SystemInfo = components['schemas']['SystemInfo']

const time = useTime()
const { toast } = useToast()

// ---------- system info (read-only) ----------
const systemInfo = ref<SystemInfo | null>(null)
const refreshing = ref(false)

async function loadInfo() {
  refreshing.value = true
  try {
    const { data } = await apiClient.GET('/api/system')
    if (data) systemInfo.value = data
  } finally {
    refreshing.value = false
  }
}

onMounted(loadInfo)

// ---------- signal strength ----------
const signal = computed(() => {
  const r = systemInfo.value?.wifi_rssi
  if (r == null) return { label: 'Offline', icon: WifiOff, variant: 'outline' as const }
  if (r >= -60)
    return { label: 'Excellent', icon: Wifi, variant: 'success' as const }
  if (r >= -70) return { label: 'Good', icon: Wifi, variant: 'success' as const }
  if (r >= -80) return { label: 'Fair', icon: WifiLow, variant: 'warn' as const }
  return { label: 'Weak', icon: WifiLow, variant: 'warn' as const }
})

// ---------- hostname ----------
const hostname = ref('')
const hostnameSaving = ref(false)

watch(
  () => time.systemConfig.value?.wifi_hostname,
  (v) => {
    if (v != null) hostname.value = v
  },
  { immediate: true }
)

const hostnameDirty = computed(
  () =>
    !!time.systemConfig.value &&
    hostname.value !== time.systemConfig.value.wifi_hostname
)

// ---------- copy ----------
const justCopied = ref<string | null>(null)
async function copy(value: string | null | undefined, label: string) {
  if (!value) return
  try {
    await navigator.clipboard.writeText(value)
    justCopied.value = label
    setTimeout(() => {
      if (justCopied.value === label) justCopied.value = null
    }, 1500)
  } catch {
    toast({ title: "Couldn't copy", variant: 'destructive' })
  }
}

async function saveHostname() {
  if (!hostnameDirty.value) return
  hostnameSaving.value = true
  try {
    await time.updateConfig({ wifi_hostname: hostname.value })
    toast({ title: 'Hostname saved', variant: 'success' })
  } catch (e) {
    toast({
      title: "Couldn't save hostname",
      description: friendlyError(e),
      variant: 'destructive',
    })
  } finally {
    hostnameSaving.value = false
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
      <div class="flex flex-wrap items-end justify-between gap-4">
        <div class="flex flex-col gap-1">
          <h1 class="display-face text-3xl font-semibold tracking-tight">
            Network
          </h1>
        </div>
        <Button variant="ghost" size="sm" :disabled="refreshing" @click="loadInfo">
          <Loader2 v-if="refreshing" class="animate-spin" />
          <RefreshCw v-else />
          Refresh
        </Button>
      </div>
    </section>

    <!-- Hostname (editable) -->
    <Card>
      <CardHeader>
        <CardTitle>Hostname</CardTitle>
        <CardDescription>
          The name used to find the display on your network.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div class="flex flex-col gap-1.5 max-w-md">
          <Label for="hostname">Hostname</Label>
          <div class="flex items-center gap-2">
            <Input
              id="hostname"
              v-model="hostname"
              :disabled="!time.systemConfig.value"
              placeholder="splitflap"
            />
            <Button
              :disabled="!hostnameDirty || hostnameSaving"
              @click="saveHostname"
            >
              <Loader2 v-if="hostnameSaving" class="animate-spin" />
              <Save v-else />
              Save
            </Button>
          </div>
          <p class="text-xs text-muted-foreground">1–63 characters.</p>
        </div>
      </CardContent>
    </Card>

    <!-- Connection info (read-only) -->
    <Card>
      <CardHeader>
        <div class="flex items-start justify-between gap-4">
          <div class="flex flex-col gap-1">
            <CardTitle>WiFi</CardTitle>
          </div>
          <Badge :variant="signal.variant" class="gap-1.5">
            <component :is="signal.icon" class="size-3" />
            {{ signal.label }}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <dl
          v-if="systemInfo"
          class="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3"
        >
          <div class="flex flex-col gap-0.5">
            <dt class="text-xs text-muted-foreground">Network</dt>
            <dd class="num truncate">{{ systemInfo.wifi_ssid ?? '—' }}</dd>
          </div>
          <div class="flex flex-col gap-0.5">
            <dt class="text-xs text-muted-foreground">IP address</dt>
            <dd v-if="systemInfo.ip" class="flex items-center gap-1.5">
              <span class="num">{{ systemInfo.ip }}</span>
              <button
                type="button"
                class="rounded-sm p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                :aria-label="`Copy ${systemInfo.ip}`"
                title="Copy"
                @click="copy(systemInfo.ip, 'ip')"
              >
                <Check v-if="justCopied === 'ip'" class="size-3 text-emerald-500" />
                <Copy v-else class="size-3" />
              </button>
            </dd>
            <dd v-else class="num">—</dd>
          </div>
          <div class="flex flex-col gap-0.5">
            <dt class="text-xs text-muted-foreground">Signal</dt>
            <dd class="num">
              {{ systemInfo.wifi_rssi != null ? `${systemInfo.wifi_rssi} dBm` : '—' }}
            </dd>
          </div>
          <div class="flex flex-col gap-0.5 sm:col-span-2">
            <dt class="text-xs text-muted-foreground">MAC address</dt>
            <dd class="num text-xs">{{ systemInfo.mac ?? '—' }}</dd>
          </div>
        </dl>
        <p v-else class="text-sm text-muted-foreground">Loading…</p>
      </CardContent>
      <CardFooter>
        <p class="text-xs text-muted-foreground">
          To switch networks, hold the reset button on the back of the display
          for 5 seconds.
        </p>
      </CardFooter>
    </Card>
  </div>
</template>
