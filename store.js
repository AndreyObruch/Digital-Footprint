const fs = require('fs');
const path = require('path');

// Resolves data dir: Amvera uses /data, local dev falls back to ./data inside project root
function getDataDir() {
  if (process.env.DATA_DIR) return process.env.DATA_DIR; // Explicit override for tests or custom setups
  if (fs.existsSync('/data') && fs.statSync('/data').isDirectory()) return '/data'; // Production on Amvera
  return path.join(__dirname, 'data'); // Local fallback
}

class Store {
  constructor() {
    this.dir = getDataDir();
    this.file = path.join(this.dir, 'records.json');
    this.ensureStorage();
  }

  ensureStorage() {
    if (!fs.existsSync(this.dir)) {
      fs.mkdirSync(this.dir, { recursive: true });
    }
    if (!fs.existsSync(this.file)) {
      fs.writeFileSync(this.file, JSON.stringify([], null, 2));
    }
  }

  loadAll() {
    try {
      const raw = fs.readFileSync(this.file, 'utf-8');
      return JSON.parse(raw);
    } catch (e) {
      console.error('[store] failed to parse records.json, resetting.', e.message);
      return [];
    }
  }

  saveAll(records) {
    fs.writeFileSync(this.file, JSON.stringify(records, null, 2));
  }

  upsert(record) {
    if (!record.sourceUrl || !record.fullName || !record.docType) {
      throw new Error('Invalid record: sourceUrl, fullName, docType are required.');
    }
    
    const key = `${record.sourceUrl}|${record.fullName}|${record.docType}`;
    let records = this.loadAll();
    
    const existingIndex = records.findIndex(r => r._key === key);
    if (existingIndex !== -1) {
      // Update existing entry without duplicating
      records[existingIndex] = { ...records[existingIndex], ...record };
    } else {
      // Add new entry with generated unique internal key
      records.push({ _key: key, ...record });
    }
    
    this.saveAll(records);
    return records.find(r => r._key === key);
  }
}

module.exports = new Store();