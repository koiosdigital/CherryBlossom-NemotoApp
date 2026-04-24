import { onBeforeUnmount } from 'vue'
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

function connect() {
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
    return
  }
  socket = new WebSocket(WS_URL)
  socket.onopen = () => {
    retry = 0
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

  return { on }
}
