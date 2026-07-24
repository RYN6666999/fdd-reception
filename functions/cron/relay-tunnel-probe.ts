import type { Env } from '../types/env'

export type TunnelStatusRow = {
  check_name: string
  last_check_ts: number
  last_ok_ts: number | null
  last_fail_ts: number | null
  outage_started_ts: number | null
  consecutive_failures: number
  last_error: string | null
  last_http_status: number | null
  last_latency_ms: number | null
  total_checks: number
  total_failures: number
  updated_at: number
}

export const RELAY_TUNNEL_CHECK_NAME = 'aris_api_tunnel'
const DEFAULT_API_URL = 'https://aris-api.3141919ryanfeofjpewfp.uk/v1/chat/completions'
const PROBE_TIMEOUT_MS = 8000

function nowSec(): number {
  return Date.now() / 1000
}

function resolveProbeUrl(env: Env): string {
  return env.ARIS_API_URL || DEFAULT_API_URL
}

async function probeTunnel(url: string): Promise<{ ok: boolean; status: number | null; latencyMs: number; error: string | null }> {
  const startedAt = Date.now()
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS)

  try {
    const response = await fetch(url, {
      method: 'HEAD',
      redirect: 'manual',
      signal: controller.signal,
      headers: {
        'Cache-Control': 'no-store',
      },
    })

    const latencyMs = Date.now() - startedAt
    const ok = response.status < 500
    return {
      ok,
      status: response.status,
      latencyMs,
      error: ok ? null : `http_${response.status}`,
    }
  } catch (error) {
    const latencyMs = Date.now() - startedAt
    const message = error instanceof Error ? error.message : String(error)
    return {
      ok: false,
      status: null,
      latencyMs,
      error: message || 'probe_failed',
    }
  } finally {
    clearTimeout(timeoutId)
  }
}

export async function handleRelayTunnelProbe(env: Env): Promise<void> {
  const checkTs = nowSec()
  const url = resolveProbeUrl(env)
  const result = await probeTunnel(url)

  const previous = await env.DB.prepare(
    `SELECT check_name, last_check_ts, last_ok_ts, last_fail_ts, outage_started_ts,
            consecutive_failures, last_error, last_http_status, last_latency_ms,
            total_checks, total_failures, updated_at
     FROM relay_system_status
     WHERE check_name = ?`
  ).bind(RELAY_TUNNEL_CHECK_NAME).first<TunnelStatusRow>()

  const totalChecks = (previous?.total_checks ?? 0) + 1
  const totalFailures = (previous?.total_failures ?? 0) + (result.ok ? 0 : 1)
  const consecutiveFailures = result.ok ? 0 : (previous?.consecutive_failures ?? 0) + 1
  const outageStartedTs = result.ok ? null : (previous?.outage_started_ts ?? checkTs)

  const lastOkTs = result.ok ? checkTs : (previous?.last_ok_ts ?? null)
  const lastFailTs = result.ok ? (previous?.last_fail_ts ?? null) : checkTs
  const lastError = result.ok ? null : (result.error ?? 'probe_failed')

  await env.DB.prepare(
    `INSERT INTO relay_system_status (
      check_name, last_check_ts, last_ok_ts, last_fail_ts, outage_started_ts,
      consecutive_failures, last_error, last_http_status, last_latency_ms,
      total_checks, total_failures, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(check_name) DO UPDATE SET
      last_check_ts = excluded.last_check_ts,
      last_ok_ts = excluded.last_ok_ts,
      last_fail_ts = excluded.last_fail_ts,
      outage_started_ts = excluded.outage_started_ts,
      consecutive_failures = excluded.consecutive_failures,
      last_error = excluded.last_error,
      last_http_status = excluded.last_http_status,
      last_latency_ms = excluded.last_latency_ms,
      total_checks = excluded.total_checks,
      total_failures = excluded.total_failures,
      updated_at = excluded.updated_at`
  ).bind(
    RELAY_TUNNEL_CHECK_NAME,
    checkTs,
    lastOkTs,
    lastFailTs,
    outageStartedTs,
    consecutiveFailures,
    lastError,
    result.status,
    result.latencyMs,
    totalChecks,
    totalFailures,
    checkTs,
  ).run()
}

export async function readRelayTunnelStatus(env: Env): Promise<TunnelStatusRow | null> {
  const row = await env.DB.prepare(
    `SELECT check_name, last_check_ts, last_ok_ts, last_fail_ts, outage_started_ts,
            consecutive_failures, last_error, last_http_status, last_latency_ms,
            total_checks, total_failures, updated_at
     FROM relay_system_status
     WHERE check_name = ?`
  ).bind(RELAY_TUNNEL_CHECK_NAME).first<TunnelStatusRow>()

  return row ?? null
}