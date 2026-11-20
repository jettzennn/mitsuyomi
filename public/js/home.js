'use strict';
/* Mitsuyomi — beranda */
(async function home() {
  const latestEl = document.getElementById('latestGrid');
  const popEl = document.getElementById('populerList');
  const recomEl = document.getElementById('recomGrid');
  const genreEl = document.getElementById('genreChips');
  const heroEl = document.getElementById('heroCovers');
  try {
    const home = await apiGet('/api/home');

    // Hero: 3 cover populer dibuat miring berselotip
    const heroItems = (home.populer.items || []).slice(0, 3);
    if (heroItems.length && heroEl) {
      heroEl.innerHTML = heroItems.map((it, i) => `
        <a class="taped t${i + 1}" href="/komik/${encodeURIComponent(it.slug)}">
          <img src="${esc(coverSrc(it))}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src='${PLACEHOLDER}'">
        </a>`).join('');
      const st = document.getElementById('heroSticker');
      if (st && home.terbaru.items && home.terbaru.items[0]) st.textContent = 'Terbaru: ' + (home.terbaru.items[0].chapter || 'chapter baru');
    }

    latestEl.innerHTML = gridHtml((home.terbaru.items || []).slice(0, 12));

    const pop = home.populer.items || [];
    popEl.innerHTML = pop.length ? `<div class="rank-list">${pop.map((it, i) => `
      <a class="rank" href="/komik/${encodeURIComponent(it.slug)}">
        <span class="no">${i + 1}</span>
        <img src="${esc(coverSrc(it))}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src='${PLACEHOLDER}'">
        <span>
          <h3>${esc(it.title)}</h3>
          <span class="meta">${esc(typeLabel(it.type))}${it.rating != null ? ' • ★ ' + esc(Number(it.rating).toFixed(1)) : ''}${it.chapter ? ' • ' + esc(it.chapter) : ''}</span>
        </span>
      </a>`).join('')}</div>` : '<div class="empty">Belum ada data populer.</div>';

    genreEl.innerHTML = (home.genres || []).map((g) => `<a class="chip" href="/jelajahi?genre=${encodeURIComponent(g.slug)}">${esc(g.name)}</a>`).join('') || '<div class="empty">Genre belum tersedia.</div>';

    recomEl.innerHTML = gridHtml((home.recomen.items || []).slice(0, 8));
  } catch (err) {
    latestEl.innerHTML = errHtml(err.message);
    popEl.innerHTML = '';
    recomEl.innerHTML = '';
    genreEl.innerHTML = '';
  }
})();
