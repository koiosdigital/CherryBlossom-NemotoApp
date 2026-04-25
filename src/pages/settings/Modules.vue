<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
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
  Label,
  Switch,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui'
import {
  AlertTriangle,
  Check,
  ChevronLeft,
  FileUp,
  Loader2,
  Octagon,
  Radar,
  RefreshCw,
  Rocket,
  Upload,
  Zap,
} from 'lucide-vue-next'
import { useModules } from '@/composables/useModules'
import { useBootloader } from '@/composables/useBootloader'
import { useToast } from '@/composables/useToast'
import type { components } from '@/api.d'

type BootloaderState = components['schemas']['BootloaderState']
type BootloaderFailReason = components['schemas']['BootloaderFailReason']

const modules = useModules()
const bootloader = useBootloader()
const { toast } = useToast()

onMounted(() => {
  // Populate `info.fw` for every module so the list shows current versions.
  // Each fetch is a CAN round-trip; they run in parallel and the list updates
  // incrementally as results land.
  modules.fetchAll().catch(() => {})
})

// ---------- module list ----------
const sortedModules = computed(() =>
  [...modules.modules.value].sort((a, b) => a.short_id - b.short_id)
)

// ---------- friendly labels ----------
const STATE_LABEL: Record<BootloaderState, string> = {
  idle: 'Idle',
  arming: 'Waking up modules',
  connecting: 'Connecting',
  flashing: 'Updating',
  finalizing: 'Wrapping up',
  rediscover: 'Waiting for restart',
  success: 'Done',
  failed: 'Failed',
  aborted: 'Cancelled',
}

const STATE_VARIANT: Record<BootloaderState, 'default' | 'success' | 'warn' | 'destructive' | 'outline' | 'secondary'> = {
  idle: 'outline',
  arming: 'secondary',
  connecting: 'secondary',
  flashing: 'default',
  finalizing: 'default',
  rediscover: 'secondary',
  success: 'success',
  failed: 'destructive',
  aborted: 'warn',
}

const FAIL_LABEL: Record<BootloaderFailReason, string> = {
  none: '',
  no_bootloaders: 'No modules responded.',
  block_ack_timeout: 'A module stopped responding part way through.',
  block_nacked: 'A module rejected the firmware.',
  eof_failed: "A module didn't confirm the end of the file.",
  complete_failed: "Couldn't tell modules to restart.",
  invalid_image: "That file doesn't look like valid firmware.",
  aborted_by_user: 'You cancelled the update.',
  internal: 'Something went wrong on the display.',
}

const progressPct = computed(() => Math.round(bootloader.progress.value * 100))

const showSessionCard = computed(() => bootloader.isActive.value)

// ---------- file picker ----------
const fileInput = ref<HTMLInputElement | null>(null)
const file = ref<File | null>(null)
const assumeInBl = ref(false)

function pickFile() {
  fileInput.value?.click()
}

function onFileChange(e: Event) {
  const input = e.target as HTMLInputElement
  file.value = input.files?.[0] ?? null
}

function clearFile() {
  file.value = null
  if (fileInput.value) fileInput.value.value = ''
}

// ---------- actions ----------
const uploading = ref(false)
const probing = ref(false)
const entering = ref(false)
const aborting = ref(false)
const confirmFlashOpen = ref(false)

async function startFlash() {
  if (!file.value) return
  confirmFlashOpen.value = false
  uploading.value = true
  try {
    const res = await bootloader.upload(file.value, {
      assumeInBl: assumeInBl.value,
    })
    if (!res.ok) {
      toast({
        title: 'File rejected',
        description: res.error,
        variant: 'destructive',
      })
      return
    }
    toast({
      title: `Updating to ${res.fw}`,
      variant: 'success',
    })
  } catch (e) {
    toast({
      title: "Couldn't start update",
      description: e instanceof Error ? e.message : String(e),
      variant: 'destructive',
    })
  } finally {
    uploading.value = false
  }
}

async function runProbe() {
  probing.value = true
  try {
    const r = await bootloader.probe()
    if (!r) return
    toast({
      title: r.any_in_bootloader
        ? 'A module is ready to update'
        : 'No modules ready to update',
      variant: r.any_in_bootloader ? 'success' : 'warn',
    })
  } catch (e) {
    toast({
      title: "Couldn't check",
      description: e instanceof Error ? e.message : String(e),
      variant: 'destructive',
    })
  } finally {
    probing.value = false
  }
}

async function runEnter() {
  entering.value = true
  try {
    const r = await bootloader.enterBootloader()
    toast({
      title: r?.ok
        ? 'Modules switching to update mode'
        : "Couldn't switch modes",
      variant: r?.ok ? 'success' : 'destructive',
    })
  } catch (e) {
    toast({
      title: "Couldn't switch modes",
      description: e instanceof Error ? e.message : String(e),
      variant: 'destructive',
    })
  } finally {
    entering.value = false
  }
}

