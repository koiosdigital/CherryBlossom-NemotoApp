import { ref, computed } from 'vue'
import { apiClient, API_BASE } from '@/api'
import type { components } from '@/api.d'
import { useWebsocket } from '@/composables/useWebsocket'

type BootloaderStatus = components['schemas']['BootloaderStatus']
type UploadResponse = components['schemas']['BootloaderUploadResponse']
type BootloaderState = components['schemas']['BootloaderState']

const TERMINAL_STATES: BootloaderState[] = ['idle', 'success', 'failed', 'aborted']

const status = ref<BootloaderStatus | null>(null)
const loading = ref(false)
const error = ref<string | null>(null)
let loaded = false
let wsBound = false

async function load(force = false) {
  if (loaded && !force) return
  loading.value = true
  error.value = null
  try {
    const { data, error: err } = await apiClient.GET('/api/bootloader')
    if (err || !data) throw err ?? new Error('bootloader fetch failed')
    status.value = data
    loaded = true
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    loading.value = false
  }
}

function bindWs(ws: ReturnType<typeof useWebsocket>) {
  if (wsBound) return
  wsBound = true

  ws.on('bootloader.state_changed', (ev) => {
    status.value = ev.data
    loaded = true
  })

  // Lightweight beacon fired during `flashing`. Patch the per-device
  // counters in place so the progress bar updates without waiting for
  // the next full snapshot.
  ws.on('bootloader.progress', (ev) => {
    const cur = status.value
    if (!cur) return
    status.value = {
      ...cur,
      state: ev.data.state,
      current_short_id: ev.data.current_short_id,
      current_blocks_sent: ev.data.current_blocks_sent,
      current_blocks_acked: ev.data.current_blocks_acked,
      image_blocks: ev.data.image_blocks,
      devices_done: ev.data.devices_done,
      devices_failed: ev.data.devices_failed,
      devices_total: ev.data.devices_total,
    }
  })
  // Resync after a reconnect so an OTA that started or finished during the
  // outage shows up correctly.
  ws.onReconnect(() => {
    load(true).catch(() => {})
  })
}

export function useBootloader() {
  const ws = useWebsocket()
  bindWs(ws)
  load()

  const isActive = computed(() => {
    const s = status.value?.state
    return !!s && !TERMINAL_STATES.includes(s)
  })

  // Per-device progress (0..1) for the device currently being flashed.
  // Falls back to fleet-level done/total when no specific device is the
  // focus (e.g. between devices, or in non-`flashing` states).
  const currentDeviceProgress = computed(() => {
    const s = status.value
    if (!s || !s.image_blocks) return 0
    if (s.current_short_id === 0) return 0
    return Math.min(1, s.current_blocks_acked / s.image_blocks)
  })

  // Fleet-level progress (0..1): devices_done / devices_total. While a
  // device is mid-flash, we add its fractional progress so the bar
  // advances smoothly rather than stepping per-device.
  const fleetProgress = computed(() => {
    const s = status.value
    if (!s || !s.devices_total) return 0
    const finished = s.devices_done + s.devices_failed
    const inFlight =
      s.current_short_id !== 0 && s.image_blocks
        ? Math.min(1, s.current_blocks_acked / s.image_blocks)
        : 0
    return Math.min(1, (finished + inFlight) / s.devices_total)
  })

  // UUID → device entry, kept fresh as the WS pushes updates.
  const devicesByUuid = computed(() => {
    const m = new Map<string, components['schemas']['BootloaderDevice']>()
    for (const d of status.value?.devices ?? []) m.set(d.uuid, d)
    return m
  })

  // short_id → device entry, useful for finding the currently-flashing
  // device by its `current_short_id`.
  const deviceByShortId = computed(() => {
    const m = new Map<number, components['schemas']['BootloaderDevice']>()
    for (const d of status.value?.devices ?? []) m.set(d.short_id, d)
    return m
  })

  // Convenience: which device is being flashed right now (or null).
  const currentDevice = computed(() => {
    const s = status.value
    if (!s || s.current_short_id === 0) return null
    return deviceByShortId.value.get(s.current_short_id) ?? null
  })

  async function upload(
    file: File | Blob,
    opts?: { assumeInBl?: boolean; shortId?: number }
  ): Promise<UploadResponse> {
    const params = new URLSearchParams()
    if (opts?.shortId !== undefined) {
      params.set('short_id', String(opts.shortId))
    } else if (opts?.assumeInBl) {
      params.set('assume_in_bl', '1')
    }
    const qs = params.toString() ? `?${params}` : ''
    const res = await fetch(`${API_BASE}/api/bootloader/upload${qs}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: file,
    })
    const raw = await res.text()
    let body: unknown = raw
    try {
      body = JSON.parse(raw)
    } catch {
      /* keep raw text — error responses on this endpoint are text/plain */
    }
    if (!res.ok) {
      const detail =
        typeof body === 'string'
          ? body
          : (body as { error?: string })?.error ?? `HTTP ${res.status}`
      throw new Error(detail)
    }
    return body as UploadResponse
  }

  async function abort() {
    const { data, error: err } = await apiClient.POST('/api/bootloader/abort', {})
    if (err) throw err
    return data
  }

  async function probe() {
    const { data, error: err } = await apiClient.POST('/api/bootloader/probe', {})
    if (err) throw err
    return data
  }

  async function enterBootloader() {
    const { data, error: err } = await apiClient.POST('/api/bootloader/enter', {})
    if (err) throw err
    return data
  }

  return {
    status,
    loading,
    error,
    isActive,
    currentDeviceProgress,
    fleetProgress,
    currentDevice,
    devicesByUuid,
    deviceByShortId,
    refresh: () => load(true),
    upload,
    abort,
    probe,
    enterBootloader,
  }
}
