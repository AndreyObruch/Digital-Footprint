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

const PAGE = String.raw`<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Цифровой след — поиск предков в открытых архивах</title>
<style>
  :root { --bg:#0f1115; --fg:#e8eaed; --mut:#9aa0a6; --acc:#e8b34b; --line:#2a2e37; --card:#161922; }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--bg); color:var(--fg); font:16px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif; }
  [hidden] { display:none !important; }
  .top { display:flex; align-items:center; justify-content:space-between; gap:12px; max-width:760px; margin:0 auto; padding:14px 20px; border-bottom:1px solid var(--line); }
  .brand { font-weight:700; font-size:18px; color:var(--fg); border-bottom:1px dashed var(--acc); cursor:help; }
  .brand .ph { font-size:12px; opacity:.7; }
  nav { display:flex; gap:6px; }
  .navbtn { background:transparent; color:var(--mut); border:1px solid var(--line); border-radius:8px; padding:6px 12px; font-size:14px; font-weight:600; cursor:pointer; }
  .navbtn:hover { color:var(--fg); border-color:var(--acc); }
  .navbtn.active { color:#1a1400; background:var(--acc); border-color:var(--acc); }
  main { max-width:760px; margin:0 auto; padding:28px 20px 64px; }
  h1 { font-size:24px; margin:0 0 6px; }
  h2 { font-size:18px; margin:0 0 8px; }
  p.lead { color:var(--mut); margin:0 0 20px; }
  .fields { display:grid; grid-template-columns:repeat(2,1fr); gap:10px 12px; margin-bottom:12px; }
  .field label { display:block; font-size:13px; color:var(--mut); margin-bottom:4px; }
  .field input { width:100%; padding:10px 12px; border:1px solid var(--line); border-radius:10px; background:#0b0d12; color:var(--fg); font-size:15px; }
  .field input:focus { outline:none; border-color:var(--acc); }
  .field.full { grid-column:1 / -1; }
  .field .sub { font-size:12px; color:var(--mut); margin-top:4px; }
  .actions { display:flex; gap:8px; align-items:center; }
  button.go { padding:12px 22px; border:0; border-radius:10px; background:var(--acc); color:#1a1400; font-size:16px; font-weight:600; cursor:pointer; }
  button.go:hover { filter:brightness(1.08); }
  button.reset { padding:12px 16px; border:1px solid var(--line); border-radius:10px; background:transparent; color:var(--mut); font-size:14px; font-weight:600; cursor:pointer; }
  button.reset:hover { color:var(--fg); border-color:var(--acc); }
  .hint { color:var(--mut); font-size:13px; margin:10px 0 20px; }
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
  .savedlist { list-style:none; margin:0; padding:0; }
</style>
</head>
<body>
<header class="top">
  <div class="brand" title="название не утверждено — плейсхолдер до решения по бренду">Цифровой след <span class="ph">🔧</span></div>
  <nav>
    <button type="button" class="navbtn active" data-view="search">Поиск</button>
    <button type="button" class="navbtn" data-view="saved">Сохранённое</button>
  </nav>
</header>
<main>
  <section id="view-search">
    <p class="lead">Заполни то, что знаешь. Чем больше якорей — тем точнее подборка; пустые поля не мешают. Сервис ищет по открытым архивам и показывает ссылку на первоисточник. Ничего не выдумываем: если не найдено — так и скажем.</p>
    <form id="f" autocomplete="off">
      <div class="fields">
        <div class="field"><label for="lastName">Фамилия</label><input type="text" id="lastName" name="lastName" placeholder="Обруч"></div>
        <div class="field"><label for="firstName">Имя</label><input type="text" id="firstName" name="firstName" placeholder="Николай"></div>
        <div class="field"><label for="middleName">Отчество</label><input type="text" id="middleName" name="middleName" placeholder="Фёдорович"></div>
        <div class="field"><label for="year">Примерный год</label><input type="text" id="year" name="year" placeholder="1941 или 1941-1945"></div>
        <div class="field"><label for="place">Место</label><input type="text" id="place" name="place" placeholder="волость, уезд, губерния"></div>
        <div class="field"><label for="rankUnit">Звание / часть</label><input type="text" id="rankUnit" name="rankUnit" placeholder="красноармеец, 26 зап. эшелон"></div>
        <div class="field full"><label for="anchor">Семейный документ-якорь 🔧</label><input type="text" id="anchor" name="anchor" placeholder="напр.: отчество из свидетельства о рождении сына — 16.06.1936, Алма-Ата"><div class="sub">🔧 заглушка: пока только текстовая подсказка-якорь, загрузка файла и разбор документа — позже (шаг 6/7 плана).</div></div>
      </div>
      <div class="actions">
        <button type="submit" class="go">Найти</button>
        <button type="button" class="reset" id="resetBtn">Сбросить</button>
      </div>
    </form>
    <p class="hint">Подсказка: якорь из семейного документа (отчество, точная дата, место) схлопывает шум однофамильцев — это проверено на контрольном кейсе.</p>
    <p id="status" role="status" aria-live="polite"></p>
    <div id="results"></div>
  </section>
  <section id="view-saved" hidden>
    <h2>Сохранённые находки</h2>
    <p class="lead">Сюда будут попадать находки, сохранённые кнопкой «Сохранить» (шаг 7 плана). Сейчас это заглушка: список читается из локального хранилища браузера, бэкенд не подключён.</p>
    <ul id="savedList" class="savedlist"></ul>
    <p id="savedEmpty" class="hint">Пока ничего не сохранено. 🔧</p>
  </section>
</main>
<script>
(function () {
  var f = document.getElementById('f');
  var statusEl = document.getElementById('status');
  var resEl = document.getElementById('results');
  var resetBtn = document.getElementById('resetBtn');
  var ANCHOR_IDS = ['lastName', 'firstName', 'middleName', 'year', 'place', 'rankUnit', 'anchor'];

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function nrm(s) {
    return String(s == null ? '' : s).toLowerCase().replace(/ё/g, 'е').replace(/[^а-яa-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  }
  function hl(text, words) {
    var t = String(text == null ? '' : text);
    if (!words || !words.length) return esc(t);
    var set = {};
    words.forEach(function (w) { set[nrm(w)] = true; });
    return t.split(/([а-яa-z0-9ёЁ]+)/g).map(function (part) {
      var n = nrm(part);
      if (n && set[n]) return '<mark>' + esc(part) + '</mark>';
      return esc(part);
    }).join('');
  }

  // Собираем непустые якоря в строку слов; пустые поля отсекаются и не ломают поиск.
  function collectQuery() {
    var parts = [];
    ANCHOR_IDS.forEach(function (id) {
      var el = document.getElementById(id);
      var v = el ? el.value.trim() : '';
      if (v) parts.push(v);
    });
    return parts.join(' ');
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

  function runSearch() {
    var q = collectQuery();
    statusEl.className = '';
    statusEl.textContent = q ? 'Ищем…' : '';
    fetch('/search?q=' + encodeURIComponent(q))
      .then(function (r) { return r.json(); })
      .then(render)
      .catch(function () { statusEl.className = 'err'; statusEl.textContent = 'Не удалось связаться с сервером.'; });
  }

  f.addEventListener('submit', function (e) { e.preventDefault(); runSearch(); });
  resetBtn.addEventListener('click', function () {
    ANCHOR_IDS.forEach(function (id) { var el = document.getElementById(id); if (el) el.value = ''; });
    resEl.innerHTML = '';
    statusEl.className = '';
    statusEl.textContent = '';
  });
})();
</script>
<script>
// Маршрутизация экранов (шаг 1) + сбор якорей в запрос (шаг 2). Логика /search не тронута.
(function () {
  var btns = Array.prototype.slice.call(document.querySelectorAll('.navbtn'));
  var vSearch = document.getElementById('view-search');
  var vSaved = document.getElementById('view-saved');

  function escapeLite(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function renderSaved() {
    var list = document.getElementById('savedList');
    var empty = document.getElementById('savedEmpty');
    var items = [];
    try { items = JSON.parse(localStorage.getItem('df.saved') || '[]'); } catch (e) { items = []; }
    list.innerHTML = '';
    if (!items.length) { empty.hidden = false; return; }
    empty.hidden = true;
    items.forEach(function (it) {
      var li = document.createElement('li');
      li.className = 'card';
      var h = '<h2>' + (it.fullName ? escapeLite(it.fullName) : '—') + '</h2>';
      if (it.sourceUrl) h += '<a class="src" href="' + escapeLite(it.sourceUrl) + '" target="_blank" rel="noopener noreferrer">Открыть первоисточник ↗</a>';
      h += '<div class="row hint">🔧 заглушка: сохранение через localStorage браузера до подключения бэкенда (шаг 7).</div>';
      li.innerHTML = h;
      list.appendChild(li);
    });
  }

  function showView(name) {
    var isSearch = (name === 'search');
    vSearch.hidden = !isSearch;
    vSaved.hidden = isSearch;
    btns.forEach(function (b) { b.classList.toggle('active', b.getAttribute('data-view') === name); });
    if (!isSearch) renderSaved();
  }

  btns.forEach(function (b) {
    b.addEventListener('click', function () { showView(b.getAttribute('data-view')); });
  });
  var f = document.getElementById('f');
  if (f) f.addEventListener('submit', function () { showView('search'); });

  showView('search');
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