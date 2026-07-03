import { onBeforeUnmount, ref } from 'vue'
import { API_BASE } from '@/api'

// ============================================================================
// WS protocol — read-only state stream (server -> client only, plus pings).
//
// Every wire message is a JSON array of inner arrays:
//
//   [["ms","B3FC0BEEA240",3,5],["t","display"]]
//
// Two inner-array categories:
//
//   DELTA — small, frequent state updates.
//     ["ms", uuid, state_code, flap]   module status     -> on('ms', cb)
//     ["ma", uuid]                     module alive      -> on('ma', cb)
//     ["mr", uuid]                     module rebooted   -> on('mr', cb)
//     ["md", uuid, short_id]           module discovered -> on('md', cb)
//     ["bp", sent, acked, done, total] bootloader prog   -> on('bp', cb)
//
//   TICK — "this REST resource changed, refetch if you care".
//     ["t", "display"]                                   -> onTick('display', cb)
//     ["t", "display.cfg"]                               -> onTick('display.cfg', cb)
//     ["t", "grid"]                                      -> onTick('grid', cb)
//     ["t", "bootloader"]                                -> onTick('bootloader', cb)
//     ["t", "presets"]                                   -> onTick('presets', cb)
//     ["t", "settings"]                                  -> onTick('settings', cb)
//     ["t", "quiet_hours"]                               -> onTick('quiet_hours', cb)
//     ["t", "schedule", <id>]                            -> onTick('schedule', cb)
//
// All control / mutation goes through REST. This socket never receives
// commands from us — only outbound pings (server replies with ["pong", ts]).
// ============================================================================

const WS_URL = `${API_BASE.replace(/^http/, 'ws')}/api/ws`

// ---- Delta event types -----------------------------------------------------

type DeltaHandlers = {
  ms: (uuid: string, state: number, flap: number) => void
  ma: (uuid: string) => void
  mr: (uuid: string) => void
  md: (uuid: string, shortId: number) => void
  bp: (blocksSent: number, blocksAcked: number, devicesDone: number, devicesTotal: number) => void
}

type DeltaCode = keyof DeltaHandlers

// ---- Tick event types ------------------------------------------------------

type TickResource =
  | 'display'        // full frame pushed (preset, render)
  | 'display.cell'   // single-cell poke (manual flap)
  | 'display.cfg'    // settings (effect / delay / cycle)
  | 'grid'
  | 'bootloader'
  | 'presets'
  | 'settings'
  | 'quiet_hours'

type TickHandler = () => void
type ScheduleTickHandler = (id: number) => void

// ---- Internal state --------------------------------------------------------

const deltaBuckets = new Map<DeltaCode, Set<(...args: unknown[]) => void>>()
const tickBuckets  = new Map<TickResource, Set<TickHandler>>()
const scheduleBucket = new Set<ScheduleTickHandler>()
const reconnectListeners = new Set<() => void>()

let socket: WebSocket | null = null
let backoff = 0
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let visibilityWired = false

const connected = ref(false)
const everConnected = ref(false)
const reconnectAttempts = ref(0)

// ---- Dispatch --------------------------------------------------------------

function dispatchInner(arr: unknown[]) {
  if (!Array.isArray(arr) || arr.length === 0) return
  const code = arr[0]
  if (typeof code !== 'string') return

  if (code === 't') {
    const resource = arr[1]
    if (typeof resource !== 'string') return
    if (resource === 'schedule') {
      const id = arr[2]
      if (typeof id === 'number') scheduleBucket.forEach((h) => h(id))
      return
    }
    const bucket = tickBuckets.get(resource as TickResource)
    if (bucket) bucket.forEach((h) => h())
    return
  }

  // Server keepalive reply — ignore.
  if (code === 'pong') return

  const bucket = deltaBuckets.get(code as DeltaCode)
  if (!bucket) return
  // Rest of arr are the handler's positional args.
  const args = arr.slice(1)
  bucket.forEach((h) => h(...args))
}

