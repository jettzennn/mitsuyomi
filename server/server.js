'use strict';
// Mitsuyomi — server utama (Node.js murni tanpa dependensi, SQLite via node:sqlite).
const fs = require('fs');
const path = require('path');
const http = require('http');
const { getCached } = require('./api');
const { normList, normDetail, normChapter, normGenres } = require('./normalize');
const cache = require('./cache');
const auth = require('./auth');
const mailer = require('./mailer');

// --- Muat .env sederhana (bila ada) ---
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const PORT = Number(process.env.PORT || 3000);
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

const MENIT = 60 * 1000;
const TTL = {
  home: 10 * MENIT,
  list: 10 * MENIT,
  populer: 30 * MENIT,
  genres: 24 * 60 * MENIT,
  search: 15 * MENIT,
  detail: 30 * MENIT,
  chapter: 24 * 60 * MENIT,
};

const SLUG_RE = /^[a-z0-9][a-z0-9\-]{0,160}$/i;
const TYPES = ['manga', 'manhwa', 'manhua'];

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(body);
}

function fail(res, status, msg) { sendJson(res, status, { error: msg }); }
function failCode(res, status, code, msg) { sendJson(res, status, { error: msg, code }); }

// --- Genre khusus member: disembunyikan dari daftar publik, butuh masuk ---
const HIDDEN_GENRE_SLUGS = new Set(['adult', 'doujinshi']);
function isHiddenGenre(g) {
  const slug = String((g && (g.slug || g.name)) || '').toLowerCase().replace(/\s+/g, '-');
  return HIDDEN_GENRE_SLUGS.has(slug);
}
function visibleGenres(list) { return (list || []).filter((g) => !isHiddenGenre(g)); }
function detailNeedsLogin(detail) {
  return Boolean(detail && Array.isArray(detail.genres) && detail.genres.some(isHiddenGenre));
}
function loginRequired(res) {
  return failCode(res, 401, 'LOGIN_REQUIRED', 'Konten ini khusus member. Masuk dulu ya.');
}

// --- Urutan hasil pencarian: judul utama dulu, baru sekuel/spinoff ---
// Judul yang persis sama / diawali kata kunci naik duluan; judul dengan
// penanda sekuel (season, part, angka, tanda titik dua untuk sub-judul)
// turun ke belakang, lalu judul lebih pendek didahulukan.
function normText(s) {
  return String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}
const SEQUEL_WORDS = /\b(season|part|final|movie|ova|ona|special|spinoff|spin off|sequel|prequel|remake|2nd|3rd|4th|5th|6th)\b/;
function sequelPenalty(title) {
  const t = normText(title);
  let p = 0;
  if (String(title).includes(':')) p += 2;
  if (SEQUEL_WORDS.test(t)) p += 3;
  const nums = t.match(/\b\d+\b/g);
  if (nums) p += Math.min(3, nums.length);
  if (/\b(ii|iii|iv|v|vi|vii|viii|ix|x)\b/.test(t)) p += 2;
  return p;
}
function rankSearchItems(items, q) {
  const nq = normText(q);
  const score = (it) => {
    const nt = normText(it.title);
    let base = 4;
    if (nt === nq) base = 0;
    else if (nt.startsWith(nq)) base = 1;
    else if ((' ' + nt + ' ').includes(' ' + nq + ' ')) base = 2;
    else if (nt.includes(nq)) base = 3;
    return [base, sequelPenalty(it.title), nt.length];
  };
  return [...(items || [])].sort((a, b) => {
    const sa = score(a);
    const sb = score(b);
    for (let i = 0; i < sa.length; i++) if (sa[i] !== sb[i]) return sa[i] - sb[i];
    return String(a.title).localeCompare(String(b.title));
  });
}

// Lengkapi rating/tipe yang kosong lewat data detail, di latar belakang
// (tidak menahan respons; hasilnya masuk indeks meta untuk muatan berikutnya).
function backgroundEnrich(items, budget) {
  const missing = (items || []).filter((i) => i && i.slug && (i.rating == null || !i.type)).slice(0, budget);
  if (missing.length === 0) return;
  (async () => {
    for (const it of missing) {
      try {
        await getCached(`detail:${it.slug}`, TTL.detail, `/bacakomik/detail/${encodeURIComponent(it.slug)}`, (raw) => normDetail(raw, it.slug));
      } catch (_) { /* abaikan, dicoba lagi lain waktu */ }
    }
  })();
}

