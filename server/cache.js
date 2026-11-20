'use strict';
// Cache SQLite untuk respons layanan data (memakai node:sqlite bawaan Node >= 22.5).
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const DB_PATH = path.join(__dirname, '..', 'data', 'mitsuyomi.db');
const SCHEMA_PATH = path.join(__dirname, 'db', 'schema.sql');

let db = null;

function getDb() {
  if (db) return db;
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  db = new DatabaseSync(DB_PATH);
  db.exec(fs.readFileSync(SCHEMA_PATH, 'utf8'));
  return db;
}

function dayKeyWIB(now = new Date()) {
  // Geser ke WIB (UTC+7) lalu ambil tanggalnya.
  const wib = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  return wib.toISOString().slice(0, 10);
}

function bumpStat(field) {
  try {
    const d = getDb();
    const day = dayKeyWIB();
    d.prepare('INSERT INTO api_stats (day, upstream_requests, cache_hits, upstream_errors) VALUES (?, 0, 0, 0) ON CONFLICT(day) DO NOTHING').run(day);
    d.prepare(`UPDATE api_stats SET ${field} = ${field} + 1 WHERE day = ?`).run(day);
  } catch (_) { /* statistik tidak boleh menjatuhkan request utama */ }
}

// Ambil dari cache. Mengembalikan { data, fresh } atau null bila tidak ada.
function getCache(key) {
  try {
    const row = getDb().prepare('SELECT response, fetched_at, ttl_ms FROM api_cache WHERE cache_key = ?').get(key);
    if (!row) return null;
    const age = Date.now() - row.fetched_at;
    return { data: JSON.parse(row.response), fresh: age <= row.ttl_ms, age };
  } catch (_) {
    return null;
  }
}

function setCache(key, data, ttlMs) {
  try {
    getDb().prepare('INSERT INTO api_cache (cache_key, response, fetched_at, ttl_ms) VALUES (?, ?, ?, ?) ON CONFLICT(cache_key) DO UPDATE SET response = excluded.response, fetched_at = excluded.fetched_at, ttl_ms = excluded.ttl_ms')
      .run(key, JSON.stringify(data), Date.now(), ttlMs);
  } catch (_) { /* abaikan kegagalan cache */ }
}

// --- Indeks meta: rating + tipe per slug, dikumpulkan dari semua respons ---
// Sebagian daftar dari layanan data tidak membawa rating, sebagian tidak membawa tipe.
// Indeks ini membuat keduanya saling mengisi antar-daftar tanpa request tambahan.
const META_KEY = '__meta_index';
const META_TTL = 30 * 24 * 60 * 60 * 1000;

function getMetaIndex() {
  const hit = getCache(META_KEY);
  return hit && hit.data && typeof hit.data === 'object' ? hit.data : {};
}

function mergeMeta(items) {
  if (!Array.isArray(items) || items.length === 0) return;
  const idx = getMetaIndex();
  let changed = false;
  for (const it of items) {
    if (!it || !it.slug) continue;
    const cur = idx[it.slug] || {};
    const next = {
      rating: it.rating != null ? it.rating : (cur.rating != null ? cur.rating : null),
      type: it.type || cur.type || null,
    };
    if (next.rating !== cur.rating || next.type !== cur.type) { idx[it.slug] = next; changed = true; }
  }
  if (changed) {
    const keys = Object.keys(idx);
    if (keys.length > 4000) for (const k of keys.slice(0, keys.length - 4000)) delete idx[k];
    setCache(META_KEY, idx, META_TTL);
  }
}

function enrichItems(items) {
  if (!Array.isArray(items)) return items;
  const idx = getMetaIndex();
  return items.map((it) => {
    if (!it || !it.slug) return it;
    const meta = idx[it.slug];
    if (!meta) return it;
    return {
      ...it,
      rating: it.rating != null ? it.rating : meta.rating,
      type: it.type || meta.type,
    };
  });
}

function cacheSize() {
  try {
    const row = getDb().prepare('SELECT COUNT(*) AS n FROM api_cache').get();
    return row ? row.n : 0;
  } catch (_) { return 0; }
}

module.exports = { getDb, getCache, setCache, bumpStat, cacheSize, getMetaIndex, mergeMeta, enrichItems };
