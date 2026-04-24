import { ref } from 'vue'
import { apiClient } from '@/api'
import type { components } from '@/api.d'
import { useWebsocket } from '@/composables/useWebsocket'

type Grid = components['schemas']['Grid']

const grid = ref<Grid | null>(null)
const loading = ref(false)
const error = ref<string | null>(null)
let loaded = false
let wsBound = false

async function load(force = false) {
  if (loaded && !force) return
  loading.value = true
  error.value = null
  try {
    const { data, error: err } = await apiClient.GET('/api/grid')
    if (err || !data) throw err ?? new Error('grid fetch failed')
    grid.value = data
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
  ws.on('welcome', (ev) => {
    grid.value = ev.data.grid
    loaded = true
  })
  ws.on('grid.changed', (ev) => {
    grid.value = ev.data
  })
}

export function useGrid() {
  const ws = useWebsocket()
  bindWs(ws)
  load()

  return {
    grid,
    loading,
    error,
    refresh: () => load(true),
  }
}