async function apiRoute(req, res, url) {
  const p = url.pathname;

  if (p === '/api/health') {
    return sendJson(res, 200, { ok: true, app: 'mitsuyomi', version: '1.4.1', cacheEntries: cache.cacheSize(), time: new Date().toISOString() });
  }

  if (p === '/api/home') {
    const [terbaru, populer, recomen, genres] = await Promise.all([
      getCached('list:terbaru:1', TTL.home, '/bacakomik/latest?page=1', normList),
      getCached('list:populer', TTL.populer, '/bacakomik/populer', normList),
      getCached('list:recomen', TTL.populer, '/bacakomik/recomen', normList),
      getCached('genres', TTL.genres, '/bacakomik/genres', normGenres),
    ]);
    backgroundEnrich(terbaru.items, 6);
    return sendJson(res, 200, { terbaru, populer, recomen, genres: visibleGenres(genres) });
  }

  if (p === '/api/terbaru') {
    const page = clampPage(url.searchParams.get('page'));
    const data = await getCached(`list:terbaru:${page}`, TTL.list, `/bacakomik/latest?page=${page}`, normList);
    data.currentPage = page; // field currentPage dari layanan data tidak akurat
    backgroundEnrich(data.items, 6);
    return sendJson(res, 200, data);
  }

  if (p === '/api/populer') {
    const data = await getCached('list:populer', TTL.populer, '/bacakomik/populer', normList);
    return sendJson(res, 200, data);
  }

  if (p === '/api/top') {
    const data = await getCached('list:top', TTL.populer, '/bacakomik/top', normList);
    backgroundEnrich(data.items, 10);
    return sendJson(res, 200, data);
  }

  if (p === '/api/rekomendasi') {
    const data = await getCached('list:recomen', TTL.populer, '/bacakomik/recomen', normList);
    return sendJson(res, 200, data);
  }

  if (p === '/api/cari') {
    const q = (url.searchParams.get('q') || '').trim().slice(0, 80);
    if (q.length < 2) return fail(res, 400, 'Kata kunci minimal 2 karakter.');
    const data = await getCached(`search:${q.toLowerCase()}`, TTL.search, `/bacakomik/search/${encodeURIComponent(q)}`, normList);
    return sendJson(res, 200, { ...data, items: rankSearchItems(data.items, q) });
  }

  if (p === '/api/genres') {
    const data = await getCached('genres', TTL.genres, '/bacakomik/genres', normGenres);
    return sendJson(res, 200, { genres: visibleGenres(data) });
  }

  let m;
  if ((m = p.match(/^\/api\/genre\/([^/]+)$/))) {
    const slug = decodeURIComponent(m[1]);
    if (!SLUG_RE.test(slug)) return fail(res, 400, 'Genre tidak valid.');
    if (HIDDEN_GENRE_SLUGS.has(slug.toLowerCase()) && !auth.getSessionUser(req)) return loginRequired(res);
    const page = clampPage(url.searchParams.get('page'));
    const data = await getCached(`list:genre:${slug}:${page}`, TTL.list, `/bacakomik/genre/${encodeURIComponent(slug)}?page=${page}`, normList);
    data.currentPage = page;
    return sendJson(res, 200, data);
  }

  if ((m = p.match(/^\/api\/tipe\/([^/]+)$/))) {
    const type = decodeURIComponent(m[1]).toLowerCase();
    if (!TYPES.includes(type)) return fail(res, 400, 'Tipe tidak valid.');
    const data = await getCached(`list:tipe:${type}`, TTL.list, `/bacakomik/only/${type}`, normList);
    backgroundEnrich(data.items, 6);
    return sendJson(res, 200, data);
  }

  if ((m = p.match(/^\/api\/komik\/([^/]+)$/))) {
    const slug = decodeURIComponent(m[1]);
    if (!SLUG_RE.test(slug)) return fail(res, 400, 'Slug tidak valid.');
    const data = await getCached(`detail:${slug}`, TTL.detail, `/bacakomik/detail/${encodeURIComponent(slug)}`, (raw) => normDetail(raw, slug));
    if (!data || !data.title) return fail(res, 404, 'Komik tidak ditemukan.');
    if (detailNeedsLogin(data) && !auth.getSessionUser(req)) return loginRequired(res);
    return sendJson(res, 200, data);
  }

  if ((m = p.match(/^\/api\/baca\/([^/]+)$/))) {
    const slug = decodeURIComponent(m[1]);
    if (!SLUG_RE.test(slug)) return fail(res, 400, 'Slug tidak valid.');
    const comicSlug = slug.replace(/-chapter[- ].*$/i, '');
    try {
      const detail = await getCached(`detail:${comicSlug}`, TTL.detail, `/bacakomik/detail/${encodeURIComponent(comicSlug)}`, (raw) => normDetail(raw, comicSlug));
      if (detailNeedsLogin(detail) && !auth.getSessionUser(req)) return loginRequired(res);
    } catch (_) { /* detail gagal tidak menghalangi pemeriksaan chapter */ }
    const data = await getCached(`chapter:${slug}`, TTL.chapter, `/bacakomik/chapter/${encodeURIComponent(slug)}`, (raw) => normChapter(raw, slug));
    if (!data || data.images.length === 0) return fail(res, 404, 'Chapter tidak ditemukan atau belum tersedia.');
    return sendJson(res, 200, data);
  }

  return fail(res, 404, 'Endpoint tidak ditemukan.');
}

