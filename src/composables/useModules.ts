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

  ws.on('welcome', (ev) => {
    modules.value = ev.data.modules.map((m) => ({ ...m }))
    loaded = true
  })
  ws.on('module.discovered', (ev) => {
    const { uuid, short_id, hw_type } = ev.data
    const exists = modules.value.find((m) => m.uuid === uuid)
    if (exists) {
      patch(uuid, (m) => ({ ...m, short_id, hw_type }))
    } else {
      modules.value = [
        ...modules.value,
        { uuid, short_id, hw_type, assigned: false, alive: true, grid: null },
      ]
    }
  })
  ws.on('module.alive', (ev) => patch(ev.data.uuid, (m) => ({ ...m, alive: true })))
  ws.on('module.rebooted', (ev) => {
    // Module just booted — 100 ms detect via DEVICE_BOOTED frame.
    // Status and persisted cache are now stale; clear them so consumers
    // don't act on pre-reboot state. Fresh data will arrive via the next
    // module.status and any consumer calling fetchModule().
    const { uuid } = ev.data
    patch(uuid, (m) => ({
      ...m,
      alive: true,
      status: null,
    }))
  })
  ws.on('module.status', (ev) =>
    patch(ev.data.uuid, (m) => ({ ...m, status: ev.data.status }))
  )
  ws.on('grid.changed', (ev) => {
    const grid = new Map(ev.data.mapping.map((g) => [g.uuid, { x: g.x, y: g.y }]))
    modules.value = modules.value.map((m) => ({
      ...m,
      grid: grid.get(m.uuid) ?? null,
      assigned: grid.has(m.uuid),
    }))
  })
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
