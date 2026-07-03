import { ref } from 'vue'
import { apiClient } from '@/api'
import type { components } from '@/api.d'
import { useWebsocket } from '@/composables/useWebsocket'

type ModuleSummary = components['schemas']['ModuleSummary']
type ModuleStatus = components['schemas']['ModuleStatus']
type DeviceInfo = components['schemas']['DeviceInfo']
type PersistedConfig = components['schemas']['PersistedConfig']
type ModuleActionRequest = components['schemas']['ModuleActionRequest']

type ModuleEntry = ModuleSummary & {
  status?: ModuleStatus | null
  info?: DeviceInfo | null
  persisted?: PersistedConfig | null
}

// Wire state_code → ModuleStatus.state name. Matches the firmware enum order
// (see CAN_STEPPER_STATE_* in can_protocol.h).
const STATE_NAMES = [
  'idle', 'homing', 'accel', 'cruise', 'decel', 'rehoming', 'error',
] as const

function stateName(code: number): ModuleStatus['state'] {
  return (STATE_NAMES[code] ?? 'unknown') as ModuleStatus['state']
}

const modules = ref<ModuleEntry[]>([])
const loading = ref(false)
const error = ref<string | null>(null)
let loaded = false
let wsBound = false

async function load(force = false) {
  if (loaded && !force) return
  loading.value = true
  error.value = null
  try {
    const { data, error: err } = await apiClient.GET('/api/modules')
    if (err || !data) throw err ?? new Error('modules fetch failed')
    modules.value = data.modules.map((m) => ({ ...m }))
    loaded = true
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    loading.value = false
  }
}

function patch(uuid: string, patchFn: (m: ModuleEntry) => ModuleEntry) {
  const idx = modules.value.findIndex((m) => m.uuid === uuid)
  if (idx < 0) return
  modules.value[idx] = patchFn(modules.value[idx])
}

function bindWs(ws: ReturnType<typeof useWebsocket>) {
  if (wsBound) return
  wsBound = true

  // Always REST-fetch on connect/reconnect — deltas alone can't reconstruct
  // state that changed during the outage.
  ws.onReconnect(() => { load(true) })

  ws.on('md', (uuid, shortId) => {
    const exists = modules.value.find((m) => m.uuid === uuid)
    if (exists) {
      patch(uuid, (m) => ({ ...m, short_id: shortId }))
    } else {
      modules.value = [
        ...modules.value,
        { uuid, short_id: shortId, hw_type: 0x10, assigned: false, alive: true, grid: null },
      ]
    }
  })
  ws.on('ma', (uuid) => patch(uuid, (m) => ({ ...m, alive: true })))
  ws.on('mr', (uuid) => {
    // DEVICE_BOOTED detected — module just rebooted. Clear cached status so
    // consumers don't act on pre-reboot state; the seeder will refill it.
    patch(uuid, (m) => ({ ...m, alive: true, status: null }))
  })
  ws.on('ms', (uuid, state, flap) => {
    // flap == 255 is firmware-guaranteed to mean "not homed yet" — see
    // CAN_StatusResponse.current_flap. step/temp_c aren't on the wire any
    // more; the UI only reads them from explicit REST fetches.
    patch(uuid, (m) => ({
      ...m,
      status: {
        ...(m.status ?? { step: 0, temp_c: 0 }),
        state: stateName(state),
        state_code: state,
        flap: flap === 255 ? null : flap,
        homed: flap !== 255,
      } as ModuleStatus,
    }))
  })
  // Grid changes are large + rare — refetch the full list to re-derive
  // each module's `grid` + `assigned` fields, matching the previous behaviour.
  ws.onTick('grid', () => { load(true) })
}

export function useModules() {
  const ws = useWebsocket()
  bindWs(ws)
  load()

  async function action(uuid: string, body: ModuleActionRequest) {
    const { data, error: err } = await apiClient.POST('/api/modules/{uuid}', {
      params: { path: { uuid } },
      body,
    })
    if (err) throw err
    return data
  }

  async function fetchModule(uuid: string) {
    const { data, error: err } = await apiClient.GET('/api/modules/{uuid}', {
      params: { path: { uuid } },
    })
    if (err || !data) throw err ?? new Error('fetch module failed')
    patch(uuid, (m) => ({
      ...m,
      ...data,
      status: data.status ?? m.status,
      info: data.info ?? m.info,
      persisted: data.persisted ?? m.persisted,
    }))
    return data
  }

  async function fetchAll() {
    const targets = modules.value.map((m) => m.uuid)
    await Promise.allSettled(targets.map((u) => fetchModule(u)))
  }

  async function discover(resetAssignments = false) {
    const { data, error: err } = await apiClient.POST('/api/discover', {
      body: { reset_assignments: resetAssignments },
    })
    if (err) throw err
    return data
  }

  return {
    modules,
    loading,
    error,
    refresh: () => load(true),
    action,
    discover,
    fetchModule,
    fetchAll,
  }
}
