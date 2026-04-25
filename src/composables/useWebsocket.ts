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

let socket: WebSocket | null = null
let retry = 0
let reconnectTimer: ReturnType<typeof setTimeout> | null = null

// Shared connection status — true once we've ever opened, false on close. The
// initial `false` covers the brief pre-open window so the disconnect indicator
// doesn't flash on first load (consumers should treat the first 1-2s as a
// "connecting" grace period).
const connected = ref(false)
const everConnected = ref(false)

function connect() {
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
    return
  }
  socket = new WebSocket(WS_URL)
  socket.onopen = () => {
    retry = 0
    connected.value = true
    everConnected.value = true
  }
  socket.onmessage = (msg) => {
    let ev: WsEvent
    try {
      ev = JSON.parse(msg.data) as WsEvent
    } catch {
      return
    }
    const bucket = handlers.get(ev.type)
    if (bucket) bucket.forEach((h) => h(ev))
    const star = handlers.get('*')
    if (star) star.forEach((h) => h(ev))
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
  const delay = Math.min(1000 * 2 ** retry, 15000)
  retry += 1
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    connect()
  }, delay)
}

export function useWebsocket() {
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

  onBeforeUnmount(() => {
    disposers.forEach((d) => d())
    disposers.length = 0
  })

  return { on, connected, everConnected }
}
