'use strict';
// Klien layanan data komik: antrean + jeda minimum antar-request + retry terbatas.
// Layanan data membatasi 45 request/menit — server ini menjaga jauh di bawahnya
// (jeda >= 1400 ms antar-request, dan sebagian besar trafik dilayani cache SQLite).
const cache = require('./cache');

const BASE = (process.env.UPSTREAM_BASE || 'https://www.sankavollerei.web.id/comic').replace(/\/+$/, '');
const MIN_GAP_MS = 1400;
const TIMEOUT_MS = 25000;

let lastStart = 0;
let chain = Promise.resolve();

function wait(ms) { return new Promise((r) => setTimeout(r, ms)); }

// Jalankan fn lewat antrean serial dengan jeda minimum dari request sebelumnya.
function throttled(fn) {
  const run = chain.then(async () => {
    const gap = Date.now() - lastStart;
    if (gap < MIN_GAP_MS) await wait(MIN_GAP_MS - gap);
    lastStart = Date.now();
    return fn();
  });
  // Jaga rantai tetap hidup walau satu request gagal.
  chain = run.then(() => undefined, () => undefined);
  return run;
}

async function fetchJsonOnce(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Mitsuyomi/1.4.1',
        'Accept': 'application/json',
      },
    });
    if (!res.ok) {
      const err = new Error(`Upstream HTTP ${res.status}`);
      err.status = res.status;
      throw err;
    }
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

// GET JSON dari layanan data. Retry 1x hanya untuk error jaringan / 5xx (bukan 4xx).
async function fetchUpstream(pathname) {
  return throttled(async () => {
    const url = BASE + pathname;
    cache.bumpStat('upstream_requests');
    try {
      return await fetchJsonOnce(url);
    } catch (err) {
      if (err && err.status && err.status >= 400 && err.status < 500) throw err;
      await wait(2000);
      cache.bumpStat('upstream_requests');
      try {
        return await fetchJsonOnce(url);
      } catch (err2) {
        cache.bumpStat('upstream_errors');
        throw err2;
      }
    }
  });
}

// Lengkapi rating/tipe dari indeks meta + sumbangkan data baru ke indeks.
function withMeta(data) {
  if (!data || typeof data !== 'object') return data;
  if (Array.isArray(data.items)) {
    cache.mergeMeta(data.items);
    return { ...data, items: cache.enrichItems(data.items) };
  }
  if (data.slug && Array.isArray(data.chapters)) {
    cache.mergeMeta([data]); // respons detail: sumbangkan rating + tipe komik ini
  }
  return data;
}

// Ambil data lewat cache: segar -> langsung; basi/kosong -> ambil ulang;
// bila pengambilan ulang gagal dan ada cache lama, sajikan cache lama.
async function getCached(key, ttlMs, pathname, normalizeFn) {
  const hit = cache.getCache(key);
  if (hit && hit.fresh) {
    cache.bumpStat('cache_hits');
    return withMeta(hit.data);
  }
  try {
    const raw = await fetchUpstream(pathname);
    const data = normalizeFn(raw);
    cache.setCache(key, data, ttlMs);
    return withMeta(data);
  } catch (err) {
    if (hit) return withMeta(hit.data); // stale-while-error
    throw err;
  }
}

module.exports = { fetchUpstream, getCached, BASE };
