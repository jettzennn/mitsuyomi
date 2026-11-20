'use strict';
/* Mitsuyomi — halaman Cari khusus: hanya kolom pencarian, riwayat pencarian
   (maksimal 8, grid 2 kolom, bisa dihapus satu-satu atau semua), dan kartu
   hasil pencarian. Hasil diurutkan judul utama dulu, baru sekuel/spinoff. */
(function searchPage() {
  const form = document.getElementById('bigSearchForm');
  const input = document.getElementById('bigSearchInput');
  const historySection = document.getElementById('historySection');
  const histGrid = document.getElementById('histGrid');
  const clearAllBtn = document.getElementById('histClearAll');
  const resultSection = document.getElementById('resultSection');
  const resultArea = document.getElementById('resultArea');
  const titleEl = document.getElementById('searchTitle');
  const subEl = document.getElementById('searchSub');

  let seq = 0;
  let timer = null;

  /* --- Riwayat pencarian (localStorage, maksimal 8) --- */
  const LS_SEARCH = 'mitsuyomi_search_history';
  function getSearchHistory() {
    try { return JSON.parse(localStorage.getItem(LS_SEARCH)) || []; } catch (_) { return []; }
  }
  function saveSearchHistory(list) {
    try { localStorage.setItem(LS_SEARCH, JSON.stringify(list.slice(0, 8))); } catch (_) {}
  }
  function renderHistory() {
    const list = getSearchHistory();
    if (!list.length) { historySection.style.display = 'none'; histGrid.innerHTML = ''; return; }
    historySection.style.display = 'block';
    histGrid.innerHTML = list.map((q) => `
      <div class="hist-item">
        <button type="button" class="hist-main" data-q="${esc(q)}">${esc(q)}</button>
        <button type="button" class="hist-x" data-del="${esc(q)}" aria-label="Hapus riwayat ${esc(q)}">×</button>
      </div>`).join('');
  }
  function rememberSearch(q) {
    const clean = (q || '').trim();
    if (clean.length < 2) return;
    const lower = clean.toLowerCase();
    const list = getSearchHistory().filter((x) => x.toLowerCase() !== lower);
    list.unshift(clean);
    saveSearchHistory(list);
    renderHistory();
  }
  histGrid.addEventListener('click', (e) => {
    const del = e.target.closest('[data-del]');
    if (del) {
      const target = del.getAttribute('data-del').toLowerCase();
      saveSearchHistory(getSearchHistory().filter((x) => x.toLowerCase() !== target));
      renderHistory();
      return;
    }
    const main = e.target.closest('[data-q]');
    if (main) {
      input.value = main.getAttribute('data-q');
      runSearch(input.value);
    }
  });
  clearAllBtn.addEventListener('click', () => { saveSearchHistory([]); renderHistory(); });

  /* --- Urutan hasil: judul utama dulu (jaga-jaga bila server belum mengurutkan) --- */
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
  function rankResults(items, q) {
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

  async function runSearch(q) {
    const mySeq = ++seq;
    q = (q || '').trim();
    if (q.length < 2) {
      resultSection.style.display = 'none';
      titleEl.innerHTML = 'CARI <span class="acc">KOMIK</span>';
      subEl.textContent = 'Ketik judul, hasil langsung muncul — judul utama tampil duluan';
      history.replaceState(null, '', '/cari');
      return;
    }
    resultSection.style.display = 'block';
    titleEl.innerHTML = 'HASIL <span class="acc">PENCARIAN</span>';
    subEl.textContent = `Menampilkan hasil untuk "${q}" — judul utama duluan, sekuel menyusul`;
    history.replaceState(null, '', `/cari?q=${encodeURIComponent(q)}`);
    resultArea.innerHTML = '<div class="loading"><span class="spin"></span>Mencari…</div>';
    try {
      const data = await apiGet(`/api/cari?q=${encodeURIComponent(q)}`);
      if (mySeq !== seq) return; // respons lama, abaikan
      rememberSearch(q);
      const items = rankResults(data.items || [], q);
      resultArea.innerHTML = items.length
        ? gridHtml(items)
        : `<div class="empty">Tidak ada hasil untuk "${esc(q)}". Coba judul lain.</div>`;
    } catch (err) {
      if (mySeq !== seq) return;
      resultArea.innerHTML = errHtml(err.message);
    }
  }

  form.addEventListener('submit', (e) => { e.preventDefault(); runSearch(input.value); });
  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => runSearch(input.value), 350);
  });

  renderHistory();
  const initial = new URLSearchParams(location.search).get('q') || '';
  if (initial) {
    input.value = initial;
    runSearch(initial);
  }
  input.focus();
})();
