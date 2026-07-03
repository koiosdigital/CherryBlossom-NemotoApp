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
  ws.onReconnect(() => { load(true) })
  ws.onTick('grid', () => { load(true) })
}

// Optimistic mutation wrapper. The local cache updates immediately so the UI
// feels instant; if the API call fails the cache rolls back. The grid is
// auto-persisted to NVS after every successful mutation — there's no separate
// "save" step in the UI.
async function commit<T>(
  optimistic: (current: Grid) => Grid,
  apiCall: () => Promise<T>
): Promise<T> {
  const previous = grid.value
  if (previous) grid.value = optimistic(previous)
  try {
    const result = await apiCall()
    // Persist to NVS. Fire-and-forget here would be tempting for latency, but
    // a power-cycle before save completes would lose the edit — so we await.
    await apiClient.POST('/api/grid/save', {})
    return result
  } catch (e) {
    grid.value = previous
    throw e
  }
}

export function useGrid() {
  const ws = useWebsocket()
  bindWs(ws)
  load()

  async function setSize(width: number, height: number) {
    return commit(
      (g) => ({
        ...g,
        grid: { ...g.grid, width, height },
        mapping: g.mapping.filter((m) => m.x < width && m.y < height),
      }),
      async () => {
        const { error: err } = await apiClient.POST('/api/grid/size', {
          body: { width, height },
        })
        if (err) throw err
      }
    )
  }

  async function assignCell(x: number, y: number, uuid: string) {
    return commit(
      (g) => ({
        ...g,
        mapping: [
          ...g.mapping.filter(
            (m) => !(m.x === x && m.y === y) && m.uuid !== uuid
          ),
          { x, y, uuid },
        ],
      }),
      async () => {
        const { error: err } = await apiClient.PUT('/api/grid/cell', {
          body: { x, y, uuid },
        })
        if (err) throw err
      }
    )
  }

  async function moveCell(
    from: { x: number; y: number },
    to: { x: number; y: number }
  ) {
    return commit(
      (g) => {
        const moved = g.mapping.find(
          (m) => m.x === from.x && m.y === from.y
        )
        if (!moved) return g
        return {
          ...g,
          mapping: [
            ...g.mapping.filter(
              (m) => !(m.x === from.x && m.y === from.y) && !(m.x === to.x && m.y === to.y)
            ),
            { ...moved, x: to.x, y: to.y },
          ],
        }
      },
      async () => {
        const { error: err } = await apiClient.POST('/api/grid/cell/move', {
          body: { from, to },
        })
        if (err) throw err
      }
    )
  }

  async function swapCell(
    a: { x: number; y: number },
    b: { x: number; y: number }
  ) {
    return commit(
      (g) => {
        const ma = g.mapping.find((m) => m.x === a.x && m.y === a.y)
        const mb = g.mapping.find((m) => m.x === b.x && m.y === b.y)
        const next = g.mapping.filter(
          (m) => !(m.x === a.x && m.y === a.y) && !(m.x === b.x && m.y === b.y)
        )
        if (ma) next.push({ ...ma, x: b.x, y: b.y })
        if (mb) next.push({ ...mb, x: a.x, y: a.y })
        return { ...g, mapping: next }
      },
      async () => {
        const { error: err } = await apiClient.POST('/api/grid/cell/swap', {
          body: { a, b },
        })
        if (err) throw err
      }
    )
  }

  async function removeCell(x: number, y: number) {
    return commit(
      (g) => ({
        ...g,
        mapping: g.mapping.filter((m) => !(m.x === x && m.y === y)),
      }),
      async () => {
        const { error: err } = await apiClient.DELETE('/api/grid/cell', {
          body: { x, y },
        })
        if (err) throw err
      }
    )
  }

  async function resetBoard() {
    return commit(
      (g) => ({ ...g, mapping: [] }),
      async () => {
        const { error: err } = await apiClient.POST('/api/grid/reset', {})
        if (err) throw err
      }
    )
  }

  return {
    grid,
    loading,
    error,
    refresh: () => load(true),
    setSize,
    assignCell,
    moveCell,
    swapCell,
    removeCell,
    resetBoard,
  }
}