// --- Akun: daftar / aktivasi / masuk / lupa kata sandi / sesi ---
function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > 64 * 1024) { reject(new Error('Body terlalu besar')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); }
      catch (_) { reject(new Error('JSON tidak valid')); }
    });
    req.on('error', reject);
  });
}

function baseUrl(req) {
  const env = (process.env.APP_BASE_URL || '').replace(/\/$/, '');
  if (env) return env;
  return `http://${req.headers.host || `localhost:${PORT}`}`;
}

function devLinkFor(result, url) {
  // Tautan uji hanya tampil bila email tidak terkirim (SMTP belum tersambung)
  // dan tidak dimatikan lewat AUTH_SHOW_DEV_LINK=0.
  if (result && !result.delivered && process.env.AUTH_SHOW_DEV_LINK !== '0') return url;
  return undefined;
}

async function authRoute(req, res, url) {
  const p = url.pathname;

  if (p === '/api/auth/me' && req.method === 'GET') {
    return sendJson(res, 200, { user: auth.publicUser(auth.getSessionUser(req)) });
  }

  if (p === '/api/auth/activate' && req.method === 'GET') {
    const r = auth.consumeAuthToken(url.searchParams.get('token') || '', 'activation');
    if (r.error === 'expired') return failCode(res, 410, 'TOKEN_EXPIRED', 'Tautan aktivasi sudah kedaluwarsa (berlaku 60 detik). Minta tautan baru.');
    if (r.error || !r.user) return fail(res, 400, 'Tautan aktivasi tidak valid.');
    auth.activateUser(r.user.id);
    return sendJson(res, 200, { ok: true, email: r.user.email });
  }

  if (req.method !== 'POST') return fail(res, 404, 'Endpoint tidak ditemukan.');
  let body;
  try { body = await readJsonBody(req); } catch (err) { return fail(res, 400, err.message); }

  if (p === '/api/auth/register') {
    const name = String(body.name || '').trim().slice(0, 60);
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    if (name.length < 2) return fail(res, 400, 'Nama minimal 2 karakter.');
    if (!auth.GMAIL_RE.test(email)) return fail(res, 400, 'Email harus memakai domain @gmail.com. Domain lain ditolak.');
    if (password.length < 8) return fail(res, 400, 'Kata sandi minimal 8 karakter.');
    let user = auth.getUserByEmail(email);
    if (user && user.status === 'active') return fail(res, 409, 'Email sudah terdaftar. Silakan masuk.');
    if (user) { // pendaftaran ulang akun yang belum aktif: perbarui data + kirim tautan baru
      cache.getDb().prepare('UPDATE users SET name = ? WHERE id = ?').run(name, user.id);
      auth.updatePassword(user.id, password);
    } else {
      user = auth.createUser(name, email, password);
    }
    const token = auth.createAuthToken(user.id, 'activation');
    const link = `${baseUrl(req)}/aktivasi?token=${token}`;
    const mail = mailer.activationEmail(name, link);
    const result = await mailer.sendMail(email, mail.subject, mail.html, mail.text);
    return sendJson(res, 200, { ok: true, status: 'pending', expiresIn: 60, mailSent: result.delivered, devLink: devLinkFor(result, link) });
  }

  if (p === '/api/auth/resend-activation') {
    const email = String(body.email || '').trim().toLowerCase();
    const user = auth.getUserByEmail(email);
    if (user && user.status === 'active') return sendJson(res, 200, { ok: true, alreadyActive: true });
    if (!user) return sendJson(res, 200, { ok: true }); // generik, cegah menebak email terdaftar
    const token = auth.createAuthToken(user.id, 'activation');
    const link = `${baseUrl(req)}/aktivasi?token=${token}`;
    const mail = mailer.activationEmail(user.name, link);
    const result = await mailer.sendMail(email, mail.subject, mail.html, mail.text);
    return sendJson(res, 200, { ok: true, expiresIn: 60, mailSent: result.delivered, devLink: devLinkFor(result, link) });
  }

  if (p === '/api/auth/login') {
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    const user = auth.getUserByEmail(email);
    if (!user || !auth.verifyPassword(password, user.password_hash)) return fail(res, 401, 'Email atau kata sandi salah.');
    if (user.status !== 'active') return failCode(res, 403, 'NOT_ACTIVE', 'Akun belum aktif. Cek email untuk tautan aktivasi, atau minta tautan baru.');
    const session = auth.createSession(user.id);
    res.setHeader('Set-Cookie', auth.sessionCookieHeader(session));
    return sendJson(res, 200, { ok: true, user: auth.publicUser(user) });
  }

  if (p === '/api/auth/logout') {
    const raw = auth.parseCookies(req)[auth.SESSION_COOKIE];
    auth.destroySession(raw);
    res.setHeader('Set-Cookie', auth.clearCookieHeader());
    return sendJson(res, 200, { ok: true });
  }

  if (p === '/api/auth/forgot') {
    const email = String(body.email || '').trim().toLowerCase();
    const user = auth.getUserByEmail(email);
    if (!user || user.status !== 'active') return sendJson(res, 200, { ok: true, expiresIn: 60 });
    const token = auth.createAuthToken(user.id, 'reset');
    const link = `${baseUrl(req)}/reset-password?token=${token}`;
    const mail = mailer.resetEmail(user.name, link);
    const result = await mailer.sendMail(email, mail.subject, mail.html, mail.text);
    return sendJson(res, 200, { ok: true, expiresIn: 60, mailSent: result.delivered, devLink: devLinkFor(result, link) });
  }

  if (p === '/api/auth/reset') {
    const password = String(body.password || '');
    if (password.length < 8) return fail(res, 400, 'Kata sandi minimal 8 karakter.');
    const r = auth.consumeAuthToken(String(body.token || ''), 'reset');
    if (r.error === 'expired') return failCode(res, 410, 'TOKEN_EXPIRED', 'Tautan atur ulang sudah kedaluwarsa (berlaku 60 detik). Minta tautan baru.');
    if (r.error || !r.user) return fail(res, 400, 'Tautan atur ulang tidak valid.');
    auth.updatePassword(r.user.id, password);
    auth.destroyUserSessions(r.user.id);
    return sendJson(res, 200, { ok: true });
  }

  return fail(res, 404, 'Endpoint tidak ditemukan.');
}

