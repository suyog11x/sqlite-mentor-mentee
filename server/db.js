'use strict';
const Database = require('better-sqlite3');
const bcrypt   = require('bcryptjs');
const path     = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../mentor_mentee.db');

// Open (or create) the SQLite database file
const db = new Database(DB_PATH);

// Enable WAL mode for better concurrency
db.pragma('journal_mode = DELETE');
db.pragma('foreign_keys = ON');

// ─── Schema ───────────────────────────────────────────────────────────────────
db.exec(`
CREATE TABLE IF NOT EXISTS users (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    name         TEXT NOT NULL,
    email        TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role         TEXT NOT NULL CHECK(role IN ('admin','mentor','mentee')),
    department   TEXT DEFAULT '',
    phone        TEXT DEFAULT '',
    father_mobile TEXT DEFAULT '',
    mother_mobile TEXT DEFAULT '',
    rollno       TEXT DEFAULT '',
    year         TEXT DEFAULT '',
    batch        TEXT DEFAULT '',
    created_at   TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS mentor_mentee (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    mentor_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    mentee_id   INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    assigned_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS meetings (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    mentor_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    mentee_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    scheduled_at TEXT NOT NULL,
    venue        TEXT DEFAULT '',
    agenda       TEXT DEFAULT '',
    remarks      TEXT DEFAULT '',
    status       TEXT DEFAULT 'scheduled' CHECK(status IN ('scheduled','completed','cancelled')),
    created_at   TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS messages (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    sender_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    receiver_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content     TEXT NOT NULL,
    timestamp   TEXT DEFAULT (datetime('now')),
    is_read     INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS documents (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    mentee_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type          TEXT NOT NULL,
    original_name TEXT NOT NULL,
    filename      TEXT NOT NULL,
    filepath      TEXT NOT NULL,
    upload_date   TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS announcements (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    mentor_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title      TEXT NOT NULL,
    content    TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS performance_remarks (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    mentor_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    mentee_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    remarks    TEXT NOT NULL,
    semester   TEXT DEFAULT '',
    cgpa       TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS activity_logs (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id   INTEGER REFERENCES users(id) ON DELETE SET NULL,
    action    TEXT NOT NULL,
    details   TEXT DEFAULT '',
    timestamp TEXT DEFAULT (datetime('now'))
);
`);

// ─── Seed demo data ───────────────────────────────────────────────────────────
function seedDemoData() {
    const adminRow = db.prepare(`SELECT id FROM users WHERE role='admin' LIMIT 1`).get();

    if (adminRow) {
        // Fix passwords if hashes are stale
        const demos = [
            { email: 'admin@college.edu',  password: 'admin123'  },
            { email: 'mentor@college.edu', password: 'mentor123' },
            { email: 'mentee@college.edu', password: 'mentee123' },
        ];
        const getUser = db.prepare(`SELECT id, password_hash FROM users WHERE email = ?`);
        const setHash = db.prepare(`UPDATE users SET password_hash = ? WHERE id = ?`);
        for (const { email, password } of demos) {
            const u = getUser.get(email);
            if (u && !bcrypt.compareSync(password, u.password_hash)) {
                setHash.run(bcrypt.hashSync(password, 10), u.id);
                console.log(`🔑  Fixed password for ${email}`);
            }
        }
        return;
    }

    // Seed fresh demo data inside a transaction for atomicity
    const seed = db.transaction(() => {
        const insert = db.prepare(`
            INSERT INTO users (name, email, password_hash, role, department, rollno, year)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `);

        const adminId  = insert.run('System Administrator', 'admin@college.edu',  bcrypt.hashSync('admin123',  10), 'admin',  'Administration', '', '').lastInsertRowid;
        const mentorId = insert.run('Dr. Ramesh Kumar',     'mentor@college.edu', bcrypt.hashSync('mentor123', 10), 'mentor', 'Computer Science', '', '').lastInsertRowid;
        const menteeId = insert.run('Arjun Sharma',         'mentee@college.edu', bcrypt.hashSync('mentee123', 10), 'mentee', 'Computer Science', 'CS2024001', '2nd Year').lastInsertRowid;

        db.prepare(`INSERT INTO mentor_mentee (mentor_id, mentee_id) VALUES (?, ?)`).run(mentorId, menteeId);

        const meetingDate = new Date();
        meetingDate.setDate(meetingDate.getDate() + 2);
        db.prepare(`
            INSERT INTO meetings (mentor_id, mentee_id, scheduled_at, venue, agenda, status)
            VALUES (?, ?, ?, ?, ?, 'scheduled')
        `).run(mentorId, menteeId, meetingDate.toISOString(), 'Room 201, CSE Block', 'Academic progress review for Semester 4');

        db.prepare(`
            INSERT INTO messages (sender_id, receiver_id, content)
            VALUES (?, ?, ?)
        `).run(mentorId, menteeId, 'Welcome to the mentorship program! Please upload your course registration documents at the earliest.');

        db.prepare(`
            INSERT INTO performance_remarks (mentor_id, mentee_id, remarks, semester, cgpa)
            VALUES (?, ?, ?, ?, ?)
        `).run(mentorId, menteeId, 'Good academic performance. Needs to improve lab record submission punctuality.', 'Semester 3', '8.2');
    });

    seed();

    console.log('✅  Database seeded with demo accounts');
    console.log('   Admin:  admin@college.edu / admin123');
    console.log('   Mentor: mentor@college.edu / mentor123');
    console.log('   Mentee: mentee@college.edu / mentee123');
}

function connectDB() {
    console.log(`✅  Connected to SQLite database at ${DB_PATH}`);
    seedDemoData();
}

module.exports = { db, connectDB };
