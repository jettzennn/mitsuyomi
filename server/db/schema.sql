-- Mitsuyomi — skema database (SQLite)
-- Database hanya dipakai sebagai cache layanan data + statistik pemakaian,
-- supaya situs tetap cepat dan hemat kuota request ke layanan data.

CREATE TABLE IF NOT EXISTS api_cache (
  cache_key   TEXT PRIMARY KEY,
  response    TEXT NOT NULL,            -- JSON hasil normalisasi
  fetched_at  INTEGER NOT NULL,         -- epoch ms kapan diambil
  ttl_ms      INTEGER NOT NULL DEFAULT 600000
);

CREATE INDEX IF NOT EXISTS idx_api_cache_fetched ON api_cache(fetched_at);

CREATE TABLE IF NOT EXISTS api_stats (
  day         TEXT PRIMARY KEY,         -- format YYYY-MM-DD (WIB)
  upstream_requests INTEGER NOT NULL DEFAULT 0,
  cache_hits        INTEGER NOT NULL DEFAULT 0,
  upstream_errors   INTEGER NOT NULL DEFAULT 0
);

-- --- Akun pengguna (v1.3.0) ---
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,      -- tersimpan huruf kecil
  password_hash TEXT NOT NULL,             -- format scrypt:<saltHex>:<hashHex>
  status        TEXT NOT NULL DEFAULT 'pending',  -- pending | active
  created_at    INTEGER NOT NULL,
  activated_at  INTEGER
);

CREATE TABLE IF NOT EXISTS auth_tokens (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id),
  kind       TEXT NOT NULL,                -- activation | reset
  token_hash TEXT NOT NULL,                -- sha256 dari token mentah
  expires_at INTEGER NOT NULL,             -- token hanya berlaku 60 detik
  used_at    INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_auth_tokens_hash ON auth_tokens(token_hash);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,             -- sha256 dari token sesi cookie
  user_id    INTEGER NOT NULL REFERENCES users(id),
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
