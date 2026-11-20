'use strict';
/* Mitsuyomi — util bersama semua halaman */

const PLACEHOLDER = '/img/placeholder.svg';

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function apiGet(path) {
  const res = await fetch(path, { headers: { 'Accept': 'application/json' } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Gagal memuat (${res.status})`);
    err.status = res.status;
    err.code = data.code;
    throw err;
  }
  return data;
}

async function apiPost(path, body) {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Gagal (${res.status})`);
    err.status = res.status;
    err.code = data.code;
    throw err;
  }
  return data;
}

/* --- Genre khusus member: disembunyikan dari daftar publik --- */
const HIDDEN_GENRE_SLUGS = new Set(['adult', 'doujinshi']);
function isHiddenGenre(g) {
  const slug = String((g && (g.slug || g.name)) || '').toLowerCase().replace(/\s+/g, '-');
  return HIDDEN_GENRE_SLUGS.has(slug);
}
function visibleGenres(list) { return (list || []).filter((g) => !isHiddenGenre(g)); }

function coverSrc(item) {
  return item && item.cover ? item.cover : PLACEHOLDER;
}

const TYPE_FLAGS = { manga: '🇯🇵', manhwa: '🇰🇷', manhua: '🇨🇳' };
function typeLabel(type) {
  if (!type) return 'KOMIK';
  const key = String(type).trim().toLowerCase();
  const flag = TYPE_FLAGS[key];
  const name = key.toUpperCase();
  return flag ? `${flag} ${name}` : name;
}

function cardHtml(item) {
  const rate = item.rating != null && item.rating !== ''
    ? `<span class="badge-rate">★ ${esc(Number(item.rating).toFixed(1))}</span>`
    : '<span class="badge-rate">★ –</span>';
  const type = `<span class="badge-type">${esc(typeLabel(item.type))}</span>`;
  return `<a class="card" href="/komik/${encodeURIComponent(item.slug)}">
    <span class="cover">
      <img src="${esc(coverSrc(item))}" alt="Cover ${esc(item.title)}" loading="lazy" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src='${PLACEHOLDER}'">
      ${type}${rate}
    </span>
    <span class="body">
      <h3>${esc(item.title)}</h3>
    </span>
  </a>`;
}

function gridHtml(items) {
  if (!items || items.length === 0) return '<div class="empty">Belum ada komik di bagian ini.</div>';
  return `<div class="grid">${items.map(cardHtml).join('')}</div>`;
}

function errHtml(msg) {
  return `<div class="errbox"><b>Gagal memuat.</b><br>${esc(msg)}<br><br><button class="btn dark small" onclick="location.reload()">Coba Lagi</button></div>`;
}

/* --- Penyimpanan lokal: bookmark & riwayat --- */
const LS_BOOKMARKS = 'mitsuyomi_bookmarks';
const LS_HISTORY = 'mitsuyomi_history';

function loadList(key) {
  try { return JSON.parse(localStorage.getItem(key)) || []; } catch (_) { return []; }
}
function saveList(key, arr) {
  try { localStorage.setItem(key, JSON.stringify(arr)); } catch (_) {}
}
function getBookmarks() { return loadList(LS_BOOKMARKS); }
function isBookmarked(slug) { return getBookmarks().some((b) => b.slug === slug); }
function toggleBookmark(item) {
  const list = getBookmarks();
  const i = list.findIndex((b) => b.slug === item.slug);
  if (i >= 0) { list.splice(i, 1); saveList(LS_BOOKMARKS, list); return false; }
  list.unshift({ slug: item.slug, title: item.title, cover: item.cover || null, type: item.type || null, rating: item.rating || null, addedAt: Date.now() });
  saveList(LS_BOOKMARKS, list.slice(0, 200));
  return true;
}
function getHistory() { return loadList(LS_HISTORY); }
function pushHistory(entry) {
  const list = getHistory().filter((h) => h.comicSlug !== entry.comicSlug);
  list.unshift({ ...entry, at: Date.now() });
  saveList(LS_HISTORY, list.slice(0, 60));
}
function lastReadFor(comicSlug) {
  return getHistory().find((h) => h.comicSlug === comicSlug) || null;
}
function readChaptersSet(comicSlug) {
  const set = new Set();
  for (const h of getHistory()) if (h.comicSlug === comicSlug && h.chapterSlug) set.add(h.chapterSlug);
  return set;
}

