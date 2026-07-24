CREATE TABLE IF NOT EXISTS relay_events (
  event_id TEXT PRIMARY KEY,
  idempotency_key TEXT NOT NULL UNIQUE,
  source TEXT NOT NULL,
  conversation_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  ts REAL NOT NULL,
  type TEXT NOT NULL,
  payload TEXT NOT NULL,
  trace_id TEXT NOT NULL,
  schema_version TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'received',
  receive_ts REAL NOT NULL,
  process_ts REAL,
  deliver_ts REAL,
  retry_count INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  created_at REAL NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_relay_events_status ON relay_events(status);
CREATE INDEX IF NOT EXISTS idx_relay_events_conversation ON relay_events(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_relay_events_source ON relay_events(source);
