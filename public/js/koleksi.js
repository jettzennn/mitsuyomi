'use strict';
/* Mitsuyomi — koleksi: bookmark & riwayat (localStorage) */
(function koleksi() {
  const bmArea = document.getElementById('bookmarkArea');
  const histArea = document.getElementById('historyArea');

  function render() {
    const bookmarks = getBookmarks();
    bmArea.innerHTML = bookmarks.length ? gridHtml(bookmarks) : '<div class="empty">Belum ada bookmark. Buka detail komik lalu tekan tombol Bookmark.</div>';

    const history = getHistory();
    histArea.innerHTML = history.length ? `<div class="chapter-list" style="max-height:none">${history.map((h) => `
      <a href="/baca/${encodeURIComponent(h.chapterSlug)}">
        <span>${esc(h.comicTitle)} — ${esc(h.chapterTitle)}</span>
        <span class="dt">${new Date(h.at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}</span>
      </a>`).join('')}</div>` : '<div class="empty">Belum ada riwayat baca. Mulai baca komik apa saja, nanti muncul di sini.</div>';
  }

  document.getElementById('clearBookmarks').addEventListener('click', () => { saveList(LS_BOOKMARKS, []); render(); });
  document.getElementById('clearHistory').addEventListener('click', () => { saveList(LS_HISTORY, []); render(); });
  render();
})();
