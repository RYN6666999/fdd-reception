import type { Env } from '../../types/env'
import {
  handleRelayTunnelProbe,
  readRelayTunnelStatus,
} from '../../cron/relay-tunnel-probe'

type RelayEventRow = {
  event_id: string
  idempotency_key: string
  source: string
  conversation_id: string
  user_id: string
  message_id: string
  ts: number
  type: string
  payload: string
  trace_id: string
  schema_version: string
  status: string
  receive_ts: number
  process_ts: number | null
  deliver_ts: number | null
  retry_count: number
  error: string | null
  created_at: number
}

type RelayRecentMetricsRow = {
  status: string
  receive_ts: number
  process_ts: number | null
  deliver_ts: number | null
}

const MAX_RETRIES = 3
const BASE_BACKOFF_MS = 400
const ADMIN_PROBE_HEADER = 'X-Admin-Probe-Token'

function nowSec(): number {
  return Date.now() / 1000
}

function makeId(bytes = 6): string {
  const raw = new Uint8Array(bytes)
  crypto.getRandomValues(raw)
  return Array.from(raw, b => b.toString(16).padStart(2, '0')).join('')
}

function hashHex(input: string): string {
  let h = 2166136261
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i)
    h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24)
  }
  return (h >>> 0).toString(16)
}

function json(data: unknown, status = 200): Response {
  return Response.json(data, {
    status,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  })
}

function secureEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return diff === 0
}

function parseArisReply(raw: unknown): string {
  if (!raw || typeof raw !== 'object') return ''
  const obj = raw as Record<string, unknown>
  const choices = obj.choices
  if (Array.isArray(choices) && choices.length > 0) {
    const first = choices[0] as { message?: { content?: unknown } }
    if (typeof first?.message?.content === 'string') return first.message.content
  }
  if (typeof obj.response === 'string') return obj.response
  return ''
}

function arisApiUrl(env: Env): string {
  return env.ARIS_API_URL || 'https://aris-live.3141919ryanfeofjpewfp.uk/v1/chat/completions'
}

async function sleep(ms: number): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, ms))
}

async function callArisWithRetry(env: Env, text: string): Promise<string> {
  const url = arisApiUrl(env)
  let lastError = 'unknown_error'

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'laap-core',
          messages: [{ role: 'user', content: text }],
        }),
      })

      if (!resp.ok) {
        lastError = `aris_http_${resp.status}`
      } else {
        const payload = await resp.json<unknown>()
        const reply = parseArisReply(payload)
        if (reply.length > 0) return reply
        lastError = 'empty_reply'
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
    }

    if (attempt < MAX_RETRIES) {
      await sleep(BASE_BACKOFF_MS * 2 ** attempt)
    }
  }

  throw new Error(lastError)
}

async function markProcessing(env: Env, eventId: string): Promise<void> {
  await env.DB.prepare(
    `UPDATE relay_events
     SET status = 'processing', process_ts = ?
     WHERE event_id = ?`
  ).bind(nowSec(), eventId).run()
}

async function markDelivered(env: Env, eventId: string, reply: string): Promise<void> {
  const row = await env.DB.prepare(
    `SELECT payload FROM relay_events WHERE event_id = ?`
  ).bind(eventId).first<{ payload: string }>()

  const payload = row?.payload ? JSON.parse(row.payload) as Record<string, unknown> : {}
  payload.reply = reply

  await env.DB.prepare(
    `UPDATE relay_events
     SET status = 'delivered', deliver_ts = ?, error = NULL, payload = ?
     WHERE event_id = ?`
  ).bind(nowSec(), JSON.stringify(payload), eventId).run()
}

async function markDeadLetter(env: Env, eventId: string, error: string): Promise<void> {
  await env.DB.prepare(
    `UPDATE relay_events
     SET status = 'dead_letter', error = ?, retry_count = ?
     WHERE event_id = ?`
  ).bind(error, MAX_RETRIES, eventId).run()
}

type MemoryEntry = {
  source: string
  content: string
  tags: string[]
  source_id: string
  origin: 'human' | 'auto_generated'
  provenance: string
}

// Best-effort write to the local aris-memory API (over the aris-mem tunnel).
// Graceful degradation: never throws, never blocks the chat reply on failure.
async function storeMemory(env: Env, entry: MemoryEntry): Promise<void> {
  const base = env.ARIS_MEMORY_URL
  if (!base || entry.content.trim().length === 0) return

  try {
    await fetch(`${base.replace(/\/$/, '')}/memories/store`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry),
    })
  } catch (error) {
    console.warn('aris-memory store failed', entry.source, error instanceof Error ? error.message : String(error))
  }
}

