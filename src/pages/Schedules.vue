<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import {
  Card,
  CardContent,
  Button,
  Badge,
  Switch,
  Separator,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui'
import {
  Calendar,
  Clock,
  Loader2,
  Moon,
  Pencil,
  Play,
  Plus,
  Trash2,
} from 'lucide-vue-next'
import { apiClient } from '@/api'
import type { components } from '@/api.d'
import { useSchedules } from '@/composables/useSchedules'
import { useTime } from '@/composables/useTime'
import { useFlaps } from '@/composables/useFlaps'
import { useToast } from '@/composables/useToast'
import { friendlyError } from '@/lib/errors'
import { describeCron, nextFire, parseCron } from '@/lib/cron'
import ScheduleEditor from '@/components/ScheduleEditor.vue'

type Schedule = components['schemas']['Schedule']
type PresetMeta = components['schemas']['PresetMeta']

const schedules = useSchedules()
const time = useTime()
const flaps = useFlaps()
const { toast } = useToast()

// ---------- live "now" tick for next-fire countdowns ----------
const now = ref(Date.now())
const tickHandle = window.setInterval(() => {
  now.value = Date.now()
}, 1000)
onBeforeUnmount(() => window.clearInterval(tickHandle))

// ---------- presets cache (for label rendering) ----------
const presetsById = ref(new Map<number, PresetMeta>())
async function loadPresets() {
  const { data } = await apiClient.GET('/api/presets')
  if (data) {
    const m = new Map<number, PresetMeta>()
    for (const p of data.presets) m.set(p.id, p)
    presetsById.value = m
  }
}
onMounted(loadPresets)

// ---------- per-schedule derived helpers ----------
function describe(s: Schedule): string {
  try {
    return describeCron(parseCron(s.cron))
  } catch (e) {
    return friendlyError(e, 'invalid schedule')
  }
}

function nextFireAt(s: Schedule): Date | null {
  // Recompute when `now` changes — included as a dep via the closure.
  void now.value
  if (!s.enabled) return null
  try {
    return nextFire(parseCron(s.cron), new Date(), time.ianaTimezone.value ?? undefined)
  } catch {
    return null
  }
}

function untilString(target: Date | null): string {
  if (!target) return ''
  const ms = target.getTime() - now.value
  if (ms < 1000) return 'any moment'
  const sec = Math.floor(ms / 1000)
  if (sec < 60) return `in ${sec}s`
  const min = Math.floor(sec / 60)
  if (min < 60) return `in ${min}m`
  const hr = Math.floor(min / 60)
  const remMin = min % 60
  if (hr < 24) return remMin ? `in ${hr}h ${remMin}m` : `in ${hr}h`
  const day = Math.floor(hr / 24)
  const remHr = hr % 24
  return remHr ? `in ${day}d ${remHr}h` : `in ${day}d`
}

function fmtFireTime(d: Date): string {
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

function fmtLastRun(ms: number): string {
  if (!ms) return 'Never'
  const diff = now.value - ms
  if (diff < 0) return 'just now'
  const sec = Math.floor(diff / 1000)
  if (sec < 60) return `${sec}s ago`
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 48) return `${hr}h ago`
  return time
    .formatter({ month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' })
    .format(new Date(ms))
}

function actionLabel(s: Schedule): string {
  const a = s.action
  if (a.type === 'display_preset') {
    const p = presetsById.value.get(a.preset_id)
    return p ? p.name : `Preset #${a.preset_id}`
  }
  if (a.type === 'display_solid') {
    const f = flaps.byId.value.get(a.flap)
    if (!f) return `Flap ${a.flap}`
    if (f.glyph) return `Flap "${f.glyph}"`
    if (f.color) return `Color ${f.color}`
    return f.label
  }
  return 'Clear display'
}

// ---------- tabs / filtering ----------
const tab = ref<'active' | 'disabled' | 'all'>('active')

const sortedAll = computed(() =>
  [...schedules.schedules.value].sort((a, b) => {
    // Enabled first, then by next fire ascending
    if (a.enabled !== b.enabled) return a.enabled ? -1 : 1
    const an = nextFireAt(a)?.getTime() ?? Infinity
    const bn = nextFireAt(b)?.getTime() ?? Infinity
    return an - bn
  })
)

const visible = computed(() => {
  if (tab.value === 'active') return sortedAll.value.filter((s) => s.enabled)
  if (tab.value === 'disabled') return sortedAll.value.filter((s) => !s.enabled)
  return sortedAll.value
})

const activeCount = computed(
  () => schedules.schedules.value.filter((s) => s.enabled).length
)
const disabledCount = computed(
  () => schedules.schedules.value.filter((s) => !s.enabled).length
)

// ---------- toggle / run / delete ----------
const togglingId = ref<number | null>(null)
async function toggleEnabled(s: Schedule) {
  togglingId.value = s.id
  try {
    await schedules.update(s.id, {
      name: s.name,
      cron: s.cron,
      enabled: !s.enabled,
      obey_quiet_hours: s.obey_quiet_hours,
      action: s.action,
    })
  } catch (e) {
    toast({
      title: "Couldn't update schedule",
      description: friendlyError(e),
      variant: 'destructive',
    })
  } finally {
    togglingId.value = null
  }
}

const runningId = ref<number | null>(null)
async function runNow(s: Schedule, force = false) {
  runningId.value = s.id
  try {
    await schedules.run(s.id, force)
    toast({ title: `Ran "${s.name}"`, variant: 'success' })
  } catch (e) {
    // 423 = quiet hours
    const status = (e as { status?: number })?.status
    if (status === 423 && !force) {
      toast({
        title: 'Blocked by quiet hours',
        description: 'Use Force run to bypass.',
        variant: 'warn',
      })
    } else {
      toast({
        title: "Couldn't run",
        description: friendlyError(e),
        variant: 'destructive',
      })
    }
  } finally {
    runningId.value = null
  }
}

// ---------- editor ----------
const editorOpen = ref(false)
const editorTarget = ref<Schedule | null>(null)
function openNew() {
  if (schedules.schedules.value.length >= schedules.max.value) {
    toast({
      title: 'Schedule limit reached',
      description: `The display holds at most ${schedules.max.value} schedules.`,
      variant: 'warn',
    })
    return
  }
  editorTarget.value = null
  editorOpen.value = true
}
function openEdit(s: Schedule) {
  editorTarget.value = s
  editorOpen.value = true
}

// ---------- delete confirmation ----------
const deleteTarget = ref<Schedule | null>(null)
const deleting = ref(false)
async function confirmDelete() {
  if (!deleteTarget.value) return
  deleting.value = true
  try {
    await schedules.remove(deleteTarget.value.id)
    deleteTarget.value = null
  } catch (e) {
    toast({
      title: "Couldn't delete",
      description: friendlyError(e),
      variant: 'destructive',
    })
  } finally {
    deleting.value = false
  }
}
</script>

<template>
  <div class="flex flex-col gap-6">
    <section class="flex flex-col gap-2">
      <div class="flex flex-wrap items-end justify-between gap-4">
        <div class="flex flex-col gap-1">
          <h1 class="display-face text-3xl font-semibold tracking-tight">
            Schedules
          </h1>
          <p class="max-w-xl text-sm text-muted-foreground">
            Show presets automatically at set times.
          </p>
        </div>
        <Button :disabled="schedules.loading.value" @click="openNew">
          <Plus />
          New schedule
        </Button>
      </div>
    </section>

    <Tabs v-model="tab" default-value="active">
      <TabsList>
        <TabsTrigger value="active">
          Active
          <span class="ml-1 num text-xs text-muted-foreground">
            {{ activeCount }}
          </span>
        </TabsTrigger>
        <TabsTrigger value="disabled">
          Disabled
          <span class="ml-1 num text-xs text-muted-foreground">
            {{ disabledCount }}
          </span>
        </TabsTrigger>
        <TabsTrigger value="all">
          All
          <span class="ml-1 num text-xs text-muted-foreground">
            {{ schedules.schedules.value.length }}
          </span>
        </TabsTrigger>
      </TabsList>

      <TabsContent :value="tab">
        <div class="flex flex-col gap-3">
          <Card v-if="schedules.loading.value">
            <CardContent class="flex justify-center py-10">
              <Loader2 class="size-4 animate-spin text-muted-foreground" />
            </CardContent>
          </Card>

          <Card
            v-for="s in visible"
            v-else
            :key="s.id"
            :class="!s.enabled ? 'opacity-70' : ''"
          >
            <CardContent class="flex flex-wrap items-center gap-4 py-4">
              <div
                class="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary"
              >
                <Clock class="size-5" />
              </div>

              <!-- Title + cadence -->
              <div class="flex min-w-0 flex-1 flex-col">
                <div class="flex flex-wrap items-center gap-2">
                  <span class="truncate font-medium">{{ s.name }}</span>
                  <Badge
                    v-if="!s.obey_quiet_hours"
                    variant="outline"
                    class="gap-1"
                    title="Runs even during quiet hours"
                  >
                    <Moon class="size-3" />
                    Always
                  </Badge>
                </div>
                <div
                  class="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground"
                >
                  <Calendar class="size-3" />
                  <span class="truncate">{{ describe(s) }}</span>
                </div>
                <div class="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-xs">
                  <span
                    v-if="s.enabled && nextFireAt(s)"
                    class="text-muted-foreground"
                  >
                    Next:
                    <span class="num text-foreground">
                      {{ fmtFireTime(nextFireAt(s)!) }}
                    </span>
                    <span class="text-muted-foreground">
                      ({{ untilString(nextFireAt(s)) }})
                    </span>
                  </span>
                  <span
                    v-else-if="!s.enabled"
                    class="text-muted-foreground"
                  >
                    Disabled
                  </span>
                  <span class="text-muted-foreground">
                    Last: {{ fmtLastRun(s.last_run_ms) }}
                  </span>
                </div>
              </div>

              <!-- Action label -->
              <Separator
                orientation="vertical"
                class="mx-1 hidden h-10 sm:block"
              />
              <div class="flex flex-col">
                <span class="text-xs text-muted-foreground">Shows</span>
                <span class="text-sm font-medium">{{ actionLabel(s) }}</span>
              </div>

              <!-- Controls -->
              <div class="ml-auto flex items-center gap-1">
                <Switch
                  :model-value="s.enabled"
                  :disabled="togglingId === s.id"
                  @update:model-value="toggleEnabled(s)"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Run now"
                  title="Run now"
                  :disabled="runningId === s.id"
                  @click="runNow(s)"
                >
                  <Loader2 v-if="runningId === s.id" class="animate-spin" />
                  <Play v-else />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Edit"
                  title="Edit"
                  @click="openEdit(s)"
                >
                  <Pencil />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Delete"
                  title="Delete"
                  @click="deleteTarget = s"
                >
                  <Trash2 />
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card v-if="!schedules.loading.value && !visible.length">
            <CardContent class="flex flex-col items-center gap-2 py-16 text-center">
              <Clock class="size-8 text-muted-foreground" />
              <p class="display-face text-lg">No schedules here</p>
              <p class="text-sm text-muted-foreground">
                {{
                  tab === 'active'
                    ? 'Nothing is set to run automatically.'
                    : tab === 'disabled'
                      ? 'All schedules are active.'
                      : 'Create your first schedule to show a preset on a timer.'
                }}
              </p>
              <Button @click="openNew" class="mt-3">
                <Plus />
                New schedule
              </Button>
            </CardContent>
          </Card>
        </div>
      </TabsContent>
    </Tabs>

    <!-- Editor dialog -->
    <ScheduleEditor
      v-model:open="editorOpen"
      :schedule="editorTarget"
      @saved="loadPresets"
    />

    <!-- Delete confirmation -->
    <Dialog
      :open="deleteTarget !== null"
      @update:open="(v) => !v && (deleteTarget = null)"
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete schedule?</DialogTitle>
          <DialogDescription>
            Removes "{{ deleteTarget?.name }}". This can't be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose as-child>
            <Button variant="ghost">Cancel</Button>
          </DialogClose>
          <Button variant="destructive" :disabled="deleting" @click="confirmDelete">
            <Loader2 v-if="deleting" class="animate-spin" />
            <Trash2 v-else />
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
