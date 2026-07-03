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
  ws.onReconnect(() => { load(true) })
  // Full-frame push (preset / render): refetch but keep currentPresetId,
  // since the caller (showPreset) sets it explicitly.
  ws.onTick('display', () => { load(true) })
  // Single-cell poke: the preset is no longer pristine, clear it.
  ws.onTick('display.cell', () => {
    currentPresetId.value = null
    currentPresetName.value = null
    load(true)
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
