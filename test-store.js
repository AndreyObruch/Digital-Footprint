const path = require('path');
const os = require('os');
const fs = require('fs');

// Изоляция теста: индекс пишется во временную папку, не в рабочий data/
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'df-test-'));

const store = require('./store');

let fail = 0; // счётчик провалов: в конце задаёт код выхода (0 = зелёное, 1 = красное)

// Эталонная запись контрольного кейса №1 (Обруч Н. Ф.)
const record = {
  sourceUrl: 'https://pamyat-naroda.ru/heroes/memorial_chelovek_donesenie123',
  fullName: 'Обруч Николай Фёдорович',
  nameVariants: ['Обруч Николай Федорович'],
  docType: 'именной список части',
  rank: 'красноармеец',
  unit: '26 зап. зенап',
  archiveRef: 'ЦАМО ф. 16513, оп. 70774, д. 23',
  scanUrl: null,
  battlePath: null,
  birthYear: null,
  birthPlace: null,
  eventDate: null,
  dateType: null,
  missing: ['год рождения', 'место рождения', 'открытый скан', 'боевые точки'],
  fetchedAt: '2026-10-26',
  accessNote: 'открытые данные, без авторизации'
};

store.upsert(record);
store.upsert(record); // повторный занос той же записи

const all = store.loadAll();
const t1 = all.length === 1;
console.log('записей в индексе:', all.length);
console.log(t1 ? 'ТЕСТ 1 ПРОЙДЕН: дублей нет' : 'ТЕСТ 1 ПРОВАЛЕН: дубль!');
if (!t1) fail++;

// Обновление той же записи: запись остаётся одна, поле заменяется
store.upsert({ ...record, rank: 'рядовой' });
const all2 = store.loadAll();
const t2 = all2.length === 1 && all2[0].rank === 'рядовой';
console.log('после обновления записей:', all2.length, '| звание:', all2[0].rank);
console.log(t2 ? 'ТЕСТ 2 ПРОЙДЕН: обновление на месте' : 'ТЕСТ 2 ПРОВАЛЕН');
if (!t2) fail++;

process.exit(fail ? 1 : 0);