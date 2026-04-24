<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Button,
  Badge,
} from '@/components/ui'
import {
  AlertTriangle,
  Check,
  ChevronLeft,
  Radar,
  RefreshCw,
} from 'lucide-vue-next'
import { useModules } from '@/composables/useModules'
import { useGrid } from '@/composables/useGrid'
import CalibrationModal from './CalibrationModal.vue'

const modules = useModules()
const gridState = useGrid()

onMounted(() => {
  // Fire in background — each fetch is ~500 ms but they run in parallel.
  // Populates info.calibrated so rows can surface calibration state.
  modules.fetchAll().catch(() => {})
})

const selectedUuid = ref<string | null>(null)
const modalOpen = ref(false)

function openForUuid(uuid: string) {
  selectedUuid.value = uuid
  modalOpen.value = true
}

const gridSize = computed(
  () => gridState.grid.value?.grid ?? { width: 0, height: 0 }
)

// Physical flap-module proportions: tall rectangle.
const CELL_W = 50
const CELL_H = 80
const AXIS = 24 // width of the left row-label column / height of the top col-label row

function uuidParts(u: string) {
  return [u.slice(0, 4), u.slice(4, 8), u.slice(8, 12)]
}

// Map of (x,y) → uuid for O(1) cell lookup
const cellIndex = computed(() => {
  const m = new Map<string, string>()
  for (const entry of gridState.grid.value?.mapping ?? []) {
    m.set(`${entry.x},${entry.y}`, entry.uuid)
  }
  return m
})

function moduleAt(x: number, y: number) {
  const uuid = cellIndex.value.get(`${x},${y}`)
  return uuid ? modules.modules.value.find((m) => m.uuid === uuid) : null
}

const unmapped = computed(() =>
  modules.modules.value.filter((m) => !m.grid)
)

const discovering = ref(false)
async function discover() {
  discovering.value = true
  try {
    await modules.discover(false)
  } finally {
    discovering.value = false
  }
}

