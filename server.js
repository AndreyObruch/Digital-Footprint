const express = require('express');
const store = require('./store');

const app = express();
const PORT = process.env.PORT || 3000;

// Нормализация: нижний регистр, ё->е, только буквы/цифры/пробелы, схлопнуть пробелы.
function norm(s) {
  return String(s == null ? '' : s)
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^а-яa-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Слова запроса: уникальные, длина >= 2.
function queryWords(q) {
  const seen = {};
  const out = [];
  norm(q).split(' ').forEach(function (w) {
    if (w.length >= 2 && !seen[w]) { seen[w] = true; out.push(w); }
  });
  return out;
}

// Текст записи для сопоставления (все значимые поля + keywords).
function recordHaystack(r) {
  const parts = [r.fullName, r.docType, r.year, r.place, r.note].concat(r.keywords || []);
  const set = {};
  norm(parts.join(' ')).split(' ').forEach(function (w) { if (w) set[w] = true; });
  return set;
}

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', project: 'digital-footprint' });
});

app.get('/', (req, res) => {
  res.type('text/plain').send('Digital Footprint — каркас. См. /health, /search?q=... и DOSSIER.md');
});

// Поиск по индексу: GET /search?q=<обычные слова>
app.get('/search', (req, res) => {
  const q = String(req.query.q || '').trim();
  const words = queryWords(q);

  if (!words.length) {
    return res.status(200).json({
      query: q,
      count: 0,
      results: [],
      message: 'Введите фамилию, имя, год или место — хотя бы одно слово.'
    });
  }

  let records;
  try {
    records = store.loadAll();
  } catch (e) {
    return res.status(500).json({ query: q, count: 0, results: [], error: 'index unreadable' });
  }

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

  res.status(200).json({
    query: q,
    count: top.length,
    totalMatches: scored.length,
    results: top,
    message: top.length
      ? 'Найдено записей: ' + top.length + '. Переходи по ссылке на первоисточник и проверяй сам.'
      : 'Ничего не найдено по этим словам. Сервис не сочиняет версии — попробуй другие слова или добавь запись в индекс.'
  });
});

app.listen(PORT, () => {
  console.log(`[server] listening on ${PORT}`);
});