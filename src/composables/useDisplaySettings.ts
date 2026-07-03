import { ref } from 'vue'
import { apiClient } from '@/api'
import type { components } from '@/api.d'
import { useWebsocket } from '@/composables/useWebsocket'

type DisplaySettings = components['schemas']['DisplaySettings']
type DisplaySettingsPatch = components['schemas']['DisplaySettingsPatch']
type EffectDef = components['schemas']['EffectDef']

const settings = ref<DisplaySettings | null>(null)
const effects = ref<EffectDef[]>([])
const loading = ref(false)
const error = ref<string | null>(null)
let loaded = false
let effectsLoaded = false
let wsBound = false

async function load(force = false) {
  if (loaded && !force) return
  loading.value = true
  error.value = null
  try {
    const { data, error: err } = await apiClient.GET('/api/display/settings')
    if (err || !data) throw err ?? new Error('display settings fetch failed')
    settings.value = data
    loaded = true
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    loading.value = false
  }
}

async function loadEffects() {
  if (effectsLoaded) return
  const { data } = await apiClient.GET('/api/display/effects')
  if (data) {
    effects.value = data.effects
    effectsLoaded = true
  }
}

function bindWs(ws: ReturnType<typeof useWebsocket>) {
  if (wsBound) return
  wsBound = true
  ws.onReconnect(() => { load(true) })
  ws.onTick('display.cfg', () => { load(true) })
}

export function useDisplaySettings() {
  const ws = useWebsocket()
  bindWs(ws)
  load()
  loadEffects()

  async function update(patch: DisplaySettingsPatch): Promise<DisplaySettings> {
    const previous = settings.value
    if (previous) settings.value = { ...previous, ...patch } as DisplaySettings
    try {
      const { data, error: err } = await apiClient.POST('/api/display/settings', {
        body: patch,
      })
      if (err || !data) throw err ?? new Error('update failed')
      settings.value = data
      return data
    } catch (e) {
      settings.value = previous
      throw e
    }
  }

  return {
    settings,
    effects,
    loading,
    error,
    refresh: () => load(true),
    update,
  }
}
