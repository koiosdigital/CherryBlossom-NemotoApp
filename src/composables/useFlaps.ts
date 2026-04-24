import { ref, computed } from 'vue'
import { apiClient } from '@/api'
import type { components } from '@/api.d'

type FlapEntry = components['schemas']['FlapEntry']

const flaps = ref<FlapEntry[]>([])
const loading = ref(false)
const error = ref<string | null>(null)
let loaded = false
let inflight: Promise<void> | null = null

async function load(force = false) {
  if (loaded && !force) return
  if (inflight) return inflight
  loading.value = true
  error.value = null
  inflight = (async () => {
    try {
      const { data, error: err } = await apiClient.GET('/api/flaps')
      if (err || !data) throw err ?? new Error('flaps fetch failed')
      flaps.value = data.flaps
      loaded = true
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
    } finally {
      loading.value = false
      inflight = null
    }
  })()
  return inflight
}

export function useFlaps() {
  load()

  const byId = computed(() => {
    const m = new Map<number, FlapEntry>()
    for (const f of flaps.value) m.set(f.id, f)
    return m
  })

  const letters = computed(() =>
    flaps.value.filter((f) => f.type === 'letter')
  )

  const byGlyph = computed(() => {
    const m = new Map<string, number>()
    for (const f of flaps.value) {
      if (f.glyph != null) m.set(f.glyph, f.id)
    }
    return m
  })

  return {
    flaps,
    loading,
    error,
    byId,
    byGlyph,
    letters,
    refresh: () => load(true),
  }
}