export async function handleRelayChat(request: Request, env: Env): Promise<Response> {
  let body: { text?: unknown; conv?: unknown; uid?: unknown }
  try {
    body = await request.json()
  } catch {
    return json({ error: 'invalid_json' }, 400)
  }

  const text = typeof body.text === 'string' ? body.text.trim() : ''
  const conv = typeof body.conv === 'string' && body.conv.trim().length > 0 ? body.conv.trim() : 'web'
  const uid = typeof body.uid === 'string' && body.uid.trim().length > 0 ? body.uid.trim() : 'anon'

  if (text.length === 0) return json({ error: 'text_required' }, 400)

  const ts = nowSec()
  const eventId = makeId(6)
  const messageId = hashHex(`${conv}:${uid}:${text}`).slice(0, 12)
  const idempotencyKey = `web:${messageId}`
  const payload = JSON.stringify({ text })
  const traceId = makeId(8)

  const existing = await env.DB.prepare(
    `SELECT event_id, status, payload FROM relay_events WHERE idempotency_key = ?`
  ).bind(idempotencyKey).first<{ event_id: string; status: string; payload: string }>()

  if (existing) {
    const parsed = existing.payload ? JSON.parse(existing.payload) as Record<string, unknown> : {}
    const reply = typeof parsed.reply === 'string' ? parsed.reply : ''
    return json({ event_id: existing.event_id, dedup: true, reply, status: existing.status })
  }

  await env.DB.prepare(
    `INSERT INTO relay_events (
      event_id, idempotency_key, source, conversation_id, user_id,
      message_id, ts, type, payload, trace_id, schema_version,
      status, receive_ts, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'received', ?, ?)`
  ).bind(
    eventId,
    idempotencyKey,
    'web',
    conv,
    uid,
    messageId,
    ts,
    'text',
    payload,
    traceId,
    'v1',
    ts,
    ts,
  ).run()

  await markProcessing(env, eventId)

  // User turn always lands in memory (tagged by conversation), even if Aris fails.
  // origin=human: user-said, not an auto-generated claim.
  await storeMemory(env, { source: 'webchat', content: text, tags: [conv], source_id: messageId, origin: 'human', provenance: conv })

  try {
    const reply = await callArisWithRetry(env, text)
    await markDelivered(env, eventId, reply)
    // origin=auto_generated: Aris reply is provisional (gate caps it at 🟡), never auto-fact.
    await storeMemory(env, { source: 'aris-self', content: reply, tags: [conv], source_id: eventId, origin: 'auto_generated', provenance: conv })
    return json({ event_id: eventId, reply, status: 'delivered' })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await markDeadLetter(env, eventId, message)
    return json({ event_id: eventId, reply: '', status: 'dead_letter', error: message }, 502)
  }
}

export function handleRelayHealth(startedAtMs: number): Response {
  return json({
    status: 'ok',
    uptime: Math.round((Date.now() - startedAtMs) / 100) / 10,
  })
}

