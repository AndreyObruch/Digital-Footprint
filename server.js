const express = require('express');
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
    return { query: q, count: 0, results: [], message: 'Введите фамилию, имя, год или место — хотя бы одно слово.' };
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
      : 'Ничего не найдено по этим словам. Сервис не сочиняет версии — попробуй другие слова или добавь запись в индекс.'
  };
}

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', project: 'digital-footprint' });
});

app.get('/search', (req, res) => {
  res.status(200).json(doSearch(String(req.query.q || '').trim()));
});

const PAGE = `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Цифровой след — поиск предков в открытых архивах</title>
<style>
  :root { --bg:#0f1115; --fg:#e8eaed; --mut:#9aa0a6; --acc:#e8b34b; --line:#2a2e37; --card:#161922; }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--bg); color:var(--fg); font:16px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif; }
  main { max-width:760px; margin:0 auto; padding:32px 20px 64px; }
  h1 { font-size:24px; margin:0 0 6px; }
  p.lead { color:var(--mut); margin:0 0 24px; }
  form { display:flex; gap:8px; margin-bottom:8px; }
  input[type=text] { flex:1; padding:12px 14px; border:1px solid var(--line); border-radius:10px; background:#0b0d12; color:var(--fg); font-size:16px; }
  input[type=text]:focus { outline:none; border-color:var(--acc); }
  button { padding:12px 18px; border:0; border-radius:10px; background:var(--acc); color:#1a1400; font-size:16px; font-weight:600; cursor:pointer; }
  button:hover { filter:brightness(1.08); }
  .hint { color:var(--mut); font-size:13px; margin:0 0 20px; }
  #status { min-height:20px; margin:0 0 16px; font-size:14px; }
  #status.err { color:#ff8a8a; }
  .card { border:1px solid var(--line); border-radius:12px; background:var(--card); padding:14px 16px; margin-bottom:12px; }
  .card h2 { font-size:17px; margin:0 0 4px; }
  .row { color:var(--mut); font-size:14px; margin:2px 0; }
  .row b { color:var(--fg); font-weight:600; }
  .note { margin:8px 0 0; font-size:14px; }
  .matched { margin-top:8px; display:flex; flex-wrap:wrap; gap:6px; }
  .chip { font-size:12px; padding:2px 8px; border-radius:999px; background:#2a2410; color:var(--acc); border:1px solid #4a3d12; }
  a.src { display:inline-block; margin-top:10px; color:var(--acc); text-decoration:none; font-size:14px; border-bottom:1px dashed var(--acc); }
  a.src:hover { border-bottom-style:solid; }
  mark { background:#4a3d12; color:var(--acc); padding:0 2px; border-radius:3px; }
</style>
</head>
<body>
<main>
  <h1>Цифровой след</h1>
  <p class="lead">Напиши обычными словами то, что знаешь о человеке — фамилию, имя, примерный год, место. Сервис найдёт записи в открытых архивах и покажет ссылку на первоисточник. Ничего не выдумываем: если не найдено — так и скажем.</p>
  <form id="f" autocomplete="off">
    <input type="text" id="q" name="q" placeholder="Например: Обруч Николай красноармеец" aria-label="Что вы знаете о человеке">
    <button type="submit">Найти</button>
  </form>
  <p class="hint">Подсказка: чем больше слов (фамилия + имя + год/место/звание), тем точнее подборка.</p>
  <p id="status" role="status" aria-live="polite"></p>
  <div id="results"></div>
</main>
<script>
(function () {
  var f = document.getElementById('f');
  var qEl = document.getElementById('q');
  var statusEl = document.getElementById('status');
  var resEl = document.getElementById('results');

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function nrm(s) {
    return String(s == null ? '' : s).toLowerCase().replace(/ё/g, 'е').replace(/[^а-яa-z0-9 ]/g, ' ').replace(/\\s+/g, ' ').trim();
  }
  // Подсветка совпавших слов прямо в тексте карточки.
  function hl(text, words) {
    var t = String(text == null ? '' : text);
    if (!words || !words.length) return esc(t);
    var re = new RegExp('(' + words.map(function (w) {
      return w.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&');
    }).join('|') + ')', 'gi');
    // Экранируем HTML, затем подставляем <mark> по нормализованным совпадениям.
    var safe = esc(t);
    return safe.replace(re, function (m) { return '<mark>' + m + '</mark>'; });
  }

  function render(data) {
    resEl.innerHTML = '';
    statusEl.className = '';
    statusEl.textContent = data.message || '';
    if (data.error) { statusEl.className = 'err'; statusEl.textContent = 'Индекс сейчас не читается. Попробуй позже.'; return; }
    if (!data.results || !data.results.length) return;
    data.results.forEach(function (r) {
      var card = document.createElement('div');
      card.className = 'card';
      var words = r.matchedWords || [];
      var html = '';
      html += '<h2>' + hl(r.fullName, words) + '</h2>';
      if (r.docType) html += '<div class="row"><b>Тип документа:</b> ' + hl(r.docType, words) + '</div>';
      if (r.year) html += '<div class="row"><b>Год:</b> ' + hl(r.year, words) + '</div>';
      if (r.place) html += '<div class="row"><b>Место:</b> ' + hl(r.place, words) + '</div>';
      if (r.note) html += '<p class="note">' + hl(r.note, words) + '</p>';
      if (words.length) {
        html += '<div class="matched">' + words.map(function (w) { return '<span class="chip">' + esc(w) + '</span>'; }).join('') + '</div>';
      }
      if (r.sourceUrl) html += '<a class="src" href="' + esc(r.sourceUrl) + '" target="_blank" rel="noopener noreferrer">Открыть первоисточник ↗</a>';
      card.innerHTML = html;
      resEl.appendChild(card);
    });
  }

  f.addEventListener('submit', function (e) {
    e.preventDefault();
    var q = qEl.value.trim();
    statusEl.className = '';
    statusEl.textContent = q ? 'Ищем…' : '';
    fetch('/search?q=' + encodeURIComponent(q))
      .then(function (r) { return r.json(); })
      .then(render)
      .catch(function () { statusEl.className = 'err'; statusEl.textContent = 'Не удалось связаться с сервером.'; });
  });
})();
</script>
</body>
</html>`;

app.get('/', (req, res) => {
  res.type('text/html; charset=utf-8').send(PAGE);
});

app.listen(PORT, () => {
  console.log(`[server] listening on ${PORT}`);
});