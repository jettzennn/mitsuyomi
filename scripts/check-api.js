'use strict';
// Cek cepat kesehatan layanan data: node scripts/check-api.js
const api = require('../server/api');
const { normList, normDetail, normChapter, normGenres } = require('../server/normalize');

(async () => {
  const steps = [
    ['latest', '/bacakomik/latest?page=1', (r) => normList(r).items.length + ' komik'],
    ['populer', '/bacakomik/populer', (r) => normList(r).items.length + ' komik'],
    ['genres', '/bacakomik/genres', (r) => normGenres(r).length + ' genre'],
    ['search', '/bacakomik/search/naruto', (r) => normList(r).items.length + ' hasil'],
  ];
  let firstSlug = null;
  for (const [name, path, describe] of steps) {
    try {
      const raw = await api.fetchUpstream(path);
      console.log(`OK   ${name}: ${describe(raw)}`);
      if (name === 'latest') {
        const items = normList(raw).items;
        if (items.length) firstSlug = items[0].slug;
      }
    } catch (e) {
      console.log(`GAGAL ${name}: ${e.message}`);
    }
  }
  if (firstSlug) {
    try {
      const raw = await api.fetchUpstream(`/bacakomik/detail/${firstSlug}`);
      const d = normDetail(raw, firstSlug);
      console.log(`OK   detail ${firstSlug}: ${d.chapters.length} chapter`);
      if (d.chapters.length) {
        const chSlug = d.chapters[d.chapters.length - 1].slug;
        const rawCh = await api.fetchUpstream(`/bacakomik/chapter/${chSlug}`);
        const ch = normChapter(rawCh, chSlug);
        console.log(`OK   chapter ${chSlug}: ${ch.images.length} gambar`);
      }
    } catch (e) {
      console.log(`GAGAL detail/chapter: ${e.message}`);
    }
  }
  process.exit(0);
})();