export async function handleRelayAdminStatus(env: Env, startedAtMs: number): Promise<Response> {
  const totalRow = await env.DB.prepare(
    `SELECT COUNT(*) AS total_events FROM relay_events`
  ).first<{ total_events: number }>()

  const byStatusRows = await env.DB.prepare(
    `SELECT status, COUNT(*) AS count FROM relay_events GROUP BY status`
  ).all<{ status: string; count: number }>()

  const bySourceRows = await env.DB.prepare(
    `SELECT source, COUNT(*) AS count FROM relay_events GROUP BY source`
  ).all<{ source: string; count: number }>()

  const recentLimit = 50
  const recentRows = await env.DB.prepare(
    `SELECT status, receive_ts, process_ts, deliver_ts
     FROM relay_events
     ORDER BY created_at DESC
     LIMIT ?`
  ).bind(recentLimit).all<RelayRecentMetricsRow>()

  const latencyMsValues: number[] = []
  const responseMsValues: number[] = []
  let errorCount = 0

  for (const row of recentRows.results) {
    const receive = row.receive_ts
    const endTs = row.deliver_ts ?? row.process_ts ?? row.receive_ts
    const latencyMs = Math.max(0, Math.round((endTs - receive) * 1000))
    latencyMsValues.push(latencyMs)

    if (row.status !== 'delivered') errorCount += 1

    if (row.deliver_ts !== null) {
      const responseStart = row.process_ts ?? row.receive_ts
      const responseMs = Math.max(0, Math.round((row.deliver_ts - responseStart) * 1000))
      responseMsValues.push(responseMs)
    }
  }

  latencyMsValues.sort((a, b) => a - b)
  responseMsValues.sort((a, b) => a - b)

  const pickPercentile = (values: number[], percentile: number): number => {
    if (values.length === 0) return 0
    const index = Math.min(values.length - 1, Math.max(0, Math.ceil((percentile / 100) * values.length) - 1))
    return values[index] ?? 0
  }

  const avg = (values: number[]): number => {
    if (values.length === 0) return 0
    const total = values.reduce((sum, value) => sum + value, 0)
    return Math.round((total / values.length) * 10) / 10
  }

  const byStatus = Object.fromEntries(byStatusRows.results.map(r => [r.status, r.count]))
  const bySource = Object.fromEntries(bySourceRows.results.map(r => [r.source, r.count]))

  let tunnelStatus: Record<string, unknown> = {
    status: 'unknown',
    reason: 'not_checked_yet',
    probe_interval_sec: 300,
  }

  try {
    const statusRow = await readRelayTunnelStatus(env)

    if (statusRow) {
      const degraded = statusRow.consecutive_failures > 0
      const now = nowSec()
      const outageSec = statusRow.outage_started_ts ? Math.max(0, Math.round(now - statusRow.outage_started_ts)) : 0
      const failureRate = statusRow.total_checks > 0
        ? Math.round((statusRow.total_failures / statusRow.total_checks) * 1000) / 1000
        : 0

      tunnelStatus = {
        status: degraded ? 'degraded' : 'ok',
        check_name: statusRow.check_name,
        probe_interval_sec: 300,
        last_check_ts: statusRow.last_check_ts,
        last_ok_ts: statusRow.last_ok_ts,
        last_fail_ts: statusRow.last_fail_ts,
        outage_started_ts: statusRow.outage_started_ts,
        outage_duration_sec: outageSec,
        consecutive_failures: statusRow.consecutive_failures,
        last_error: statusRow.last_error,
        last_http_status: statusRow.last_http_status,
        last_latency_ms: statusRow.last_latency_ms,
        total_checks: statusRow.total_checks,
        total_failures: statusRow.total_failures,
        failure_rate: failureRate,
      }
    }
  } catch (error) {
    tunnelStatus = {
      status: 'unknown',
      reason: 'monitor_table_unavailable',
      detail: error instanceof Error ? error.message : String(error),
      probe_interval_sec: 300,
    }
  }

  return json({
    total_events: totalRow?.total_events ?? 0,
    by_status: byStatus,
    by_source: bySource,
    recent_event_metrics: {
      sample_size: recentRows.results.length,
      limit: recentLimit,
      error_rate: recentRows.results.length > 0
        ? Math.round((errorCount / recentRows.results.length) * 1000) / 1000
        : 0,
      latency_ms: {
        avg: avg(latencyMsValues),
        p50: pickPercentile(latencyMsValues, 50),
        p95: pickPercentile(latencyMsValues, 95),
      },
      response_ms: {
        avg: avg(responseMsValues),
        p50: pickPercentile(responseMsValues, 50),
        p95: pickPercentile(responseMsValues, 95),
      },
    },
    uptime: Math.round((Date.now() - startedAtMs) / 100) / 10,
    aris_api_tunnel: tunnelStatus,
  })
}

export async function handleRelayAdminProbe(request: Request, env: Env): Promise<Response> {
  const configuredToken = env.ADMIN_PROBE_TOKEN
  if (!configuredToken || configuredToken.trim().length === 0) {
    return json({ error: 'admin_probe_disabled' }, 503)
  }

  const requestToken = request.headers.get(ADMIN_PROBE_HEADER) || ''
  if (!secureEqual(requestToken, configuredToken)) {
    return json({ error: 'unauthorized' }, 401)
  }

  await handleRelayTunnelProbe(env)

  const latest = await readRelayTunnelStatus(env)
  if (!latest) {
    return json({ ok: true, triggered: true, status: 'unknown' })
  }

  return json({
    ok: true,
    triggered: true,
    check_name: latest.check_name,
    last_check_ts: latest.last_check_ts,
    last_ok_ts: latest.last_ok_ts,
    last_fail_ts: latest.last_fail_ts,
    outage_started_ts: latest.outage_started_ts,
    consecutive_failures: latest.consecutive_failures,
    last_error: latest.last_error,
    last_http_status: latest.last_http_status,
    last_latency_ms: latest.last_latency_ms,
    total_checks: latest.total_checks,
    total_failures: latest.total_failures,
  })
}

export async function handleRelayEvents(env: Env, conversationId: string): Promise<Response> {
  const data = await env.DB.prepare(
    `SELECT event_id, idempotency_key, source, conversation_id, user_id,
            message_id, ts, type, payload, trace_id, schema_version,
            status, receive_ts, process_ts, deliver_ts, retry_count, error, created_at
     FROM relay_events
     WHERE conversation_id = ?
     ORDER BY created_at ASC
     LIMIT 500`
  ).bind(conversationId).all<RelayEventRow>()

  const events = data.results.map(row => ({
    ...row,
    payload: (() => {
      try {
        return JSON.parse(row.payload)
      } catch {
        return row.payload
      }
    })(),
  }))

  return json({
    conversation_id: conversationId,
    count: events.length,
    events,
  })
}

export function handleRelayOptions(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Probe-Token',
    },
  })
}
