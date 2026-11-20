'use strict';
/* Mitsuyomi — pembaca chapter */
(async function reader() {
  const slug = decodeURIComponent(location.pathname.replace(/^\/baca\//, '').replace(/\/$/, ''));
  const titleEl = document.getElementById('readTitle');
  const pagesEl = document.getElementById('pages');
  const selectEl = document.getElementById('chapterSelect');
  const detailBtn = document.getElementById('toDetail');

  function navHtml(data) {
    const prev = data.prev ? `<a class="btn" href="/baca/${encodeURIComponent(data.prev)}">← Sebelumnya</a>` : '<span class="btn disabled">← Sebelumnya</span>';
    const list = `<a class="btn dark" href="/komik/${encodeURIComponent(data.comicSlug)}">Daftar Chapter</a>`;
    const next = data.next ? `<a class="btn acc" href="/baca/${encodeURIComponent(data.next)}">Berikutnya →</a>` : '<span class="btn disabled">Berikutnya →</span>';
    return prev + list + next;
  }

  try {
    const data = await apiGet(`/api/baca/${encodeURIComponent(slug)}`);
    document.title = `${data.title} — ${data.comicTitle || 'Mitsuyomi'}`;
    titleEl.textContent = `${data.comicTitle ? data.comicTitle + ' — ' : ''}${data.title}`;
    detailBtn.href = `/komik/${encodeURIComponent(data.comicSlug)}`;
    detailBtn.style.display = 'inline-flex';
    // Navigasi chapter hanya di BAWAH panel komik — tidak di atas, supaya
    // pembaca langsung masuk ke halaman pertama saat chapter dibuka.
    document.getElementById('navBottom').innerHTML = navHtml(data);

    let broken = 0;
    pagesEl.innerHTML = data.images.map((u, i) => `<img src="${esc(u)}" alt="Halaman ${i + 1}" loading="lazy" referrerpolicy="no-referrer" onerror="this.style.display='none';this.dataset.broken='1'">`).join('');
    pagesEl.addEventListener('error', () => {
      broken = pagesEl.querySelectorAll('img[data-broken]').length;
      if (broken && broken === data.images.length) {
        pagesEl.innerHTML = '<div class="errbox">Semua gambar chapter gagal dimuat. Coba lagi sebentar.</div>';
      }
    }, true);

    // Simpan riwayat + isi dropdown chapter dari detail komik
    try {
      const detail = await apiGet(`/api/komik/${encodeURIComponent(data.comicSlug)}`);
      pushHistory({
        comicSlug: data.comicSlug,
        comicTitle: detail.title,
        cover: detail.cover || null,
        chapterSlug: slug,
        chapterTitle: data.title,
      });
      const chs = detail.chapters || [];
      if (chs.length) {
        selectEl.innerHTML = chs.map((c) => `<option value="${esc(c.slug)}" ${c.slug === slug ? 'selected' : ''}>${esc(c.title)}</option>`).join('');
        selectEl.style.display = 'block';
        selectEl.addEventListener('change', () => { location.href = `/baca/${encodeURIComponent(selectEl.value)}`; });
      }
    } catch (_) { /* riwayat/dropdown gagal tidak boleh menghalangi baca */ }

    // Navigasi keyboard
    document.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight' && data.next) location.href = `/baca/${encodeURIComponent(data.next)}`;
      if (e.key === 'ArrowLeft' && data.prev) location.href = `/baca/${encodeURIComponent(data.prev)}`;
    });
  } catch (err) {
    if (err.code === 'LOGIN_REQUIRED') {
      titleEl.textContent = 'Khusus member';
      pagesEl.innerHTML = `<div class="errbox"><b>Khusus member.</b><br>Chapter ini dari komik kategori dewasa, jadi perlu masuk dulu untuk membacanya.<br><br><a class="btn acc small" href="/masuk?next=${encodeURIComponent(location.pathname)}">Masuk</a> <a class="btn dark small" href="/daftar">Daftar</a></div>`;
    } else {
      titleEl.textContent = 'Chapter tidak ditemukan';
      pagesEl.innerHTML = errHtml(err.message);
    }
  }

  // Bilah progres baca
  const bar = document.getElementById('progressBar');
  document.addEventListener('scroll', () => {
    const h = document.documentElement;
    const max = h.scrollHeight - h.clientHeight;
    bar.style.width = (max > 0 ? (h.scrollTop / max) * 100 : 0) + '%';
  }, { passive: true });
})();
