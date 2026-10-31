// test-search.js — автопроверка поиска (/search) на изолированном индексе.
// Индекс пишется во временную папку, сервер поднимается на порту 3999 в своём процессе.
// Реальный data/records.json и порт 3000 не затрагиваются.
const path = require('path');
const os = require('os');
const fs = require('fs');
const http = require('http');
const { spawn } = require('child_process');

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'df-search-'));
process.env.DATA_DIR = DIR;
const store = require('./store');

// Фикстуры (тестовые данные, не продуктовые): две разные записи, чтобы проверить разграничение.
store.upsert({
  sourceUrl: 'https://example.org/a',
  fullName: 'Обруч Николай Фёдорович',
  docType: 'именные списки частей',
  year: '',
  place: '',
  note: 'Звание: красноармеец. Место службы: 26 зап. эшелон. Хранение: ЦАМО, ф.16513, оп.70774, д.23.',
  keywords: ['Обруч', 'Николай Фёдорович', 'красноармеец', '26 зап. эшелон', 'именной список']
});
store.upsert({
  sourceUrl: 'https://example.org/b',
  fullName: 'Петров Пётр Петрович',
  docType: 'донесение о безвозвратных потерях',
  year: '1943',
  place: 'Калининская обл.',
  note: 'Стрелок, 1943 год.',
  keywords: ['Петров', 'стрелок', '1943']
});

const PORT = 3999;

function getJson(p) {
  return new Promise(function (resolve, reject) {
    http.get({ host: '127.0.0.1', port: PORT, path: p, timeout: 4000 }, function (res) {
      let buf = '';
      res.on('data', function (d) { buf += d; });
      res.on('end', function () {
        try { resolve(JSON.parse(buf)); } catch (e) { reject(e); }
      });
    }).on('error', reject).on('timeout', function () { this.destroy(new Error('timeout')); });
  });
}

async function waitReady() {
  for (let i = 0; i < 40; i++) {
    try { const h = await getJson('/health'); if (h && h.status === 'ok') return true; } catch (e) {}
    await new Promise(function (r) { setTimeout(r, 250); });
  }
  return false;
}

// Каждый кейс: q — запрос, check — предикат по ответу, name — как назвать проверку.
const CASES = [
  { name: 'по фамилии находится Обруч', q: 'Обруч', check: function (d) { return d.count >= 1 && d.results.some(function (r) { return r.fullName.indexOf('Обруч') === 0; }); } },
  { name: 'по ФИО находится Обруч', q: 'Обруч Николай', check: function (d) { return d.results.some(function (r) { return r.fullName.indexOf('Обруч') === 0 && r.matchedWords.indexOf('обруч') !== -1 && r.matchedWords.indexOf('николай') !== -1; }); } },
  { name: 'по званию+части находится Обруч', q: 'красноармеец эшелон', check: function (d) { return d.results.some(function (r) { return r.fullName.indexOf('Обруч') === 0; }); } },
  { name: 'регистр и ё/е не ломают поиск', q: 'ОБРУЧ николай фёдорович', check: function (d) { return d.results.some(function (r) { return r.fullName.indexOf('Обруч') === 0; }); } },
  { name: 'чужая запись не смешивается', q: 'Петров стрелок', check: function (d) { return d.results.some(function (r) { return r.fullName.indexOf('Петров') === 0; }) && !d.results.some(function (r) { return r.fullName.indexOf('Обруч') === 0; }); } },
  { name: 'скор растёт с числом совпавших слов', q: 'Обруч Николай красноармеец', check: function (d) { const r = d.results.filter(function (x) { return x.fullName.indexOf('Обруч') === 0; })[0]; return !!r && r.score === 3; } },
  { name: 'полностью чужой запрос честен (0)', q: 'Сидоров Кузьма 1700', check: function (d) { return d.count === 0 && /не найдено/i.test(d.message || ''); } },
  { name: 'пустой запрос даёт подсказку (0)', q: '', check: function (d) { return d.count === 0 && /введите/i.test(d.message || ''); } }
];

(async function main() {
  const child = spawn(process.execPath, ['server.js'], {
    cwd: __dirname,
    env: Object.assign({}, process.env, { DATA_DIR: DIR, PORT: String(PORT) }),
    stdio: ['ignore', 'ignore', 'pipe']
  });
  let fail = 0;
  try {
    const ready = await waitReady();
    if (!ready) { console.log('СЕРВЕР НЕ ПОДНЯЛСЯ — все кейсы провалены'); fail = CASES.length; }
    else {
      for (const c of CASES) {
        let d, ok = false, err = '';
        try { d = await getJson('/search?q=' + encodeURIComponent(c.q)); ok = !!c.check(d); }
        catch (e) { err = e.message; }
        if (ok) console.log('ПРОЙДЕН: ' + c.name);
        else { fail++; console.log('ПРОВАЛЕН: ' + c.name + (err ? (' (' + err + ')') : '')); }
      }
    }
  } finally {
    child.kill();
  }
  console.log('---');
  console.log(fail === 0 ? 'ВСЕ ПРОВЕРКИ ПОИСКА ПРОЙДЕНЫ' : ('ПРОВАЛЕНО ПРОВЕРОК: ' + fail));
  process.exit(fail === 0 ? 0 : 1);
})();