async function runAbort() {
  aborting.value = true
  try {
    const r = await bootloader.abort()
    toast({
      title: r?.ok ? 'Cancelling update' : 'Nothing to cancel',
      variant: r?.ok ? 'warn' : 'default',
    })
  } catch (e) {
    toast({
      title: "Couldn't cancel",
      description: e instanceof Error ? e.message : String(e),
      variant: 'destructive',
    })
  } finally {
    aborting.value = false
  }
}

function refreshAll() {
  bootloader.refresh()
  modules.fetchAll().catch(() => {})
}

// ---------- per-module session overlay ----------
function deviceEntry(uuid: string) {
  return bootloader.devicesByUuid.value.get(uuid) ?? null
}

function fmtSize(bytes: number) {
  if (!bytes) return '—'
  if (bytes < 1024) return `${bytes} B`
  return `${(bytes / 1024).toFixed(1)} KB`
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
            Modules
          </h1>
          <p class="max-w-xl text-sm text-muted-foreground">
            Every module on the display and their firmware versions.
          </p>
        </div>
        <Button variant="ghost" size="sm" @click="refreshAll">
          <RefreshCw />
          Refresh
        </Button>
      </div>
    </section>

    <!-- Active update card (only while running) -->
    <Card v-if="showSessionCard && bootloader.status.value">
      <CardHeader>
        <div class="flex items-start justify-between gap-4">
          <div class="flex flex-col gap-1">
            <CardTitle>
              {{ STATE_LABEL[bootloader.status.value.state] }}
            </CardTitle>
            <CardDescription>
              Don't power off the display until this finishes.
            </CardDescription>
          </div>
          <Badge :variant="STATE_VARIANT[bootloader.status.value.state]">
            {{ STATE_LABEL[bootloader.status.value.state] }}
          </Badge>
        </div>
      </CardHeader>
      <CardContent class="flex flex-col gap-4">
        <div
          v-if="bootloader.status.value.image_blocks > 0"
          class="flex flex-col gap-2"
        >
          <div class="flex items-baseline justify-between text-xs text-muted-foreground">
            <span>{{ bootloader.status.value.message || 'Working…' }}</span>
            <span class="num">{{ progressPct }}%</span>
          </div>
          <div class="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              class="h-full bg-primary transition-[width] duration-200"
              :style="{ width: `${progressPct}%` }"
            />
          </div>
        </div>

        <dl
          v-if="bootloader.status.value.fw"
          class="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3"
        >
          <div class="flex flex-col gap-0.5">
            <dt class="text-xs text-muted-foreground">New version</dt>
            <dd class="num">{{ bootloader.status.value.fw }}</dd>
          </div>
          <div class="flex flex-col gap-0.5">
            <dt class="text-xs text-muted-foreground">File size</dt>
            <dd class="num">{{ fmtSize(bootloader.status.value.image_size) }}</dd>
          </div>
          <div class="flex flex-col gap-0.5">
            <dt class="text-xs text-muted-foreground">Modules updated</dt>
            <dd class="num">
              {{ bootloader.status.value.post_ota_back }} /
              {{ bootloader.status.value.pre_ota_assigned }}
            </dd>
          </div>
        </dl>
      </CardContent>
      <CardFooter class="justify-end">
        <Button
          variant="destructive"
          size="sm"
          :disabled="aborting"
          @click="runAbort"
        >
          <Loader2 v-if="aborting" class="animate-spin" />
          <Octagon v-else />
          Cancel update
        </Button>
      </CardFooter>
    </Card>

    <!-- Failure summary (only while terminal-failed and we're already done) -->
    <Card
      v-else-if="
        bootloader.status.value?.state === 'failed' &&
        bootloader.status.value.fail_reason !== 'none'
      "
      class="border-destructive/40"
    >
      <CardHeader>
        <CardTitle>Update failed</CardTitle>
        <CardDescription>
          {{ FAIL_LABEL[bootloader.status.value.fail_reason] }}
          You can try again with the same file.
        </CardDescription>
      </CardHeader>
    </Card>

    <!-- Update card -->
    <Card>
      <CardHeader>
        <CardTitle>Update firmware</CardTitle>
        <CardDescription>
          Updates every module at once. The display goes dark for about 30
          seconds.
        </CardDescription>
      </CardHeader>
      <CardContent class="flex flex-col gap-4">
        <input
          ref="fileInput"
          type="file"
          accept=".bin,application/octet-stream"
          class="hidden"
          @change="onFileChange"
        />
        <div
          class="flex flex-col items-stretch gap-3 rounded-md border border-dashed border-border bg-muted/30 p-4 sm:flex-row sm:items-center"
        >
          <div class="flex min-w-0 flex-1 items-center gap-3">
            <span
              class="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary"
            >
              <FileUp class="size-5" />
            </span>
            <div class="flex min-w-0 flex-col">
              <span class="truncate text-sm font-medium">
                {{ file?.name ?? 'No file selected' }}
              </span>
              <span class="text-xs text-muted-foreground">
                {{ file ? fmtSize(file.size) : 'Pick a .bin firmware file' }}
              </span>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <Button
              v-if="file"
              variant="ghost"
              size="sm"
              :disabled="uploading || bootloader.isActive.value"
              @click="clearFile"
            >
              Clear
            </Button>
            <Button
              variant="outline"
              size="sm"
              :disabled="uploading || bootloader.isActive.value"
              @click="pickFile"
            >
              <Upload />
              Choose file
            </Button>
          </div>
        </div>

        <details class="group rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-sm">
          <summary
            class="cursor-pointer list-none text-xs text-muted-foreground hover:text-foreground"
          >
            Advanced options
          </summary>
          <div class="mt-3 flex flex-col gap-3">
            <div class="flex flex-col gap-1">
              <div class="flex items-center gap-2">
                <Switch id="assume_bl" v-model="assumeInBl" />
                <Label for="assume_bl" class="cursor-pointer">
                  Skip wake-up step
                </Label>
              </div>
              <p class="ml-10 text-xs text-muted-foreground">
                Use this if a module is stuck without firmware. Otherwise leave
                it off.
              </p>
            </div>
            <div class="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                :disabled="probing || bootloader.isActive.value"
                @click="runProbe"
              >
                <Loader2 v-if="probing" class="animate-spin" />
                <Radar v-else />
                Check for ready modules
              </Button>
              <Button
                variant="outline"
                size="sm"
                :disabled="entering || bootloader.isActive.value"
                @click="runEnter"
              >
                <Loader2 v-if="entering" class="animate-spin" />
                <Zap v-else />
                Put modules in update mode
              </Button>
            </div>
          </div>
        </details>
      </CardContent>
      <CardFooter class="justify-end">
        <Dialog v-model:open="confirmFlashOpen">
          <Button
            :disabled="!file || uploading || bootloader.isActive.value"
            @click="confirmFlashOpen = true"
          >
            <Loader2 v-if="uploading" class="animate-spin" />
            <Rocket v-else />
            Update all modules
          </Button>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Update every connected module?</DialogTitle>
              <DialogDescription>
                The display will go dark for about 30 seconds. Any module that
                doesn't respond keeps its current firmware — just run the
                update again to catch them.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose as-child>
                <Button variant="ghost">Cancel</Button>
              </DialogClose>
              <Button :disabled="uploading" @click="startFlash">
                <Loader2 v-if="uploading" class="animate-spin" />
                <Rocket v-else />
                Update now
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardFooter>
    </Card>

    <!-- Module inventory -->
    <Card>
      <CardHeader>
        <CardTitle>
          {{ sortedModules.length }} module{{ sortedModules.length === 1 ? '' : 's' }}
        </CardTitle>
      </CardHeader>
      <CardContent class="px-0">
        <div
          v-if="sortedModules.length"
          class="max-h-[28rem] overflow-y-auto"
        >
          <table class="w-full text-sm">
            <thead
              class="sticky top-0 z-10 border-b border-border bg-card text-xs text-muted-foreground"
            >
              <tr class="[&>th]:px-4 [&>th]:py-2 [&>th]:text-left">
                <th class="w-10"></th>
                <th class="num w-20">ID</th>
                <th>Module</th>
                <th>Position</th>
                <th>Firmware</th>
                <th>Last update</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="m in sortedModules"
                :key="m.uuid"
                class="border-b border-border last:border-b-0 hover:bg-muted/40 [&>td]:px-4 [&>td]:py-2.5"
              >
                <td>
                  <span
                    class="status-dot"
                    :class="m.alive ? 'text-emerald-500' : 'text-amber-500'"
                    :title="m.alive ? 'Online' : 'Offline'"
                  />
                </td>
                <td class="num text-muted-foreground">{{ m.short_id }}</td>
                <td>
                  <span class="num text-xs">{{ m.uuid }}</span>
                </td>
                <td>
                  <span v-if="m.grid" class="num text-xs text-muted-foreground">
                    ({{ m.grid.x }}, {{ m.grid.y }})
                  </span>
                  <span v-else class="text-xs text-muted-foreground">—</span>
                </td>
                <td>
                  <span v-if="m.info?.fw" class="num">{{ m.info.fw }}</span>
                  <span v-else class="text-xs text-muted-foreground">unknown</span>
                </td>
                <td>
                  <template v-if="deviceEntry(m.uuid)">
                    <Badge
                      v-if="deviceEntry(m.uuid)!.came_back"
                      variant="success"
                      class="gap-1"
                    >
                      <Check class="size-3" />
                      <span class="num">{{ deviceEntry(m.uuid)!.new_fw ?? 'updated' }}</span>
                    </Badge>
                    <Badge
                      v-else-if="bootloader.isActive.value"
                      variant="secondary"
                      class="gap-1"
                    >
                      <Loader2 class="size-3 animate-spin" />
                      Updating
                    </Badge>
                    <Badge v-else variant="warn" class="gap-1">
                      <AlertTriangle class="size-3" />
                      Didn't come back
                    </Badge>
                  </template>
                  <span v-else class="text-xs text-muted-foreground">—</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div
          v-else
          class="px-6 py-10 text-center text-sm text-muted-foreground"
        >
          No modules found. Try
          <RouterLink
            to="/settings/calibration"
            class="text-primary hover:underline"
          >
            running discovery
          </RouterLink>
          first.
        </div>
      </CardContent>
    </Card>
  </div>
</template>
