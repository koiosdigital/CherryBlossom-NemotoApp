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

  // Lightweight beacon fired during `flashing`. Patch the counters in place
  // so the progress bar updates without waiting for the next full snapshot.
  ws.on('bootloader.progress', (ev) => {
    const cur = status.value
    if (!cur) return
    status.value = {
      ...cur,
      state: ev.data.state,
      blocks_sent: ev.data.blocks_sent,
      blocks_acked: ev.data.blocks_acked,
      image_blocks: ev.data.image_blocks,
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

  const progress = computed(() => {
    const s = status.value
    if (!s || !s.image_blocks) return 0
    return Math.min(1, s.blocks_acked / s.image_blocks)
  })

  // UUID → device entry from the pre-OTA snapshot, kept fresh as the WS
  // pushes updates. Empty when no session has ever run.
  const devicesByUuid = computed(() => {
    const m = new Map<string, components['schemas']['BootloaderDevice']>()
    for (const d of status.value?.devices ?? []) m.set(d.uuid, d)
    return m
  })

  async function upload(
    file: File | Blob,
    opts?: { assumeInBl?: boolean }
  ): Promise<UploadResponse> {
    const qs = opts?.assumeInBl ? '?assume_in_bl=1' : ''
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
    progress,
    devicesByUuid,
    refresh: () => load(true),
    upload,
    abort,
    probe,
    enterBootloader,
  }
}
