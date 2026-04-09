'use strict';
/**
 * migrate_batch.js
 * 1. Adds `batch` column to users table (if not exists)
 * 2. Sets batch=2024 for all mentees whose rollno starts with 24
 * 3. Sets batch from UID prefix for any future UIDs (22→2022, 23→2023, etc.)
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const path = require('path');
const Database = require('better-sqlite3');

const DB_PATH = path.join(__dirname, '../mentor_mentee.db');
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

// --- 1. Add column if not exists ---
const cols = db.prepare(`PRAGMA table_info(users)`).all().map(c => c.name);
if (!cols.includes('batch')) {
    db.exec(`ALTER TABLE users ADD COLUMN batch TEXT DEFAULT ''`);
    console.log('✅ Added `batch` column to users table');
} else {
    console.log('ℹ️  `batch` column already exists');
}

// --- 2. Derive batch from UID prefix and update all mentees ---
const mentees = db.prepare(`SELECT id, rollno FROM users WHERE role = 'mentee'`).all();
const update  = db.prepare(`UPDATE users SET batch = ? WHERE id = ?`);

const setAll = db.transaction(() => {
    let updated = 0;
    for (const m of mentees) {
        const uid = String(m.rollno || '');
        // Extract 2-digit year prefix: "24U0007" → "24" → "2024"
        const match = uid.match(/^(\d{2})[A-Za-z]/);
        const batch = match ? `20${match[1]}` : '2024'; // default 2024
        update.run(batch, m.id);
        updated++;
    }
    return updated;
});

const count = setAll();
console.log(`✅ Set batch for ${count} mentee(s)`);

// Show sample
const sample = db.prepare(`SELECT rollno, batch FROM users WHERE role='mentee' AND batch != '' LIMIT 8`).all();
console.log('\nSample:');
sample.forEach(r => console.log(`  ${r.rollno} → batch ${r.batch}`));
console.log('\nDone ✅');
