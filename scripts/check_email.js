const db = require('better-sqlite3')('./mentor_mentee.db');
const sample = db.prepare(`SELECT id, email, rollno FROM users WHERE role='mentee' LIMIT 10`).all();
console.log('Sample mentee emails:');
sample.forEach(u => console.log(`  rollno=${u.rollno}  email=${u.email}`));

const specific = db.prepare(`SELECT id, email, rollno FROM users WHERE rollno LIKE ? OR email LIKE ?`).all('24U0434', '%24u0434%');
console.log('\nSearch for 24U0434:', specific);