/* --- Ikon mata untuk kolom kata sandi --- */
const EYE_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
function initPwToggles(root) {
  (root || document).querySelectorAll('.pw-wrap .eye').forEach((btn) => {
    if (btn.dataset.bound) return;
    btn.dataset.bound = '1';
    btn.innerHTML = EYE_SVG;
    btn.addEventListener('click', () => {
      const input = btn.parentElement.querySelector('input');
      if (!input) return;
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      btn.classList.toggle('on', show);
      btn.setAttribute('aria-label', show ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi');
    });
  });
}

/* --- Hitung mundur (tautan aktivasi / atur ulang berlaku 60 detik) --- */
function startCountdown(el, seconds, onDone) {
  if (!el) return () => {};
  let s = seconds;
  el.textContent = String(s);
  const t = setInterval(() => {
    s -= 1;
    if (s <= 0) {
      clearInterval(t);
      el.textContent = '0';
      if (onDone) onDone();
    } else {
      el.textContent = String(s);
    }
  }, 1000);
  return () => clearInterval(t);
}

/* --- Kerangka situs: teks berjalan, pencarian, navbar bawah, hamburger --- */
(function initChrome() {
  const mq = document.getElementById('marquee');
  if (mq) {
    const seg = ' MANGA <b>*</b> MANHWA <b>*</b> MANHUA <b>*</b>';
    mq.innerHTML = seg.repeat(10);
  }

  // Kolom pencarian oranye di beranda hanya pintu masuk: mengetuknya membuka
  // halaman Cari khusus (di sanalah user benar-benar mengetik).
  document.querySelectorAll('form.search-gateway').forEach((form) => {
    const go = () => { location.href = '/cari'; };
    form.addEventListener('submit', (e) => { e.preventDefault(); go(); });
    form.addEventListener('click', go);
  });
  document.querySelectorAll('form.searchbar, form.hero-search:not(.search-gateway)').forEach((form) => {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const input = form.querySelector('input[type="search"], input[name="q"]');
      const q = input ? input.value.trim() : '';
      location.href = q ? `/cari?q=${encodeURIComponent(q)}` : '/cari';
    });
  });

  initPwToggles(document);

  const headerIn = document.querySelector('.header-in');
  if (!headerIn) return; // halaman baca tidak memakai kerangka ini

  /* Navbar bawah: Beranda / Jelajahi / Koleksi / Akun */
  const path = location.pathname;
  const navItems = [
    { href: '/', label: 'Beranda', on: path === '/', icon: '<path d="M4 11.2 12 4l8 7.2"/><path d="M6.5 9.8V20h11V9.8"/><path d="M10 20v-5h4v5"/>' },
    { href: '/jelajahi', label: 'Jelajahi', on: path.startsWith('/jelajahi'), icon: '<circle cx="12" cy="12" r="8.5"/><path d="m15.5 8.5-2 5-5 2 2-5z"/>' },
    { href: '/koleksi', label: 'Koleksi', on: path.startsWith('/koleksi'), icon: '<path d="M6.5 4.8c0-.9.7-1.6 1.6-1.6h7.8c.9 0 1.6.7 1.6 1.6V20l-5.5-3.8L6.5 20z"/>' },
    { href: '/akun', label: 'Akun', on: path.startsWith('/akun') || path.startsWith('/masuk') || path.startsWith('/daftar'), icon: '<circle cx="12" cy="8.2" r="3.6"/><path d="M5.2 20c1.2-3.4 3.8-5 6.8-5s5.6 1.6 6.8 5"/>' },
  ];
  const bottomNav = document.createElement('nav');
  bottomNav.className = 'bottomnav';
  bottomNav.setAttribute('aria-label', 'Navigasi bawah');
  bottomNav.innerHTML = navItems.map((n) => `
    <a href="${n.href}" class="${n.on ? 'active' : ''}">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${n.icon}</svg>
      <span>${n.label}</span>
    </a>`).join('');
  document.body.appendChild(bottomNav);
  document.body.classList.add('has-bottomnav');

  /* Hamburger + laci menu */
  const burger = document.createElement('button');
  burger.type = 'button';
  burger.className = 'burger';
  burger.setAttribute('aria-label', 'Buka menu');
  burger.innerHTML = '<span></span><span></span><span></span>';
  headerIn.appendChild(burger);

  const overlay = document.createElement('div');
  overlay.className = 'drawer-overlay';
  const drawer = document.createElement('aside');
  drawer.className = 'drawer';
  drawer.setAttribute('aria-label', 'Menu');
  drawer.innerHTML = `
    <div class="drawer-head">
      <span class="drawer-logo">MITSUYOMI<span class="dot">.</span></span>
      <button type="button" class="drawer-close" aria-label="Tutup menu">×</button>
    </div>
    <nav class="drawer-links">
      <a href="/">Beranda</a>
      <a href="/jelajahi">Jelajahi</a>
      <a href="/cari">Cari Komik</a>
      <a href="/koleksi">Koleksi</a>
      <a href="/akun">Akun</a>
    </nav>
    <div class="drawer-sec">Genre</div>
    <div class="drawer-genres" id="drawerGenres"><span class="drawer-dim">Memuat…</span></div>
    <div class="drawer-sec">Akun</div>
    <div class="drawer-auth" id="drawerAuth"><span class="drawer-dim">Memuat…</span></div>`;
  document.body.appendChild(overlay);
  document.body.appendChild(drawer);

  const openDrawer = () => { drawer.classList.add('open'); overlay.classList.add('show'); };
  const closeDrawer = () => { drawer.classList.remove('open'); overlay.classList.remove('show'); };
  burger.addEventListener('click', openDrawer);
  overlay.addEventListener('click', closeDrawer);
  drawer.querySelector('.drawer-close').addEventListener('click', closeDrawer);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeDrawer(); });

  apiGet('/api/genres').then((data) => {
    const el = document.getElementById('drawerGenres');
    if (el) el.innerHTML = visibleGenres(data.genres).slice(0, 14).map((g) => `<a href="/jelajahi?genre=${encodeURIComponent(g.slug)}">${esc(g.name)}</a>`).join('');
  }).catch(() => {
    const el = document.getElementById('drawerGenres');
    if (el) el.innerHTML = '<span class="drawer-dim">Genre gagal dimuat.</span>';
  });

  apiGet('/api/auth/me').then((data) => {
    const el = document.getElementById('drawerAuth');
    if (!el) return;
    if (data.user) {
      el.innerHTML = `<div class="drawer-user">${esc(data.user.name)}<br><span>${esc(data.user.email)}</span></div>
        <button type="button" class="btn dark small" id="drawerLogout">Keluar</button>`;
      document.getElementById('drawerLogout').addEventListener('click', async () => {
        try { await apiPost('/api/auth/logout', {}); } catch (_) {}
        location.href = '/';
      });
    } else {
      el.innerHTML = '<a class="btn acc small" href="/masuk">Masuk</a> <a class="btn dark small" href="/daftar">Daftar</a>';
    }
  }).catch(() => {
    const el = document.getElementById('drawerAuth');
    if (el) el.innerHTML = '<a class="btn acc small" href="/masuk">Masuk</a> <a class="btn dark small" href="/daftar">Daftar</a>';
  });
})();
