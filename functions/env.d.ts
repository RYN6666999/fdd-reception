// Minimal ambient types for Cloudflare Workers runtime
// Full types come from @cloudflare/workers-types at deploy time

interface DurableObjectNamespace {
  idFromName(name: string): DurableObjectId
  idFromString(id: string): DurableObjectId
  get(id: DurableObjectId): DurableObjectStub
}

interface DurableObjectId {
  toString(): string
}

interface DurableObjectStub {
  fetch(request: Request | string, init?: RequestInit): Promise<Response>
}

interface WebSocket {
  accept(): void
  send(data: string | ArrayBuffer): void
  close(code?: number, reason?: string): void
  addEventListener(type: 'close' | 'error' | 'message', handler: EventListenerOrEventListenerObject): void
}

declare class WebSocketPair {
  0: WebSocket
  1: WebSocket
  [key: number]: WebSocket
}

interface ResponseInit {
  webSocket?: WebSocket
}

interface ScheduledEvent {
  cron: string
  scheduledTime: number
  noRetry(): void
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void
  passThroughOnException(): void
}

interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement
  run(): Promise<D1Result>
  first<T = Record<string, unknown>>(): Promise<T | null>
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>
}

interface D1Result<T = Record<string, unknown>> {
  results: T[]
  success: boolean
  meta: Record<string, unknown>
}

interface D1Database {
  prepare(query: string): D1PreparedStatement
  exec(query: string): Promise<D1Result>
  batch(statements: D1PreparedStatement[]): Promise<D1Result[]>
}