function clampPage(v) {
  const n = parseInt(v, 10);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(n, 500);
}

// --- Rate limit sederhana per IP untuk /api (cegah penyalahgunaan proxy) ---
const ipHits = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const win = 60 * 1000;
  const max = 240;
  const arr = (ipHits.get(ip) || []).filter((t) => now - t < win);
  arr.push(now);
  ipHits.set(ip, arr);
  if (ipHits.size > 5000) ipHits.clear();
  return arr.length > max;
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.json': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
};

function securityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' https: data:; style-src 'self' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; script-src 'self'; connect-src 'self'; base-uri 'self'; form-action 'self'");
}

function serveFile(res, filePath) {
  fs.readFile(filePath, (err, buf) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('404 — halaman tidak ditemukan'); }
    const ext = path.extname(filePath).toLowerCase();
    const headers = { 'Content-Type': MIME[ext] || 'application/octet-stream' };
    if (ext === '.html') headers['Cache-Control'] = 'no-cache';
    else headers['Cache-Control'] = 'public, max-age=86400';
    res.writeHead(200, headers);
    res.end(buf);
  });
}

const server = http.createServer(async (req, res) => {
  securityHeaders(res);
  let url;
  try { url = new URL(req.url, 'http://localhost'); } catch (_) { return fail(res, 400, 'URL tidak valid.'); }

  const p = url.pathname;
  const isAuthApi = p.startsWith('/api/auth/');

  if (req.method !== 'GET' && req.method !== 'HEAD' && !(req.method === 'POST' && isAuthApi)) {
    res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Method Not Allowed');
  }

  if (isAuthApi) {
    const ip = (req.socket.remoteAddress || 'unknown');
    if (rateLimited(ip)) return fail(res, 429, 'Terlalu banyak permintaan. Pelan-pelan ya.');
    try {
      return await authRoute(req, res, url);
    } catch (err) {
      return fail(res, 500, 'Terjadi kesalahan di server akun. Coba lagi.');
    }
  }

  if (p.startsWith('/api/')) {
    const ip = (req.socket.remoteAddress || 'unknown');
    if (rateLimited(ip)) return fail(res, 429, 'Terlalu banyak permintaan. Pelan-pelan ya.');
    try {
      return await apiRoute(req, res, url);
    } catch (err) {
      return fail(res, 502, 'Layanan data sedang bermasalah. Coba lagi sebentar.');
    }
  }

  // Rute halaman (clean URL)
  if (p === '/' || p === '/index.html') return serveFile(res, path.join(PUBLIC_DIR, 'index.html'));
  if (p === '/jelajahi') return serveFile(res, path.join(PUBLIC_DIR, 'jelajahi.html'));
  if (p === '/koleksi') return serveFile(res, path.join(PUBLIC_DIR, 'koleksi.html'));
  if (p === '/cari') return serveFile(res, path.join(PUBLIC_DIR, 'cari.html'));
  if (p === '/akun') return serveFile(res, path.join(PUBLIC_DIR, 'akun.html'));
  if (p === '/masuk') return serveFile(res, path.join(PUBLIC_DIR, 'masuk.html'));
  if (p === '/daftar') return serveFile(res, path.join(PUBLIC_DIR, 'daftar.html'));
  if (p === '/lupa-password') return serveFile(res, path.join(PUBLIC_DIR, 'lupa.html'));
  if (p === '/aktivasi') return serveFile(res, path.join(PUBLIC_DIR, 'aktivasi.html'));
  if (p === '/reset-password') return serveFile(res, path.join(PUBLIC_DIR, 'reset.html'));
  if (/^\/komik\/[^/]+$/.test(p)) return serveFile(res, path.join(PUBLIC_DIR, 'komik.html'));
  if (/^\/baca\/[^/]+$/.test(p)) return serveFile(res, path.join(PUBLIC_DIR, 'baca.html'));

  // File statis — hanya dari folder public, cegah path traversal
  const rel = decodeURIComponent(p).replace(/^\/+/, '');
  const full = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!full.startsWith(PUBLIC_DIR)) { res.writeHead(403); return res.end('Forbidden'); }
  return serveFile(res, full);
});

server.listen(PORT, () => {
  console.log(`Mitsuyomi jalan di http://localhost:${PORT}`);
});
