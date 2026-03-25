const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcryptjs');

const db = new Database(path.join(__dirname, '../mentor_mentee.db'));

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Create all tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('admin','mentor','mentee')),
    department TEXT DEFAULT '',
    phone TEXT DEFAULT '',
    rollno TEXT DEFAULT '',
    year TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS mentor_mentee (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mentor_id INTEGER NOT NULL,
    mentee_id INTEGER NOT NULL UNIQUE,
    assigned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(mentor_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY(mentee_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mentee_id INTEGER NOT NULL,
    type TEXT NOT NULL,
    original_name TEXT NOT NULL,
    filename TEXT NOT NULL,
    filepath TEXT NOT NULL,
    upload_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(mentee_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS meetings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mentor_id INTEGER NOT NULL,
    mentee_id INTEGER NOT NULL,
    scheduled_at DATETIME NOT NULL,
    venue TEXT DEFAULT '',
    agenda TEXT DEFAULT '',
    remarks TEXT DEFAULT '',
    status TEXT DEFAULT 'scheduled' CHECK(status IN ('scheduled','completed','cancelled')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(mentor_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY(mentee_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sender_id INTEGER NOT NULL,
    receiver_id INTEGER NOT NULL,
    content TEXT NOT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    is_read INTEGER DEFAULT 0,
    FOREIGN KEY(sender_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY(receiver_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS announcements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mentor_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(mentor_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS performance_remarks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mentor_id INTEGER NOT NULL,
    mentee_id INTEGER NOT NULL,
    remarks TEXT NOT NULL,
    semester TEXT DEFAULT '',
    cgpa TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(mentor_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY(mentee_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS activity_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    action TEXT NOT NULL,
    details TEXT DEFAULT '',
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Seed default admin if not exists
const adminExists = db.prepare("SELECT id FROM users WHERE role='admin' LIMIT 1").get();
if (!adminExists) {
  const hash = bcrypt.hashSync('admin123', 10);
  db.prepare(`INSERT INTO users (name, email, password_hash, role, department)
              VALUES (?, ?, ?, 'admin', 'Administration')`)
    .run('System Administrator', 'admin@college.edu', hash);

  // Seed a demo mentor
  const mentorHash = bcrypt.hashSync('mentor123', 10);
  const mentorResult = db.prepare(`INSERT INTO users (name, email, password_hash, role, department)
              VALUES (?, ?, ?, 'mentor', 'Computer Science')`)
    .run('Dr. Ramesh Kumar', 'mentor@college.edu', mentorHash);

  // Seed a demo mentee
  const menteeHash = bcrypt.hashSync('mentee123', 10);
  const menteeResult = db.prepare(`INSERT INTO users (name, email, password_hash, role, department, rollno, year)
              VALUES (?, ?, ?, 'mentee', 'Computer Science', 'CS2024001', '2nd Year')`)
    .run('Arjun Sharma', 'mentee@college.edu', menteeHash);

  // Assign mentee to mentor
  db.prepare(`INSERT INTO mentor_mentee (mentor_id, mentee_id) VALUES (?, ?)`)
    .run(mentorResult.lastInsertRowid, menteeResult.lastInsertRowid);

  // Demo meeting
  db.prepare(`INSERT INTO meetings (mentor_id, mentee_id, scheduled_at, venue, agenda, status)
              VALUES (?, ?, datetime('now', '+2 days'), 'Room 201, CSE Block', 'Academic progress review for Semester 4', 'scheduled')`)
    .run(mentorResult.lastInsertRowid, menteeResult.lastInsertRowid);

  // Demo message
  db.prepare(`INSERT INTO messages (sender_id, receiver_id, content) VALUES (?, ?, ?)`)
    .run(mentorResult.lastInsertRowid, menteeResult.lastInsertRowid,
         'Welcome to the mentorship program! Please upload your course registration documents at the earliest.');

  // Demo remark
  db.prepare(`INSERT INTO performance_remarks (mentor_id, mentee_id, remarks, semester, cgpa) VALUES (?, ?, ?, ?, ?)`)
    .run(mentorResult.lastInsertRowid, menteeResult.lastInsertRowid,
         'Good academic performance. Needs to improve lab record submission punctuality.', 'Semester 3', '8.2');

  console.log('✅ Database seeded with demo accounts');
  console.log('   Admin:  admin@college.edu / admin123');
  console.log('   Mentor: mentor@college.edu / mentor123');
  console.log('   Mentee: mentee@college.edu / mentee123');
}

module.exports = db;
