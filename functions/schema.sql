CREATE TABLE IF NOT EXISTS tokens (
  id TEXT PRIMARY KEY,
  operator_id TEXT NOT NULL,
  short_code TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'issued',
  created_at TEXT NOT NULL,
  opened_at TEXT,
  expires_at TEXT,
  confirmed_at TEXT
);

CREATE TABLE IF NOT EXISTS submissions (
  id TEXT PRIMARY KEY,
  token_id TEXT NOT NULL UNIQUE REFERENCES tokens(id),
  card_number_enc TEXT,
  id_number_enc TEXT,
  holder_name TEXT,
  expiry TEXT,
  installment INTEGER,
  photo_hash TEXT NOT NULL,
  submitted_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS timeline_events (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  token_id TEXT NOT NULL,
  operator_id TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  metadata TEXT
);

CREATE TABLE IF NOT EXISTS admin_access_log (
  id TEXT PRIMARY KEY,
  admin_id TEXT NOT NULL,
  action TEXT NOT NULL,
  token_id TEXT,
  timestamp TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tokens_operator_status ON tokens(operator_id, status);
CREATE INDEX IF NOT EXISTS idx_timeline_token ON timeline_events(token_id);
CREATE INDEX IF NOT EXISTS idx_timeline_operator_time ON timeline_events(operator_id, timestamp);
