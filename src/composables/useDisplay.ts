import { ref } from 'vue'
import { apiClient } from '@/api'
import type { components } from '@/api.d'
import { useWebsocket } from '@/composables/useWebsocket'

type LastFrame = components['schemas']['LastFrame']

const lastFrame = ref<LastFrame | null>(null)
const currentPresetId = ref<number | null>(null)
const currentPresetName = ref<string | null>(null)
const loading = ref(false)
const error = ref<string | null>(null)
let loaded = false
let wsBound = false

async function load(force = false) {
  if (loaded && !force) return
  loading.value = true
  error.value = null
  try {
    const { data, error: err } = await apiClient.GET('/api/display')
    if (err || !data) throw err ?? new Error('display fetch failed')
    lastFrame.value = data
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
  // Welcome no longer carries display — REST-fetched via load() on mount,
  // and again on reconnect.
  ws.onReconnect(() => { load(true) })
  ws.on('display.frame_sent', (ev) => {
    lastFrame.value = ev.data
  })
  ws.on('display.cell_sent', (ev) => {
    // A single-cell poke means whatever preset was showing is no longer whole.
    currentPresetId.value = null
    currentPresetName.value = null
    const frame = lastFrame.value
    if (!frame?.flaps) return
    const flaps = frame.flaps.map((row) => [...row])
    if (flaps[ev.data.y]) flaps[ev.data.y][ev.data.x] = ev.data.flap
    lastFrame.value = { ...frame, flaps }
  })
}

export function useDisplay() {
  const ws = useWebsocket()
  bindWs(ws)
  load()

  async function showPreset(id: number, name: string) {
    const { error: err } = await apiClient.POST('/api/presets/{id}/show', {
      params: { path: { id } },
    })
    if (err) throw err
    currentPresetId.value = id
    currentPresetName.value = name
  }

  return {
    lastFrame,
    currentPresetId,
    currentPresetName,
    loading,
    error,
    refresh: () => load(true),
    showPreset,
  }
}