async function refresh() {
  await modules.refresh()
  modules.fetchAll().catch(() => {})
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
      <div class="flex flex-wrap items-end justify-between gap-4">
        <div class="flex flex-col gap-1">
          <h1 class="display-face text-3xl font-semibold tracking-tight">
            Calibration
          </h1>
          <p class="max-w-xl text-sm text-muted-foreground">
            Pick a module to align its flap offset. Tap a mapped cell on the
            board, or an unmapped module below.
          </p>
        </div>
        <div class="flex items-center gap-2">
          <Button variant="outline" size="sm" @click="refresh">
            <RefreshCw />
            Refresh
          </Button>
          <Button size="sm" :disabled="discovering" @click="discover">
            <Radar :class="discovering ? 'animate-pulse' : ''" />
            Discover
          </Button>
        </div>
      </div>
    </section>

    <!-- Mapped grid -->
    <Card>
      <CardHeader>
        <span class="eyebrow">Mapped modules</span>
        <CardTitle>
          {{ gridSize.width }} × {{ gridSize.height }} board
        </CardTitle>
        <CardDescription>
          Each cell corresponds to a position on the physical display. Empty
          cells have no module mapped.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div
          v-if="gridSize.width && gridSize.height"
          class="-mx-6 overflow-x-auto px-6 sm:mx-0 sm:px-0"
        >
          <div
            class="mx-auto grid w-max gap-1"
            :style="{
              gridTemplateColumns: `${AXIS}px repeat(${gridSize.width}, ${CELL_W}px)`,
              gridTemplateRows: `${AXIS}px repeat(${gridSize.height}, ${CELL_H}px)`,
            }"
          >
            <!-- Top-left corner spacer -->
            <div />
            <!-- Column labels -->
            <div
              v-for="x in gridSize.width"
              :key="`col-${x}`"
              class="num flex items-end justify-center pb-1 text-[10px] text-muted-foreground"
            >
              {{ x - 1 }}
            </div>

            <!-- Rows -->
            <template v-for="y in gridSize.height" :key="`row-${y}`">
              <!-- Row label -->
              <div
                class="num flex items-center justify-end pr-2 text-[10px] text-muted-foreground"
              >
                {{ y - 1 }}
              </div>
              <!-- Cells -->
              <template v-for="x in gridSize.width" :key="`${x}-${y}`">
                <button
                  v-if="moduleAt(x - 1, y - 1)"
                  type="button"
                  :title="
                    `(${x - 1}, ${y - 1}) · ${moduleAt(x - 1, y - 1)!.uuid}` +
                    (moduleAt(x - 1, y - 1)?.info
                      ? moduleAt(x - 1, y - 1)?.info?.calibrated
                        ? ' · calibrated'
                        : ' · not calibrated'
                      : '')
                  "
                  class="relative flex flex-col items-center justify-between gap-1 rounded-sm border border-border bg-muted/40 p-1.5 transition-colors hover:border-primary hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  :class="
                    moduleAt(x - 1, y - 1)?.info &&
                    !moduleAt(x - 1, y - 1)?.info?.calibrated
                      ? 'border-amber-500/60'
                      : ''
                  "
                  @click="openForUuid(moduleAt(x - 1, y - 1)!.uuid)"
                >
                  <span
                    class="status-dot size-1.5!"
                    :class="
                      moduleAt(x - 1, y - 1)?.alive
                        ? 'text-emerald-500'
                        : 'text-amber-500'
                    "
                  />
                  <span
                    class="flex flex-col items-center font-mono text-[10px] leading-tight tracking-tight"
                  >
                    <span
                      v-for="part in uuidParts(moduleAt(x - 1, y - 1)!.uuid)"
                      :key="part"
                    >
                      {{ part }}
                    </span>
                  </span>
                  <Check
                    v-if="moduleAt(x - 1, y - 1)?.info?.calibrated"
                    class="absolute right-0.5 top-0.5 size-2.5 text-emerald-500"
                  />
                  <AlertTriangle
                    v-else-if="
                      moduleAt(x - 1, y - 1)?.info &&
                      !moduleAt(x - 1, y - 1)?.info?.calibrated
                    "
                    class="absolute right-0.5 top-0.5 size-2.5 text-amber-500"
                  />
                </button>
                <div
                  v-else
                  :title="`(${x - 1}, ${y - 1})`"
                  class="rounded-sm border border-dashed border-border/50"
                />
              </template>
            </template>
          </div>
        </div>
        <p v-else class="text-sm text-muted-foreground">
          No grid configured. Set grid size in
          <RouterLink to="/settings/grid" class="text-primary hover:underline">
            grid management
          </RouterLink>
          first.
        </p>
      </CardContent>
    </Card>

    <!-- Unmapped modules -->
    <Card>
      <CardHeader>
        <div class="flex items-center justify-between gap-4">
          <div class="flex flex-col gap-1">
            <span class="eyebrow">Unmapped modules</span>
            <CardTitle>
              {{ unmapped.length }}
              module{{ unmapped.length === 1 ? '' : 's' }} on bus
            </CardTitle>
            <CardDescription>
              Discovered but not placed in the grid. You can still calibrate
              them here.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent class="px-0">
        <div v-if="unmapped.length" class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr
                class="border-b border-border text-xs text-muted-foreground [&>th]:px-4 [&>th]:py-2 [&>th]:text-left"
              >
                <th class="w-10"></th>
                <th>UUID</th>
                <th class="num">Short ID</th>
                <th>Status</th>
                <th>Calibration</th>
                <th class="w-28"></th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="m in unmapped"
                :key="m.uuid"
                class="border-b border-border last:border-b-0 hover:bg-muted/40 [&>td]:px-4 [&>td]:py-3"
              >
                <td>
                  <span
                    class="status-dot"
                    :class="m.alive ? 'text-emerald-500' : 'text-amber-500'"
                  />
                </td>
                <td class="num text-xs">{{ m.uuid }}</td>
                <td class="num text-muted-foreground">{{ m.short_id }}</td>
                <td>
                  <Badge :variant="m.alive ? 'success' : 'warn'">
                    {{ m.alive ? 'alive' : 'quiet' }}
                  </Badge>
                </td>
                <td>
                  <Badge
                    v-if="m.info?.calibrated"
                    variant="success"
                    class="gap-1"
                  >
                    <Check class="size-3" />
                    Done
                  </Badge>
                  <Badge
                    v-else-if="m.info"
                    variant="warn"
                    class="gap-1"
                  >
                    <AlertTriangle class="size-3" />
                    Needed
                  </Badge>
                  <span v-else class="text-xs text-muted-foreground">—</span>
                </td>
                <td>
                  <div class="flex justify-end">
                    <Button
                      variant="outline"
                      size="sm"
                      @click="openForUuid(m.uuid)"
                    >
                      Calibrate
                    </Button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-else class="px-6 py-10 text-center text-sm text-muted-foreground">
          All discovered modules are mapped. Run
          <span class="num">Discover</span> to look for new hardware.
        </div>
      </CardContent>
    </Card>

    <CalibrationModal v-model:open="modalOpen" :uuid="selectedUuid" />
  </div>
</template>
