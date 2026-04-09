const db = require('better-sqlite3')('./mentor_mentee.db');

// Check a sample of mentees with their batch values
const rows = db.prepare(`SELECT id, name, rollno, batch, typeof(batch) as batch_type FROM users WHERE role='mentee' LIMIT 10`).all();
console.log('Mentee batch data:');
rows.forEach(r => console.log(`  id=${r.id} name=${r.name} rollno=${r.rollno} batch=${JSON.stringify(r.batch)} type=${r.batch_type}`));

// Check mentor-mentee mapping for mentor id range
const mappings = db.prepare(`SELECT mm.mentor_id, mm.mentee_id, u.name, u.batch FROM mentor_mentee mm JOIN users u ON u.id = mm.mentee_id LIMIT 5`).all();
console.log('\nMentor-Mentee mappings (first 5):');
mappings.forEach(m => console.log(`  mentor_id=${m.mentor_id} mentee=${m.name} batch=${JSON.stringify(m.batch)} type=${typeof m.batch}`));
