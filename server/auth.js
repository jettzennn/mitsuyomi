'use strict';
// Mitsuyomi — akun pengguna: daftar, aktivasi via tautan (60 detik), masuk,
// lupa kata sandi via tautan atur ulang (60 detik), dan sesi berbasis cookie.
// Kata sandi di-hash scrypt; token disimpan sebagai sha256 (token mentah
// hanya ada di tautan yang dikirim ke email pengguna).
const crypto = require('crypto');
const { getDb } = require('./cache');

const TOKEN_TTL_MS = 60 * 1000; // tautan aktivasi & atur ulang hanya berlaku 60 detik
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const SESSION_COOKIE = 'myomi_session';

function sha256(s) { return crypto.createHash('sha256').update(String(s)).digest('hex'); }

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(password), salt, 64);
  return `scrypt:${salt.toString('hex')}:${hash.toString('hex')}`;
}

function verifyPassword(password, stored) {
  try {
    const [scheme, saltHex, hashHex] = String(stored).split(':');
    if (scheme !== 'scrypt') return false;
    const expected = Buffer.from(hashHex, 'hex');
    const actual = crypto.scryptSync(String(password), Buffer.from(saltHex, 'hex'), expected.length);
    return crypto.timingSafeEqual(expected, actual);
  } catch (_) { return false; }
}

function publicUser(u) {
  if (!u) return null;
  return { id: u.id, name: u.name, email: u.email, status: u.status, createdAt: u.created_at };
}

function getUserByEmail(email) {
  return getDb().prepare('SELECT * FROM users WHERE email = ?').get(String(email).toLowerCase()) || null;
}
function getUserById(id) {
  return getDb().prepare('SELECT * FROM users WHERE id = ?').get(id) || null;
}

function createUser(name, email, password) {
  const now = Date.now();
  const info = getDb().prepare('INSERT INTO users (name, email, password_hash, status, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(name, String(email).toLowerCase(), hashPassword(password), 'pending', now);
  return getUserById(Number(info.lastInsertRowid));
}

function updatePassword(userId, password) {
  getDb().prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(password), userId);
}

// Buat token sekali pakai (aktivasi / reset). Token lama sejenis untuk user
// yang sama dinonaktifkan supaya hanya tautan terbaru yang berlaku.
function createAuthToken(userId, kind) {
  const raw = crypto.randomBytes(32).toString('hex');
  const now = Date.now();
  const db = getDb();
  db.prepare('UPDATE auth_tokens SET used_at = ? WHERE user_id = ? AND kind = ? AND used_at IS NULL').run(now, userId, kind);
  db.prepare('INSERT INTO auth_tokens (user_id, kind, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(userId, kind, sha256(raw), now + TOKEN_TTL_MS, now);
  return raw;
}

// Pakai token: kembalikan { user } atau { error: 'invalid' | 'expired' }.
function consumeAuthToken(raw, kind) {
  if (!raw || typeof raw !== 'string' || raw.length < 32) return { error: 'invalid' };
  const db = getDb();
  const row = db.prepare('SELECT * FROM auth_tokens WHERE token_hash = ? AND kind = ?').get(sha256(raw), kind);
  if (!row || row.used_at) return { error: 'invalid' };
  if (Date.now() > row.expires_at) return { error: 'expired' };
  db.prepare('UPDATE auth_tokens SET used_at = ? WHERE id = ?').run(Date.now(), row.id);
  return { user: getUserById(row.user_id), tokenRow: row };
}

function activateUser(userId) {
  getDb().prepare("UPDATE users SET status = 'active', activated_at = ? WHERE id = ?").run(Date.now(), userId);
}

function createSession(userId) {
  const raw = crypto.randomBytes(32).toString('hex');
  const now = Date.now();
  getDb().prepare('INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)')
    .run(sha256(raw), userId, now + SESSION_TTL_MS, now);
  return raw;
}

function destroySession(raw) {
  if (!raw) return;
  getDb().prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(raw));
}

function destroyUserSessions(userId) {
  getDb().prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
}

function parseCookies(req) {
  const out = {};
  const header = req.headers.cookie || '';
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function getSessionUser(req) {
  const raw = parseCookies(req)[SESSION_COOKIE];
  if (!raw) return null;
  const row = getDb().prepare('SELECT * FROM sessions WHERE token_hash = ?').get(sha256(raw));
  if (!row) return null;
  if (Date.now() > row.expires_at) { destroySession(raw); return null; }
  const user = getUserById(row.user_id);
  if (!user || user.status !== 'active') return null;
  return user;
}

function sessionCookieHeader(raw) {
  return `${SESSION_COOKIE}=${encodeURIComponent(raw)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`;
}
function clearCookieHeader() {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
// Pendaftaran wajib Gmail asli (@gmail.com) — domain lain ditolak supaya
// akun tidak dummy dan tautan verifikasi benar-benar bisa diterima.
const GMAIL_RE = /^[^\s@]+@gmail\.com$/i;

module.exports = {
  TOKEN_TTL_MS, SESSION_COOKIE,
  hashPassword, verifyPassword, publicUser,
  getUserByEmail, getUserById, createUser, updatePassword,
  createAuthToken, consumeAuthToken, activateUser,
  createSession, destroySession, destroyUserSessions,
  parseCookies, getSessionUser, sessionCookieHeader, clearCookieHeader,
  EMAIL_RE,
  GMAIL_RE,
};
