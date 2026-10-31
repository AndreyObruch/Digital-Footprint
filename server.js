const express = require('express');
const path = require('path');
const store = require('./store');

const app = express();
const PORT = process.env.PORT || 3000;

function norm(s) {
  return String(s == null ? '' : s)
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^а-яa-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function queryWords(q) {
  const seen = {};
  const out = [];
  norm(q).split(' ').forEach(function (w) {
    if (w.length >= 2 && !seen[w]) { seen[w] = true; out.push(w); }
  });
  return out;
}

function recordHaystack(r) {
  const parts = [r.fullName, r.docType, r.year, r.place, r.note].concat(r.keywords || []);
  const set = {};
  norm(parts.join(' ')).split(' ').forEach(function (w) { if (w) set[w] = true; });
  return set;
}

function doSearch(q) {
  const words = queryWords(q);
  if (!words.length) {
    return { query: q, count: 0, results: [], message: 'Введите хотя бы один якорь — фамилию, имя, год, место, звание или часть.' };
  }
  let records;
  try { records = store.loadAll(); }
  catch (e) { return { query: q, count: 0, results: [], error: 'index unreadable' }; }

  const scored = [];
  records.forEach(function (r) {
    const hay = recordHaystack(r);
    const matched = words.filter(function (w) { return hay[w] === true; });
    if (matched.length > 0) {
      scored.push({
        fullName: r.fullName,
        docType: r.docType,
        year: r.year || '',
        place: r.place || '',
        note: r.note || '',
        sourceUrl: r.sourceUrl,
        matchedWords: matched,
        score: matched.length
      });
    }
  });
  scored.sort(function (a, b) { return b.score - a.score; });
  const top = scored.slice(0, 10);
  return {
    query: q,
    count: top.length,
    totalMatches: scored.length,
    results: top,
    message: top.length
      ? 'Найдено записей: ' + top.length + '. Переходи по ссылке на первоисточник и проверяй сам.'
      : 'Ничего не найдено по этим якорям. Сервис не сочиняет версии — добавь или поменяй якоря (отчество, год, место, звание/часть).'
  };
}

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', project: 'digital-footprint' });
});

app.get('/search', (req, res) => {
  res.status(200).json(doSearch(String(req.query.q || '').trim()));
});

// Витрина: три файла явными роутами, чтобы express.static не отдавал наружу исходники сервера.
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});
app.get('/style.css', (req, res) => {
  res.type('text/css; charset=utf-8').sendFile(path.join(__dirname, 'style.css'));
});
app.get('/script.js', (req, res) => {
  res.type('application/javascript; charset=utf-8').sendFile(path.join(__dirname, 'script.js'));
});

app.listen(PORT, () => {
  console.log(`[server] listening on ${PORT}`);
});