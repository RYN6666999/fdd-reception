import { handleIssue } from './api/token/issue'
import { handleOpen } from './api/token/open'
import { handleConfirm } from './api/token/confirm'
import { handleDestroy } from './api/token/destroy'
import { handleSubmit } from './api/token/submit'
import { handleCvv } from './api/token/cvv'
import { handleGetCard } from './api/token/card'
import { handleOperatorHistory } from './api/operator/history'
import { handleRedirect } from './api/token/redirect'
import { handlePhotoUpload } from './api/token/photo'
import {
  handleRelayAdminStatus,
  handleRelayChat,
  handleRelayEvents,
  handleRelayHealth,
  handleRelayOptions,
} from './api/relay'
import { handleExpireTokens } from './cron/expire-tokens'
import { handleCleanupSensitive } from './cron/cleanup-sensitive'
import type { Env } from './types/env'

export { SessionRoom } from './durable-objects/session-room'

const STARTED_AT_MS = Date.now()

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    const path = url.pathname
    const method = request.method

    // POST /api/token/issue
    if (method === 'POST' && path === '/api/token/issue') return handleIssue(request, env)

    // Token ID routes
    const tokenMatch = path.match(/^\/api\/token\/([^/]+)\/(\w+)$/)
    if (tokenMatch) {
      const [, tokenId, action] = tokenMatch
      if (method === 'POST' && action === 'open') return handleOpen(request, env, tokenId!)
      if (method === 'POST' && action === 'confirm') return handleConfirm(request, env, tokenId!)
      if (method === 'DELETE' && action === 'destroy') return handleDestroy(request, env, tokenId!)
      if (method === 'POST' && action === 'submit') return handleSubmit(request, env, tokenId!)
      if (method === 'POST' && action === 'cvv') return handleCvv(request, env, tokenId!)
      if (method === 'GET' && action === 'card') return handleGetCard(request, env, tokenId!)
      if (method === 'POST' && action === 'photo') return handlePhotoUpload(request, env, tokenId!)
    }

    // GET /c/:shortCode → redirect to client
    const shortMatch = path.match(/^\/c\/([A-Za-z0-9]+)$/)
    if (shortMatch && method === 'GET') return handleRedirect(request, env, shortMatch[1]!)

    // GET /api/operator/history
    if (method === 'GET' && path === '/api/operator/history') return handleOperatorHistory(request, env)

    // Relay endpoints
    if (method === 'OPTIONS' && (path === '/c' || path === '/health' || path === '/admin/status' || path.startsWith('/events/'))) {
      return handleRelayOptions()
    }
    if (method === 'POST' && path === '/c') return handleRelayChat(request, env)
    if (method === 'GET' && path === '/health') return handleRelayHealth(STARTED_AT_MS)
    if (method === 'GET' && path === '/admin/status') return handleRelayAdminStatus(env, STARTED_AT_MS)
    const eventsMatch = path.match(/^\/events\/([^/]+)$/)
    if (eventsMatch && method === 'GET') return handleRelayEvents(env, decodeURIComponent(eventsMatch[1]!))


    // WebSocket: GET /api/session/:id/ws → proxy to Durable Object
    const sessionMatch = path.match(/^\/api\/session\/([^/]+)\/ws$/)
    if (sessionMatch && method === 'GET') {
      const [, sessionId] = sessionMatch
      const roomId = env.SESSION_ROOM.idFromName(sessionId!)
      const room = env.SESSION_ROOM.get(roomId)
      return room.fetch(request)
    }

    // Pass-through 給靜態資產（client/, operator/, admin/, /c/ 等）
    return env.ASSETS.fetch(request)
  },

  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    if (event.cron === '* * * * *') ctx.waitUntil(handleExpireTokens(env))
    if (event.cron === '0 2 * * *') ctx.waitUntil(handleCleanupSensitive(env))
  }
}
