'use strict';
/* Mitsuyomi — detail komik + daftar chapter */
(async function detail() {
  const slug = decodeURIComponent(location.pathname.replace(/^\/komik\//, '').replace(/\/$/, ''));
  const area = document.getElementById('detailArea');
  const block = document.getElementById('chaptersBlock');
  const listEl = document.getElementById('chapterList');
  const filterEl = document.getElementById('chapterFilter');
  const sortBtn = document.getElementById('sortBtn');
  let chapters = [];
  let ascending = false;

  function renderChapters() {
    const f = filterEl.value.trim().toLowerCase();
    const readSet = readChaptersSet(slug);
    const rows = chapters.filter((c) => !f || c.title.toLowerCase().includes(f) || c.slug.toLowerCase().includes(f));
    listEl.innerHTML = rows.length ? rows.map((c) => `
      <a href="/baca/${encodeURIComponent(c.slug)}" class="${readSet.has(c.slug) ? 'read' : ''}">
        <span>${esc(c.title)}</span><span class="dt">${esc(c.date || '')}</span>
      </a>`).join('') : '<div class="empty">Chapter tidak ditemukan.</div>';
  }

  try {
    const d = await apiGet(`/api/komik/${encodeURIComponent(slug)}`);
    document.title = `${d.title} — Mitsuyomi`;
    chapters = d.chapters || [];
    const last = lastReadFor(slug);
    const firstChapter = chapters.length ? chapters[chapters.length - 1] : null;
    const newestChapter = chapters.length ? chapters[0] : null;
    const marked = isBookmarked(slug);

    const meta = [
      ['Tipe', d.type ? typeLabel(d.type) : null], ['Status', d.status], ['Rating', d.rating ? '★ ' + Number(d.rating).toFixed(1) : null],
      ['Pengarang', d.author], ['Artis', d.artist], ['Rilis', d.release], ['Chapter', chapters.length ? chapters.length + ' chapter' : null],
    ].filter(([, v]) => v);

    area.innerHTML = `
    <section class="detail-hero">
      <div class="wrap detail-in">
        <div class="detail-cover"><img src="${esc(coverSrc(d))}" alt="Cover ${esc(d.title)}" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src='${PLACEHOLDER}'"></div>
        <div class="detail-info">
          <span class="sticker">${esc(d.status || 'Komik')}</span>
          <h1>${esc(d.title)}</h1>
          ${d.otherTitle && d.otherTitle !== d.title ? `<div class="alt">${esc(d.otherTitle)}</div>` : ''}
          <div class="meta-table">${meta.map(([k, v]) => `<div class="meta-cell"><div class="k">${esc(k)}</div><div class="v">${esc(v)}</div></div>`).join('')}</div>
          <p class="synopsis">${esc(d.synopsis || 'Sinopsis belum tersedia.')}</p>
          ${d.genres && d.genres.length ? `<div class="genre-row">${visibleGenres(d.genres).map((g) => `<a href="/jelajahi?genre=${encodeURIComponent(g.slug)}">${esc(g.name)}</a>`).join('')}</div>` : ''}
          <div class="detail-actions">
            ${firstChapter ? `<a class="btn acc" href="/baca/${encodeURIComponent(firstChapter.slug)}">Baca dari Awal</a>` : ''}
            ${last ? `<a class="btn" href="/baca/${encodeURIComponent(last.chapterSlug)}">Lanjut: ${esc(last.chapterTitle)}</a>` : (newestChapter ? `<a class="btn" href="/baca/${encodeURIComponent(newestChapter.slug)}">Chapter Terbaru</a>` : '')}
            <button class="btn dark" id="bookmarkBtn" type="button">${marked ? '★ Di Bookmark' : '☆ Bookmark'}</button>
          </div>
        </div>
      </div>
    </section>`;

    const btn = document.getElementById('bookmarkBtn');
    btn.addEventListener('click', () => {
      const now = toggleBookmark(d);
      btn.textContent = now ? '★ Di Bookmark' : '☆ Bookmark';
    });

    if (chapters.length) {
      block.style.display = 'block';
      renderChapters();
      filterEl.addEventListener('input', renderChapters);
      sortBtn.addEventListener('click', () => {
        ascending = !ascending;
        chapters = [...chapters].reverse();
        sortBtn.textContent = ascending ? 'Urutan: Terlama ↑' : 'Urutan: Terbaru ↓';
        renderChapters();
      });
    }
  } catch (err) {
    if (err.code === 'LOGIN_REQUIRED') {
      area.innerHTML = `<div class="wrap"><div class="errbox"><b>Khusus member.</b><br>Komik ini termasuk kategori dewasa, jadi perlu masuk dulu untuk membukanya.<br><br><a class="btn acc small" href="/masuk?next=${encodeURIComponent(location.pathname)}">Masuk</a> <a class="btn dark small" href="/daftar">Daftar</a></div></div>`;
    } else {
      area.innerHTML = `<div class="wrap">${errHtml(err.message)}</div>`;
    }
  }
})();
