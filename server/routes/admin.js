const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');

router.use(authenticate, requireRole('admin'));

// GET /api/admin/dashboard
router.get('/dashboard', (req, res) => {
    const totalUsers = db.prepare("SELECT COUNT(*) as c FROM users WHERE role != 'admin'").get().c;
    const totalMentors = db.prepare("SELECT COUNT(*) as c FROM users WHERE role='mentor'").get().c;
    const totalMentees = db.prepare("SELECT COUNT(*) as c FROM users WHERE role='mentee'").get().c;
    const totalMeetings = db.prepare("SELECT COUNT(*) as c FROM meetings").get().c;
    const totalDocs = db.prepare("SELECT COUNT(*) as c FROM documents").get().c;
    const totalMessages = db.prepare("SELECT COUNT(*) as c FROM messages").get().c;
    const recentActivity = db.prepare(`
    SELECT al.*, u.name, u.role FROM activity_log al
    LEFT JOIN users u ON al.user_id = u.id
    ORDER BY al.timestamp DESC LIMIT 20
  `).all();
    res.json({ totalUsers, totalMentors, totalMentees, totalMeetings, totalDocs, totalMessages, recentActivity });
});

// GET /api/admin/users
router.get('/users', (req, res) => {
    const users = db.prepare("SELECT id, name, email, role, department, phone, rollno, year, created_at FROM users ORDER BY role, name").all();
    res.json(users);
});

// POST /api/admin/users  — create user
router.post('/users', (req, res) => {
    const { name, email, password, role, department, phone, rollno, year } = req.body;
    if (!name || !email || !password || !role) return res.status(400).json({ error: 'Name, email, password, role required' });
    const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase());
    if (exists) return res.status(409).json({ error: 'Email already registered' });
    const hash = bcrypt.hashSync(password, 10);
    const result = db.prepare(`INSERT INTO users (name,email,password_hash,role,department,phone,rollno,year) VALUES (?,?,?,?,?,?,?,?)`)
        .run(name, email.toLowerCase(), hash, role, department || '', phone || '', rollno || '', year || '');
    db.prepare("INSERT INTO activity_log (user_id, action, details) VALUES (?, 'create_user', ?)").run(req.user.id, `Created ${role}: ${email}`);
    res.json({ id: result.lastInsertRowid, message: 'User created successfully' });
});

// PUT /api/admin/users/:id
router.put('/users/:id', (req, res) => {
    const { name, email, department, phone, rollno, year, password } = req.body;
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const newHash = password ? bcrypt.hashSync(password, 10) : user.password_hash;
    db.prepare(`UPDATE users SET name=?,email=?,password_hash=?,department=?,phone=?,rollno=?,year=? WHERE id=?`)
        .run(name || user.name, email || user.email, newHash, department || user.department, phone || user.phone, rollno || user.rollno, year || user.year, req.params.id);
    res.json({ message: 'User updated' });
});

// DELETE /api/admin/users/:id
router.delete('/users/:id', (req, res) => {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.role === 'admin') return res.status(403).json({ error: 'Cannot delete admin' });
    db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
    db.prepare("INSERT INTO activity_log (user_id, action, details) VALUES (?, 'delete_user', ?)").run(req.user.id, `Deleted ${user.role}: ${user.email}`);
    res.json({ message: 'User deleted' });
});

// GET /api/admin/mappings
router.get('/mappings', (req, res) => {
    const mappings = db.prepare(`
    SELECT mm.id, m.name AS mentor_name, m.email AS mentor_email,
           s.name AS mentee_name, s.email AS mentee_email,
           s.rollno, s.year, s.department, mm.assigned_at
    FROM mentor_mentee mm
    JOIN users m ON mm.mentor_id = m.id
    JOIN users s ON mm.mentee_id = s.id
    ORDER BY m.name
  `).all();
    res.json(mappings);
});

// POST /api/admin/mappings — assign
router.post('/mappings', (req, res) => {
    const { mentor_id, mentee_id } = req.body;
    const existing = db.prepare('SELECT id FROM mentor_mentee WHERE mentee_id = ?').get(mentee_id);
    if (existing) {
        db.prepare('UPDATE mentor_mentee SET mentor_id=?, assigned_at=CURRENT_TIMESTAMP WHERE mentee_id=?').run(mentor_id, mentee_id);
        return res.json({ message: 'Mapping updated' });
    }
    db.prepare('INSERT INTO mentor_mentee (mentor_id, mentee_id) VALUES (?,?)').run(mentor_id, mentee_id);
    db.prepare("INSERT INTO activity_log (user_id, action, details) VALUES (?, 'assign', ?)").run(req.user.id, `Assigned mentee ${mentee_id} to mentor ${mentor_id}`);
    res.json({ message: 'Mentee assigned to mentor' });
});

// DELETE /api/admin/mappings/:id
router.delete('/mappings/:id', (req, res) => {
    db.prepare('DELETE FROM mentor_mentee WHERE id = ?').run(req.params.id);
    res.json({ message: 'Mapping removed' });
});

// GET /api/admin/mentors — list mentors (for dropdown)
router.get('/mentors', (req, res) => {
    const mentors = db.prepare("SELECT id, name, email, department FROM users WHERE role='mentor' ORDER BY name").all();
    res.json(mentors);
});

// GET /api/admin/mentees-unassigned
router.get('/mentees-unassigned', (req, res) => {
    const mentees = db.prepare(`
    SELECT u.id, u.name, u.email, u.rollno, u.year, u.department
    FROM users u
    WHERE u.role='mentee' AND u.id NOT IN (SELECT mentee_id FROM mentor_mentee)
    ORDER BY u.name
  `).all();
    res.json(mentees);
});

// GET /api/admin/all-mentees
router.get('/all-mentees', (req, res) => {
    const mentees = db.prepare("SELECT id, name, email, rollno, year, department FROM users WHERE role='mentee' ORDER BY name").all();
    res.json(mentees);
});

module.exports = router;