function dispatch(raw: unknown) {
  if (!Array.isArray(raw)) return
  // A batch is an array of arrays; a single inner event is itself an array.
  // Distinguish by inspecting the first element: if it's an array, this is
  // a batch; otherwise it's one inner event.
  if (raw.length > 0 && Array.isArray(raw[0])) {
    for (const inner of raw) dispatchInner(inner as unknown[])
  } else {
    dispatchInner(raw as unknown[])
  }
}

// ---- Connection ------------------------------------------------------------

function connect() {
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) return

  socket = new WebSocket(WS_URL)
  socket.onopen = () => {
    const wasReconnect = everConnected.value
    backoff = 0
    reconnectAttempts.value = 0
    connected.value = true
    everConnected.value = true
    if (wasReconnect) {
      // Composables refetch their REST snapshot here, since deltas alone
      // won't catch state that changed during the outage.
      reconnectListeners.forEach((fn) => {
        try { fn() } catch { /* one bad listener shouldn't poison the rest */ }
      })
    }
  }
  socket.onmessage = (msg) => {
    let raw: unknown
    try { raw = JSON.parse(msg.data) } catch { return }
    dispatch(raw)
  }
  socket.onclose = () => {
    socket = null
    connected.value = false
    scheduleReconnect()
  }
  socket.onerror = () => { socket?.close() }
}

function scheduleReconnect() {
  if (reconnectTimer) return
  // Local-network backoff: 500ms, 1s, 2s, 4s, then cap at 5s.
  const delay = Math.min(500 * 2 ** Math.min(backoff, 3), 5000)
  backoff += 1
  reconnectAttempts.value = backoff
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    connect()
  }, delay)
}

function forceReconnect() {
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null }
  backoff = 0
  reconnectAttempts.value = 0
  if (socket && socket.readyState !== WebSocket.OPEN) {
    try { socket.close() } catch { /* already closed */ }
    socket = null
  }
  connect()
}

function wireVisibility() {
  if (visibilityWired || typeof document === 'undefined') return
  visibilityWired = true
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && !connected.value) forceReconnect()
  })
  if (typeof window !== 'undefined') {
    window.addEventListener('online', () => {
      if (!connected.value) forceReconnect()
    })
  }
}

// ---- Public API ------------------------------------------------------------

export function useWebsocket() {
  wireVisibility()
  connect()

  const disposers: Array<() => void> = []

  function on<C extends DeltaCode>(code: C, handler: DeltaHandlers[C]): () => void {
    let bucket = deltaBuckets.get(code)
    if (!bucket) { bucket = new Set(); deltaBuckets.set(code, bucket) }
    bucket.add(handler as unknown as (...args: unknown[]) => void)
    const dispose = () => { bucket!.delete(handler as unknown as (...args: unknown[]) => void) }
    disposers.push(dispose)
    return dispose
  }

  function onTick(resource: 'schedule', handler: ScheduleTickHandler): () => void
  function onTick(resource: TickResource, handler: TickHandler): () => void
  function onTick(resource: TickResource | 'schedule', handler: TickHandler | ScheduleTickHandler): () => void {
    if (resource === 'schedule') {
      scheduleBucket.add(handler as ScheduleTickHandler)
      const dispose = () => { scheduleBucket.delete(handler as ScheduleTickHandler) }
      disposers.push(dispose)
      return dispose
    }
    let bucket = tickBuckets.get(resource)
    if (!bucket) { bucket = new Set(); tickBuckets.set(resource, bucket) }
    bucket.add(handler as TickHandler)
    const dispose = () => { bucket!.delete(handler as TickHandler) }
    disposers.push(dispose)
    return dispose
  }

  function onReconnect(fn: () => void): () => void {
    reconnectListeners.add(fn)
    const dispose = () => { reconnectListeners.delete(fn) }
    disposers.push(dispose)
    return dispose
  }

  onBeforeUnmount(() => {
    disposers.forEach((d) => d())
    disposers.length = 0
  })

  return {
    on,
    onTick,
    onReconnect,
    connected,
    everConnected,
    reconnectAttempts,
    forceReconnect,
  }
}
