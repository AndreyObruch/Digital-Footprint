// Цифровой след — поведение. /search и /health не трогаем: fetch тот же, что был инлайном.
(function () {
  'use strict';

  var ANCHORS = [
    { id: 'lastName',   label: 'фамилию' },
    { id: 'firstName',  label: 'имя' },
    { id: 'middleName', label: 'отчество' },
    { id: 'year',       label: 'примерный год' },
    { id: 'place',      label: 'место' },
    { id: 'rankUnit',   label: 'звание или часть' },
    { id: 'anchor',     label: 'якорь из семейного документа' }
  ];
  var SAVED_KEY = 'df.saved';
  var LOW_SCORE_THRESHOLD = 2; // ниже — «мало данных для уверенного ответа»

  var f = document.getElementById('f');
  var statusEl = document.getElementById('status');
  var resEl = document.getElementById('results');
  var resetBtn = document.getElementById('resetBtn');

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
      return (n && set[n]) ? '<mark>' + esc(part) + '</mark>' : esc(part);
    }).join('');
  }

  function val(id) { var el = document.getElementById(id); return el ? el.value.trim() : ''; }
  function collectQuery() {
    return ANCHORS.map(function (a) { return val(a.id); }).filter(Boolean).join(' ');
  }
  function emptyAnchors() {
    return ANCHORS.filter(function (a) { return !val(a.id); });
  }

  function missingList(r) {
    if (Array.isArray(r.missing) && r.missing.length) {
      return r.missing.map(function (t) { return { text: String(t) }; });
    }
    var list = [];
    if (r.year === '') list.push({ text: 'год рождения/выбытия' });
    if (r.place === '') list.push({ text: 'место рождения/призыва/выбытия' });
    return list;
  }

  function clearStatus() { statusEl.className = ''; statusEl.textContent = ''; }
  function setLoading() {
    statusEl.className = '';
    statusEl.innerHTML = '<span class="spinner"><span class="tape" aria-hidden="true"></span>Ищем по открытым архивам…</span>';
  }
  function setState(kind, html, extra) {
    statusEl.className = '';
    statusEl.innerHTML = '';
    var ic = kind === 'error' ? '⚠️' : '🔍';
    resEl.innerHTML = '<div class="state ' + kind + '"><span class="ic">' + ic + '</span><span class="tx">' + html + (extra || '') + '</span></div>';
  }
  function fixButtonsHtml() {
    var miss = emptyAnchors();
    if (!miss.length) return '';
    var btns = miss.map(function (a) {
      return '<button type="button" class="fixbtn" data-focus="' + a.id + '">+' + esc(a.label) + '</button>';
    }).join('');
    return '<div class="fix">' + btns + '</div>';
  }
  function repeatButtonHtml() {
    return '<div class="fix"><button type="button" class="fixbtn" data-act="repeat">Повторить</button></div>';
  }

  function savedKey(r) { return [r.sourceUrl || '', r.fullName || '', r.docType || ''].join('|'); }
  function loadSaved() {
    try { return JSON.parse(localStorage.getItem(SAVED_KEY) || '[]'); } catch (e) { return []; }
  }
  function isSaved(r) {
    var k = savedKey(r);
    return loadSaved().some(function (it) { return savedKey(it) === k; });
  }
  function saveRecord(r) {
    var list = loadSaved();
    var k = savedKey(r);
    if (list.some(function (it) { return savedKey(it) === k; })) return false;
    list.unshift({
      fullName: r.fullName || '', docType: r.docType || '', year: r.year || '',
      place: r.place || '', note: r.note || '', sourceUrl: r.sourceUrl || '',
      matchedWords: r.matchedWords || [], missing: missingList(r).map(function (m) { return m.text; }),
      savedAt: new Date().toISOString()
    });
    try { localStorage.setItem(SAVED_KEY, JSON.stringify(list)); } catch (e) {}
    return true;
  }

  function cardHtml(r, i) {
    var words = r.matchedWords || [];
    var h = '';
    h += '<h2>' + hl(r.fullName, words) + '</h2>';
    h += '<div class="meta">';
    if (r.docType) h += '<div class="row"><span class="lab">Тип документа</span><span class="val">' + hl(r.docType, words) + '</span></div>';
    if (r.year)    h += '<div class="row"><span class="lab">Год</span><span class="val">' + hl(r.year, words) + '</span></div>';
    if (r.place)   h += '<div class="row"><span class="lab">Место</span><span class="val">' + hl(r.place, words) + '</span></div>';
    h += '</div>';
    if (r.note) h += '<p class="note">' + hl(r.note, words) + '</p>';
    if (words.length) {
      h += '<div class="matched"><span class="mlab">сошлось по</span>' +
        words.map(function (w) { return '<span class="chip">' + esc(w) + '</span>'; }).join('') +
        ' <span class="score" title="число совпавших слов-якорей">score=' + (r.score != null ? r.score : words.length) + '</span></div>';
    }
    var miss = missingList(r);
    if (miss.length) {
      h += '<div class="missing"><span class="mlab">Чего в источнике нет</span>' +
        miss.map(function (m) { return '<span class="chip chip-off">' + esc(m.text) + '</span>'; }).join('') +
        '</div>';
    }
    h += '<div class="card-actions">';
    if (r.sourceUrl) h += '<a class="src" href="' + esc(r.sourceUrl) + '" target="_blank" rel="noopener noreferrer">Открыть первоисточник <span class="ar">↗</span></a>';
    var done = isSaved(r);
    h += '<button type="button" class="savebtn' + (done ? ' done' : '') + '" data-save="' + esc(savedKey(r)) + '">' + (done ? '✓ Сохранено' : 'Сохранить 🔧') + '</button>';
    h += '</div>';
    return h;
  }

  function render(data) {
    resEl.innerHTML = '';
    clearStatus();
    if (data.error) { setState('error', '<b>Индекс сейчас не читается.</b> Попробуй позже — это не потеря данных, а временный сбой доступа к хранилищу.', repeatButtonHtml()); return; }
    if (!data.results || !data.results.length) {
      setState('empty', '<b>' + esc(data.message || 'Ничего не найдено.') + '</b>', fixButtonsHtml());
      return;
    }
    statusEl.textContent = data.message || '';
    // ШАГ 2 ТЗ: состояние «мало данных для уверенного ответа»
    var first = data.results[0];
    var score = first.score != null ? first.score : (first.matchedWords ? first.matchedWords.length : 0);
    if (data.results.length === 1 && score < LOW_SCORE_THRESHOLD) {
      var miss = emptyAnchors();
      var missBtns = miss.map(function (a) {
        return '<button type="button" class="fixbtn" data-focus="' + a.id + '">+' + esc(a.label) + '</button>';
      }).join('');
      setState('lowconf',
        '<b>Мало данных для уверенного ответа.</b> Совпадение по ' + score + ' слов' + (score === 1 ? 'у' : (score >= 2 && score <= 4 ? 'ам' : 'ам')) + ', но это может быть однофамилец. Добавь якоря из семейного документа — отчество, точный год или место — чтобы схлопнуть шум.',
        missBtns ? '<div class="fix">' + missBtns + '</div>' : '');
      return;
    }
    data.results.forEach(function (r, i) {
      var card = document.createElement('div');
      card.className = 'card';
      card.style.setProperty('--i', String(i));
      card.setAttribute('data-key', savedKey(r));
      card.innerHTML = cardHtml(r, i);
      resEl.appendChild(card);
    });
  }

  function runSearch() {
    var q = collectQuery();
    if (!q) { clearStatus(); resEl.innerHTML = ''; return; }
    setLoading();
    fetch('/search?q=' + encodeURIComponent(q))
      .then(function (r) { return r.json(); })
      .then(render)
      .catch(function () { setState('error', '<b>Не удалось связаться с сервером.</b> Проверь, запущен ли сервер, и повтори поиск.', repeatButtonHtml()); });
  }

  resEl.addEventListener('click', function (e) {
    var t = e.target.closest ? e.target.closest('button, a') : null;
    if (!t) return;
    if (t.hasAttribute('data-focus')) {
      var el = document.getElementById(t.getAttribute('data-focus'));
      if (el) { el.focus(); el.scrollIntoView({ block: 'center' }); }
      return;
    }
    if (t.getAttribute('data-act') === 'repeat') { runSearch(); return; }
    if (t.hasAttribute('data-save')) {
      var key = t.getAttribute('data-save');
      var rec = lastResults.filter(function (r) { return savedKey(r) === key; })[0];
      if (rec) { saveRecord(rec); t.classList.add('done'); t.textContent = '✓ Сохранено'; }
      return;
    }
  });

  var lastResults = [];
  var _origRender = render;
  render = function (data) { lastResults = (data && data.results) ? data.results.slice() : []; _origRender(data); };

  if (f) f.addEventListener('submit', function (e) { e.preventDefault(); runSearch(); });
  if (resetBtn) resetBtn.addEventListener('click', function () {
    ANCHORS.forEach(function (a) { var el = document.getElementById(a.id); if (el) el.value = ''; });
    resEl.innerHTML = ''; clearStatus(); lastResults = [];
  });

  var btns = Array.prototype.slice.call(document.querySelectorAll('.navbtn'));
  var vSearch = document.getElementById('view-search');
  var vSaved = document.getElementById('view-saved');

  function renderSaved() {
    var list = document.getElementById('savedList');
    var empty = document.getElementById('savedEmpty');
    var items = loadSaved();
    list.innerHTML = '';
    if (!items.length) { empty.hidden = false; return; }
    empty.hidden = true;
    items.forEach(function (it) {
      var li = document.createElement('li');
      li.className = 'card';
      var h = '<h2>' + (it.fullName ? esc(it.fullName) : '—') + '</h2>';
      h += '<div class="meta">';
      if (it.docType) h += '<div class="row"><span class="lab">Тип документа</span><span class="val">' + esc(it.docType) + '</span></div>';
      if (it.year)    h += '<div class="row"><span class="lab">Год</span><span class="val">' + esc(it.year) + '</span></div>';
      if (it.place)   h += '<div class="row"><span class="lab">Место</span><span class="val">' + esc(it.place) + '</span></div>';
      h += '</div>';
      if (it.note) h += '<p class="note">' + esc(it.note) + '</p>';
      if (it.missing && it.missing.length) {
        h += '<div class="missing"><span class="mlab">Чего в источнике нет</span>' +
          it.missing.map(function (m) { return '<span class="chip chip-off">' + esc(m) + '</span>'; }).join('') + '</div>';
      }
      h += '<div class="card-actions">';
      if (it.sourceUrl) h += '<a class="src" href="' + esc(it.sourceUrl) + '" target="_blank" rel="noopener noreferrer">Открыть первоисточник <span class="ar">↗</span></a>';
      h += '<button type="button" class="savebtn done" data-unsave="' + esc(savedKey(it)) + '">Удалить</button>';
      h += '</div>';
      h += '<div class="stub">🔧 заглушка: сохранение через localStorage браузера до подключения бэкенда (шаг 7).</div>';
      li.innerHTML = h;
      list.appendChild(li);
    });
  }

  function showView(name) {
    var isSearch = (name === 'search');
    if (vSearch) vSearch.hidden = !isSearch;
    if (vSaved) vSaved.hidden = isSearch;
    btns.forEach(function (b) { b.classList.toggle('active', b.getAttribute('data-view') === name); });
    if (!isSearch) renderSaved();
  }

  btns.forEach(function (b) {
    b.addEventListener('click', function () { showView(b.getAttribute('data-view')); });
  });

  if (vSaved) vSaved.addEventListener('click', function (e) {
    var t = e.target.closest ? e.target.closest('button[data-unsave]') : null;
    if (!t) return;
    var key = t.getAttribute('data-unsave');
    var list = loadSaved().filter(function (it) { return savedKey(it) !== key; });
    try { localStorage.setItem(SAVED_KEY, JSON.stringify(list)); } catch (e2) {}
    renderSaved();
  });

  document.addEventListener('click', function (e) {
    var a = e.target.closest ? e.target.closest('a[href^="#"]') : null;
    if (!a) return;
    var id = a.getAttribute('href').slice(1);
    if (!id) return;
    var target = document.getElementById(id);
    if (!target) return;
    if (vSearch && vSearch.hidden && target.closest('#view-search')) { showView('search'); }
    setTimeout(function () { target.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 0);
  });

  showView('search');
})();