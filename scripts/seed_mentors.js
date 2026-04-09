'use strict';
/**
 * seed_mentors.js
 * 
 * 1. Reads the Mentor-Mentee Allotment Excel file
 * 2. Extracts all unique mentor names (with carry-forward logic)
 * 3. Creates mentor accounts in SQLite (email derived from name)
 * 4. Assigns every mentee to their correct mentor
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const XLSX   = require('xlsx');
const bcrypt = require('bcryptjs');
const path   = require('path');
const Database = require('better-sqlite3');

const DB_PATH    = path.join(__dirname, '../mentor_mentee.db');
const XLSX_PATH  = 'C:\\Users\\hp\\Downloads\\Mentor-Mentee Allotment - CSE.xlsx';
const EMAIL_DOMAIN = 'college.edu';          // mentor email domain
const DEFAULT_PW   = 'mentor@123';           // default mentor password

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ── Column aliases (same as bulk-upload) ──────────────────────────────────────
const COL_ALIASES = {
    'student name':         'studentName',
    'uid':                  'uid',
    'contact number':       'phone',
    'father mobile number': 'fatherPhone',
    'mother mobile number': 'motherPhone',
    'mentor name':          'mentorRaw',
    'name of the student':  'studentName',
    'student id':           'uid',
    'student mobile':       'phone',
    'student mobile number':'phone',
    'father mobile':        'fatherPhone',
    'mother mobile':        'motherPhone',
    'mentor mobile':        'mentorRaw',
    'mentor mobile number': 'mentorRaw',
    'mentor name with their mobile number': 'mentorRaw',
};

function buildColMap(rawHeaders) {
    const map = {};
    for (const h of rawHeaders) {
        const key = COL_ALIASES[h.trim().toLowerCase()];
        if (key) map[key] = h;
    }
    return map;
}

function parseMentorName(raw) {
    const str = String(raw || '').trim();
    if (!str) return '';
    // "PROF. SEENA KALGHATGI  9876543210" → "PROF. SEENA KALGHATGI"
    return str.replace(/\s+\d{10,}\s*$/, '').trim();
}

/**
 * Derive a mentor email from their full name.
 * "PROF. SEENA KALGHATGI" → "seena.kalghatgi@college.edu"
 * "DR. RAMESH KUMAR"      → "ramesh.kumar@college.edu"
 */
function mentorEmail(fullName) {
    // Remove titles (PROF., DR., MR., MRS., MS.)
    const cleaned = fullName
        .replace(/^(PROF\.|DR\.|MR\.|MRS\.|MS\.)\s*/i, '')
        .trim();
    const parts = cleaned.split(/\s+/).filter(Boolean);
    const email = parts.map(p => p.toLowerCase()).join('.') + '@' + EMAIL_DOMAIN;
    return email;
}

// ── Read Excel ────────────────────────────────────────────────────────────────
const workbook  = XLSX.readFile(XLSX_PATH);
const sheet     = workbook.Sheets[workbook.SheetNames[0]];
const rows      = XLSX.utils.sheet_to_json(sheet, { defval: '' });

const rawHeaders = Object.keys(rows[0]);
const colMap     = buildColMap(rawHeaders);

console.log('Detected columns:', colMap);

// ── Build mentor→mentee map with carry-forward ────────────────────────────────
let lastMentor = '';
const assignMap = []; // [{ uid, mentorName }]
const mentorSet = new Set();

for (const row of rows) {
    const get = key => colMap[key] ? String(row[colMap[key]] || '').trim() : '';
    const uid       = get('uid');
    const mentorRaw = get('mentorRaw');
    const parsed    = parseMentorName(mentorRaw);

    if (parsed) lastMentor = parsed;
    if (lastMentor) mentorSet.add(lastMentor);

    const studentName = get('studentName');
    if (uid && uid !== '------' && studentName) {
        assignMap.push({ uid, mentorName: parsed || lastMentor });
    }
}

console.log(`\nFound ${mentorSet.size} unique mentors:`);
[...mentorSet].forEach(n => console.log(' •', n));

// ── Create mentor accounts ────────────────────────────────────────────────────
const defaultHash = bcrypt.hashSync(DEFAULT_PW, 10);
const mentorIdMap = {}; // mentorName.toLowerCase() → db id

const insertUser = db.prepare(`
    INSERT INTO users (name, email, password_hash, role, department)
    VALUES (?, ?, ?, 'mentor', 'Computer Science')
`);
const findByEmail = db.prepare(`SELECT id, name FROM users WHERE email = ? LIMIT 1`);
const findByName  = db.prepare(`SELECT id, name FROM users WHERE role='mentor' AND LOWER(name) = LOWER(?) LIMIT 1`);

console.log('\n── Creating mentor accounts ──────────────────────────────────');
for (const name of mentorSet) {
    const email = mentorEmail(name);

    // Check if already exists by email or name
    let existing = findByEmail.get(email) || findByName.get(name);
    if (existing) {
        console.log(`  ✔ EXISTS   ${name} (${email}) → id=${existing.id}`);
        mentorIdMap[name.toLowerCase()] = existing.id;
        continue;
    }

    try {
        const info = insertUser.run(name, email, defaultHash);
        console.log(`  ✅ CREATED  ${name} (${email}) → id=${info.lastInsertRowid}`);
        mentorIdMap[name.toLowerCase()] = info.lastInsertRowid;
    } catch (e) {
        console.error(`  ❌ FAILED   ${name}: ${e.message}`);
    }
}

// ── Assign mentees to mentors ─────────────────────────────────────────────────
console.log('\n── Assigning mentees ─────────────────────────────────────────');
let assigned = 0, skipped = 0, missing = 0;

const findMentee    = db.prepare(`SELECT id FROM users WHERE rollno = ? AND role = 'mentee' LIMIT 1`);
const findMapping   = db.prepare(`SELECT id, mentor_id FROM mentor_mentee WHERE mentee_id = ? LIMIT 1`);
const insertMapping = db.prepare(`INSERT INTO mentor_mentee (mentor_id, mentee_id) VALUES (?, ?)`);
const updateMapping = db.prepare(`UPDATE mentor_mentee SET mentor_id = ?, assigned_at = ? WHERE id = ?`);

const doAssign = db.transaction(() => {
    for (const { uid, mentorName } of assignMap) {
        const mentorId = mentorIdMap[mentorName.toLowerCase()];
        if (!mentorId) { missing++; continue; }

        const mentee = findMentee.get(uid);
        if (!mentee) { skipped++; continue; }

        const existing = findMapping.get(mentee.id);
        if (existing) {
            if (existing.mentor_id !== mentorId) {
                updateMapping.run(mentorId, new Date().toISOString(), existing.id);
                assigned++;
            } else {
                skipped++;
            }
        } else {
            insertMapping.run(mentorId, mentee.id);
            assigned++;
        }
    }
});

doAssign();

console.log(`\n  ✅ Assigned/Updated : ${assigned}`);
console.log(`  ⏭  Already correct  : ${skipped}`);
console.log(`  ❓ Mentor not found  : ${missing}`);
console.log('\n── Summary ───────────────────────────────────────────────────');
console.log(`Mentor accounts    : ${Object.keys(mentorIdMap).length}`);
console.log(`Default password   : ${DEFAULT_PW}`);
console.log(`Email format       : firstname.lastname@${EMAIL_DOMAIN}`);
console.log('\nDone! ✅');
