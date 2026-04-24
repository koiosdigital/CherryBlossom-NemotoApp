import { ref, computed, watch } from 'vue'
import { apiClient } from '@/api'
import type { components } from '@/api.d'
import { useZonedb } from '@/composables/useZonedb'

type TimeInfo = components['schemas']['TimeInfo']
type SystemConfig = components['schemas']['SystemConfig']

const time = ref<TimeInfo | null>(null)
const systemConfig = ref<SystemConfig | null>(null)
const loading = ref(false)
const error = ref<string | null>(null)
let loaded = false

async function load(force = false) {
  if (loaded && !force) return
  loading.value = true
  error.value = null
  try {
    const { data: td, error: terr } = await apiClient.GET('/api/time')
    if (terr || !td) throw terr ?? new Error('time fetch failed')
    const { data: cd, error: cerr } = await apiClient.GET('/api/system/config')
    if (cerr || !cd) throw cerr ?? new Error('system config fetch failed')
    time.value = td
    systemConfig.value = cd
    loaded = true
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    loading.value = false
  }
}

export function useTime() {
  const zonedb = useZonedb()
  load()

  const ianaTimezone = computed(() => {
    const rule = systemConfig.value?.timezone
    if (!rule) return null
    return zonedb.findByRule(rule)?.name ?? null
  })

  const synced = computed(() => time.value?.synced ?? false)

  function formatter(opts: Intl.DateTimeFormatOptions) {
    const tz = ianaTimezone.value ?? undefined
    return new Intl.DateTimeFormat(undefined, { ...opts, timeZone: tz })
  }

  function formatTime(date: Date = new Date()) {
    return formatter({ hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(date)
  }

  function formatDateTime(date: Date = new Date()) {
    return formatter({
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date)
  }

  async function updateConfig(patch: components['schemas']['SystemConfigPatch']) {
    const { data, error: err } = await apiClient.POST('/api/system/config', { body: patch })
    if (err) throw err
    if (data) systemConfig.value = { ...systemConfig.value!, ...patch } as SystemConfig
    return data
  }

  // Keep systemConfig in sync when an admin changes TZ via WS — hooked up lazily
  // by consumers via useWebsocket if they care.
  watch(
    () => systemConfig.value?.timezone,
    () => {
      // no-op; recomputed by ianaTimezone
    }
  )

  return {
    time,
    systemConfig,
    synced,
    ianaTimezone,
    loading,
    error,
    refresh: () => load(true),
    formatTime,
    formatDateTime,
    formatter,
    updateConfig,
  }
}
