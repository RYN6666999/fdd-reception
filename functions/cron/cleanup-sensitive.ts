import { generateId } from '../utils/id'
import type { Env } from '../types/env'

export async function handleCleanupSensitive(env: Env): Promise<void> {
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

  const expired = await env.DB.prepare(`
    SELECT s.token_id, t.operator_id
    FROM submissions s
    JOIN tokens t ON t.id = s.token_id
    WHERE t.confirmed_at < ?
    AND s.card_number_enc IS NOT NULL
  `).bind(cutoff).all()

  for (const row of expired.results) {
    await env.DB.prepare(`
      UPDATE submissions SET card_number_enc=NULL, id_number_enc=NULL WHERE token_id=?
    `).bind(row.token_id).run()

    await env.DB.prepare(`
      INSERT INTO timeline_events (id, event_type, token_id, operator_id, timestamp)
      VALUES (?, 'data_auto_deleted', ?, ?, ?)
    `).bind(generateId(), row.token_id, row.operator_id, new Date().toISOString()).run()
  }
}
