'use strict';
// Normalisasi semua bentuk respons layanan data menjadi satu skema internal Mitsuyomi.
// Skema daftar:  { slug, title, cover, chapter, date, type, rating, status, genres }
// Skema detail:  { slug, title, cover, rating, otherTitle, status, type, author, artist,
//                  release, synopsis, genres:[{slug,name}], chapters:[{slug,title,date}] }
// Skema baca:    { slug, title, comicSlug, images:[], prev, next }

function slugFromLink(link) {
  if (!link) return null;
  const m = String(link).match(/\/(?:manga|detail-komik)\/([^/?#]+)/);
  if (m) return m[1].replace(/\/$/, '');
  const parts = String(link).replace(/\/$/, '').split('/');
  return parts[parts.length - 1] || null;
}

function numOrNull(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = parseFloat(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function normItem(it) {
  if (!it || typeof it !== 'object') return null;
  const slug = it.slug || slugFromLink(it.link || it.href || it.url);
  const title = it.title || it.name;
  if (!slug || !title) return null;
  return {
    slug,
    title: String(title).trim(),
    cover: it.cover || it.image || it.thumbnail || it.img || null,
    chapter: it.chapter || it.latestChapter || it.chapterLatest || null,
    date: it.date || it.time_ago || it.updated || null,
    type: it.type ? String(it.type).trim() : null,
    rating: numOrNull(it.rating),
    status: it.status || null,
    genres: typeof it.genres === 'string' ? it.genres : (Array.isArray(it.genre) ? it.genre.join(', ') : (it.genre || null)),
  };
}

function normList(raw) {
  const arr = (raw && (raw.komikList || raw.data || raw.comics || raw.results)) || [];
  const items = arr.map(normItem).filter(Boolean);
  return {
    items,
    hasNextPage: Boolean(raw && (raw.hasNextPage ?? raw.has_next ?? (raw.pagination ? raw.pagination.hasNext : false))),
    currentPage: raw && raw.currentPage ? Number(raw.currentPage) : 1,
  };
}

function chapterTitleFromSlug(slug) {
  const m = String(slug).match(/chapter[- ]?([0-9]+(?:[.,][0-9]+)?)/i);
  if (m) return 'Chapter ' + m[1].replace(',', '.');
  const side = String(slug).match(/(side|extra|special|prologue|epilogue)[- ]?([0-9]*)/i);
  if (side) return (side[1][0].toUpperCase() + side[1].slice(1).toLowerCase()) + (side[2] ? ' ' + side[2] : '');
  return String(slug).replace(/[-_]+/g, ' ').trim();
}

function normDetail(raw, slug) {
  const d = (raw && raw.detail) || raw || {};
  const genres = Array.isArray(d.genres)
    ? d.genres.map((g) => (typeof g === 'string' ? { slug: g.toLowerCase().replace(/\s+/g, '-'), name: g } : { slug: g.slug || g.value || '', name: g.title || g.name || '' })).filter((g) => g.name)
    : [];
  const chapters = Array.isArray(d.chapters)
    ? d.chapters.map((c) => ({
        slug: c.slug || slugFromLink(c.link || c.href),
        title: (c.title && String(c.title).trim()) || chapterTitleFromSlug(c.slug || ''),
        date: c.date || null,
      })).filter((c) => c.slug)
    : [];
  const statusRaw = d.status || null;
  let status = statusRaw;
  if (statusRaw) {
    const s = String(statusRaw).toLowerCase();
    if (s.includes('berjalan') || s.includes('ongoing')) status = 'Ongoing';
    else if (s.includes('tamat') || s.includes('complete') || s.includes('end')) status = 'Completed';
  }
  return {
    slug,
    title: d.title || slug,
    cover: d.cover || d.image || null,
    rating: numOrNull(d.rating),
    otherTitle: d.otherTitle || d.title_indonesian || null,
    status,
    type: d.type || (d.metadata && d.metadata.type) || null,
    author: d.author || (d.metadata && d.metadata.author) || null,
    artist: d.artist || null,
    release: d.release || null,
    synopsis: d.synopsis || d.synopsis_full || '',
    genres,
    chapters,
  };
}

function normChapter(raw, slug) {
  const images = Array.isArray(raw && raw.images) ? raw.images.filter((u) => typeof u === 'string' && /^https?:\/\//.test(u)) : [];
  const nav = (raw && raw.navigation) || {};
  const comicSlug = String(slug).replace(/-chapter[- ].*$/i, '');
  return {
    slug,
    title: (raw && raw.title) || (raw && raw.chapter_title) || chapterTitleFromSlug(slug),
    comicTitle: (raw && raw.manga_title) || null,
    comicSlug,
    images,
    prev: nav.prev || nav.previousChapter || null,
    next: nav.next || nav.nextChapter || null,
  };
}

function normGenres(raw) {
  const arr = (raw && (raw.data || raw.genres)) || [];
  const seen = new Set();
  const out = [];
  for (const g of arr) {
    const slug = g.slug || g.value || '';
    const name = (g.title || g.name || '').trim();
    if (!slug || !name) continue;
    if (/^[0-9]+$/.test(name)) continue; // buang entri sampah seperti "2026"
    if (name.split(/\s+/).length > 3) continue; // buang gabungan genre acak dari layanan data
    const key = slug.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ slug, name });
  }
  // Buang nama yang merupakan potongan genre lain (mis. "Actio" vs "Action")
  return out.filter((g) => !out.some((o) => o !== g && o.name.toLowerCase().startsWith(g.name.toLowerCase()) && o.name.length > g.name.length));
}

module.exports = { normList, normDetail, normChapter, normGenres, chapterTitleFromSlug };
