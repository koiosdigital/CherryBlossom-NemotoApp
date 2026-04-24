import { ref, computed } from 'vue'
import { apiClient } from '@/api'
import type { components } from '@/api.d'

type TimezoneEntry = components['schemas']['TimezoneEntry']

const zones = ref<TimezoneEntry[]>([])
const loading = ref(false)
const error = ref<string | null>(null)
let inflight: Promise<void> | null = null

async function load() {
  if (zones.value.length) return
  if (inflight) return inflight
  loading.value = true
  error.value = null
  inflight = (async () => {
    try {
      const { data, error: err } = await apiClient.GET('/api/time/zonedb')
      if (err || !data) throw err ?? new Error('zonedb fetch failed')
      zones.value = data
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
    } finally {
      loading.value = false
      inflight = null
    }
  })()
  return inflight
}

export function useZonedb() {
  load()

  const byRule = computed(() => {
    const m = new Map<string, TimezoneEntry>()
    for (const z of zones.value) m.set(z.rule, z)
    return m
  })
  const byName = computed(() => {
    const m = new Map<string, TimezoneEntry>()
    for (const z of zones.value) m.set(z.name, z)
    return m
  })

  return {
    zones,
    loading,
    error,
    refresh: () => {
      zones.value = []
      return load()
    },
    findByRule: (rule: string) => byRule.value.get(rule) ?? null,
    findByName: (name: string) => byName.value.get(name) ?? null,
  }
}
