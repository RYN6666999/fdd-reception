CREATE TABLE IF NOT EXISTS relay_system_status (
  check_name TEXT PRIMARY KEY,
  last_check_ts REAL NOT NULL,
  last_ok_ts REAL,
  last_fail_ts REAL,
  outage_started_ts REAL,
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  last_http_status INTEGER,
  last_latency_ms INTEGER,
  total_checks INTEGER NOT NULL DEFAULT 0,
  total_failures INTEGER NOT NULL DEFAULT 0,
  updated_at REAL NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_relay_system_status_updated_at ON relay_system_status(updated_at);