import { ref } from 'vue'
import { apiClient } from '@/api'
import type { components } from '@/api.d'
import { useWebsocket } from '@/composables/useWebsocket'

type Schedule = components['schemas']['Schedule']
type ScheduleBody = components['schemas']['ScheduleBody']

const schedules = ref<Schedule[]>([])
const max = ref(32)
const loading = ref(false)
const error = ref<string | null>(null)
let loaded = false
let wsBound = false

async function load(force = false) {
  if (loaded && !force) return
  loading.value = true
  error.value = null
  try {
    const { data, error: err } = await apiClient.GET('/api/schedules')
    if (err || !data) throw err ?? new Error('schedules fetch failed')
    schedules.value = data.schedules
    max.value = data.max
    loaded = true
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    loading.value = false
  }
}

function patch(id: number, fn: (s: Schedule) => Schedule) {
  const idx = schedules.value.findIndex((s) => s.id === id)
  if (idx < 0) return
  schedules.value = [
    ...schedules.value.slice(0, idx),
    fn(schedules.value[idx]),
    ...schedules.value.slice(idx + 1),
  ]
}

function bindWs(ws: ReturnType<typeof useWebsocket>) {
  if (wsBound) return
  wsBound = true
  // The WS event only carries id, action, blocked_by_quiet — refetch the
  // single record so last_run_ms is accurate without a full list reload.
  ws.on('schedule.fired', (ev) => {
    const id = ev.data.id
    if (ev.data.blocked_by_quiet) return
    apiClient
      .GET('/api/schedules/{id}', { params: { path: { id } } })
      .then(({ data }) => {
        if (data) patch(id, () => data)
      })
      .catch(() => {})
  })
  // Schedules aren't in the welcome payload — pull a fresh list whenever the
  // socket reconnects so anything created or fired during the outage shows up.
  ws.onReconnect(() => {
    load(true).catch(() => {})
  })
}

export function useSchedules() {
  const ws = useWebsocket()
  bindWs(ws)
  load()

  async function create(body: ScheduleBody): Promise<Schedule> {
    const { data, error: err } = await apiClient.POST('/api/schedules', { body })
    if (err || !data) throw err ?? new Error('create failed')
    schedules.value = [...schedules.value, data]
    return data
  }

  async function update(id: number, body: ScheduleBody): Promise<Schedule> {
    const { data, error: err } = await apiClient.PUT('/api/schedules/{id}', {
      params: { path: { id } },
      body,
    })
    if (err || !data) throw err ?? new Error('update failed')
    patch(id, () => data)
    return data
  }

  async function remove(id: number) {
    const { error: err } = await apiClient.DELETE('/api/schedules/{id}', {
      params: { path: { id } },
    })
    if (err) throw err
    schedules.value = schedules.value.filter((s) => s.id !== id)
  }

  async function run(id: number, force = false): Promise<Schedule> {
    const { data, error: err } = await apiClient.POST('/api/schedules/{id}/run', {
      params: { path: { id }, query: force ? { force: '1' } : undefined },
    })
    if (err || !data) throw err ?? new Error('run failed')
    patch(id, () => data)
    return data
  }

  return {
    schedules,
    max,
    loading,
    error,
    refresh: () => load(true),
    create,
    update,
    remove,
    run,
  }
}
