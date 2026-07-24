import type { Env } from '../../types/env'

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

const MAX_RETRIES = 3
const BASE_BACKOFF_MS = 400

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

  try {
    const reply = await callArisWithRetry(env, text)
    await markDelivered(env, eventId, reply)
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

  const byStatus = Object.fromEntries(byStatusRows.results.map(r => [r.status, r.count]))
  const bySource = Object.fromEntries(bySourceRows.results.map(r => [r.source, r.count]))

  return json({
    total_events: totalRow?.total_events ?? 0,
    by_status: byStatus,
    by_source: bySource,
    uptime: Math.round((Date.now() - startedAtMs) / 100) / 10,
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
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  })
}
