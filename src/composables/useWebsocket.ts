import { onBeforeUnmount, ref } from 'vue'
import { API_BASE } from '@/api'
import type { components } from '@/api.d'

type WsEvent = components['schemas']['WsEvent']
type WsEventType = WsEvent['type']
type WsEventOf<T extends WsEventType> = Extract<WsEvent, { type: T }>

const WS_URL = `${API_BASE.replace(/^http/, 'ws')}/api/ws`

type Handler<T extends WsEventType> = (ev: WsEventOf<T>) => void
type AnyHandler = (ev: WsEvent) => void

const handlers = new Map<WsEventType | '*', Set<AnyHandler>>()
const reconnectListeners = new Set<() => void>()

let socket: WebSocket | null = null
let backoff = 0
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let visibilityWired = false

function dispatch(ev: WsEvent) {
  const bucket = handlers.get(ev.type)
  if (bucket) bucket.forEach((h) => h(ev))
  const star = handlers.get('*')
  if (star) star.forEach((h) => h(ev))
}

// Shared connection status. `everConnected` flips true on first successful
// open and never resets — so consumers can distinguish "still handshaking" from
// "we lost the connection".
const connected = ref(false)
const everConnected = ref(false)
const reconnectAttempts = ref(0)

function connect() {
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
    return
  }
  socket = new WebSocket(WS_URL)
  socket.onopen = () => {
    const wasReconnect = everConnected.value
    backoff = 0
    reconnectAttempts.value = 0
    connected.value = true
    everConnected.value = true
    if (wasReconnect) {
      // Welcome events from the device re-seed grid / modules / display on
      // their own. This hook lets composables that don't subscribe to
      // welcome (schedules, bootloader, etc.) refresh their state.
      reconnectListeners.forEach((fn) => {
        try { fn() } catch { /* swallow — one bad listener shouldn't poison the rest */ }
      })
    }
  }
  socket.onmessage = (msg) => {
    let raw: unknown
    try {
      raw = JSON.parse(msg.data)
    } catch {
      return
    }
    // The device coalesces broadcasts in a 100ms window and emits them as
    // one `batch` envelope with an `events` array. Unfold here so downstream
    // handlers stay event-type-specific — they don't need to know batching
    // exists. The outer batch's `ts` is propagated onto each inner event so
    // they remain shape-compatible with non-batched envelopes (e.g. welcome,
    // pong).
    const envelope = raw as { type?: string; ts?: number; events?: Array<{ type: string; data?: unknown }> }
    if (envelope && envelope.type === 'batch' && Array.isArray(envelope.events)) {
      const ts = envelope.ts ?? 0
      for (const inner of envelope.events) {
        dispatch({ ...inner, ts } as WsEvent)
      }
      return
    }
    dispatch(raw as WsEvent)
  }
  socket.onclose = () => {
    socket = null
    connected.value = false
    scheduleReconnect()
  }
  socket.onerror = () => {
    socket?.close()
  }
}

function scheduleReconnect() {
  if (reconnectTimer) return
  // Aggressive backoff for a local-network app: 500ms, 1s, 2s, 4s, then cap
  // at 5s. The display's web server is right there — long backoffs just feel
  // broken.
  const delay = Math.min(500 * 2 ** Math.min(backoff, 3), 5000)
  backoff += 1
  reconnectAttempts.value = backoff
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    connect()
  }, delay)
}

function forceReconnect() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
  backoff = 0
  reconnectAttempts.value = 0
  if (socket && socket.readyState !== WebSocket.OPEN) {
    try { socket.close() } catch { /* already closed */ }
    socket = null
  }
  connect()
}

// When the tab becomes visible again or the network comes back, browsers
// don't always synthesise a close event — the socket can sit half-open. Force
// a reconnect check on these signals.
function wireVisibility() {
  if (visibilityWired || typeof document === 'undefined') return
  visibilityWired = true
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && !connected.value) {
      forceReconnect()
    }
  })
  if (typeof window !== 'undefined') {
    window.addEventListener('online', () => {
      if (!connected.value) forceReconnect()
    })
  }
}

export function useWebsocket() {
  wireVisibility()
  connect()

  const disposers: Array<() => void> = []

  function on<T extends WsEventType>(type: T, handler: Handler<T>): () => void
  function on(type: '*', handler: AnyHandler): () => void
  function on(type: WsEventType | '*', handler: AnyHandler): () => void {
    let bucket = handlers.get(type)
    if (!bucket) {
      bucket = new Set()
      handlers.set(type, bucket)
    }
    bucket.add(handler)
    const dispose = () => {
      bucket!.delete(handler)
    }
    disposers.push(dispose)
    return dispose
  }

  function onReconnect(fn: () => void): () => void {
    reconnectListeners.add(fn)
    const dispose = () => {
      reconnectListeners.delete(fn)
    }
    disposers.push(dispose)
    return dispose
  }

  onBeforeUnmount(() => {
    disposers.forEach((d) => d())
    disposers.length = 0
  })

  return {
    on,
    onReconnect,
    connected,
    everConnected,
    reconnectAttempts,
    forceReconnect,
  }
}
