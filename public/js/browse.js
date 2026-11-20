'use strict';
/* Mitsuyomi — halaman Jelajahi sekarang khusus GENRE.
   Tanpa kolom pencarian dan tanpa kartu komik: yang tampil hanya daftar
   genre dalam grid rapi. Kartu baru muncul setelah satu genre dipilih. */
(function browseGenres() {
  const params = new URLSearchParams(location.search);
  const area = document.getElementById('resultArea');
  const titleEl = document.getElementById('browseTitle');
  const subEl = document.getElementById('browseSub');
  const backEl = document.getElementById('genreBack');
  const loadRow = document.getElementById('loadMoreRow');
  const loadBtn = document.getElementById('loadMoreBtn');

  // Pencarian punya halaman khusus (/cari).
  const q = (params.get('q') || '').trim();
  if (q) { location.replace(`/cari?q=${encodeURIComponent(q)}`); return; }

  const genre = (params.get('genre') || '').trim();
  let page = 1;
  let hasNext = false;
  let loading = false;

  async function showGenreGrid() {
    titleEl.innerHTML = 'GEN<span class="acc">RE</span>';
    subEl.textContent = 'Semua genre dalam satu tempat — pilih untuk melihat komiknya';
    backEl.style.display = 'none';
    loadRow.style.display = 'none';
    area.innerHTML = '<div class="loading"><span class="spin"></span>Memuat genre…</div>';
    try {
      const data = await apiGet('/api/genres');
      const genres = visibleGenres(data.genres || []);
      area.innerHTML = genres.length
        ? `<div class="genre-grid">${genres.map((g) => `<a class="gtile" href="/jelajahi?genre=${encodeURIComponent(g.slug)}">${esc(g.name)}</a>`).join('')}</div>`
        : '<div class="empty">Genre belum tersedia.</div>';
    } catch (err) {
      area.innerHTML = errHtml(err.message);
    }
  }

  async function loadGenre(append) {
    if (loading) return;
    loading = true;
    if (!append) area.innerHTML = '<div class="loading"><span class="spin"></span>Memuat komik…</div>';
    loadBtn.textContent = 'Memuat…';
    try {
      const data = await apiGet(`/api/genre/${encodeURIComponent(genre)}?page=${page}`);
      const items = data.items || [];
      hasNext = Boolean(data.hasNextPage);
      if (append) {
        const grid = area.querySelector('.grid');
        if (grid) grid.insertAdjacentHTML('beforeend', items.map(cardHtml).join(''));
        else area.innerHTML = gridHtml(items);
      } else {
        area.innerHTML = items.length ? gridHtml(items) : '<div class="empty">Belum ada komik untuk genre ini.</div>';
      }
      loadRow.style.display = hasNext ? 'block' : 'none';
    } catch (err) {
      loadRow.style.display = 'none';
      if (err.code === 'LOGIN_REQUIRED') {
        area.innerHTML = `<div class="errbox"><b>Khusus member.</b><br>Genre ini hanya bisa dibuka setelah masuk.<br><br><a class="btn acc small" href="/masuk?next=${encodeURIComponent(location.pathname + location.search)}">Masuk</a> <a class="btn dark small" href="/daftar">Daftar</a></div>`;
      } else if (!append) {
        area.innerHTML = errHtml(err.message);
      }
    } finally {
      loading = false;
      loadBtn.textContent = 'Muat Lagi';
    }
  }

  loadBtn.addEventListener('click', () => { page += 1; loadGenre(true); });

  if (genre) {
    titleEl.innerHTML = `GENRE: <span class="acc">${esc(genre.toUpperCase())}</span>`;
    subEl.textContent = 'Komik berdasarkan genre';
    backEl.style.display = 'inline';
    loadGenre(false);
  } else {
    showGenreGrid();
  }
})();
