const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');

router.use(authenticate, requireRole('mentor'));

// GET /api/mentor/dashboard
router.get('/dashboard', (req, res) => {
    const mentorId = req.user.id;
    const mentees = db.prepare(`SELECT u.* FROM mentor_mentee mm JOIN users u ON mm.mentee_id=u.id WHERE mm.mentor_id=?`).all(mentorId);
    const meetings = db.prepare(`SELECT COUNT(*) as c FROM meetings WHERE mentor_id=?`).get(mentorId).c;
    const upcoming = db.prepare(`SELECT COUNT(*) as c FROM meetings WHERE mentor_id=? AND status='scheduled' AND scheduled_at >= datetime('now')`).get(mentorId).c;
    const unread = db.prepare(`SELECT COUNT(*) as c FROM messages WHERE receiver_id=? AND is_read=0`).get(mentorId).c;
    res.json({ menteeCount: mentees.length, totalMeetings: meetings, upcomingMeetings: upcoming, unreadMessages: unread });
});

// GET /api/mentor/mentees
router.get('/mentees', (req, res) => {
    const mentees = db.prepare(`
    SELECT u.id, u.name, u.email, u.department, u.rollno, u.year, u.phone, u.created_at
    FROM mentor_mentee mm JOIN users u ON mm.mentee_id=u.id
    WHERE mm.mentor_id=? ORDER BY u.name
  `).all(req.user.id);
    res.json(mentees);
});

// GET /api/mentor/mentee/:id/profile
router.get('/mentee/:id/profile', (req, res) => {
    const menteeId = req.params.id;
    const mentee = db.prepare("SELECT id,name,email,department,rollno,year,phone FROM users WHERE id=? AND role='mentee'").get(menteeId);
    if (!mentee) return res.status(404).json({ error: 'Mentee not found' });
    const docs = db.prepare("SELECT * FROM documents WHERE mentee_id=? ORDER BY upload_date DESC").all(menteeId);
    const meetings = db.prepare("SELECT * FROM meetings WHERE mentor_id=? AND mentee_id=? ORDER BY scheduled_at DESC").all(req.user.id, menteeId);
    const remarks = db.prepare("SELECT * FROM performance_remarks WHERE mentor_id=? AND mentee_id=? ORDER BY created_at DESC").all(req.user.id, menteeId);
    res.json({ mentee, docs, meetings, remarks });
});

// GET /api/mentor/meetings
router.get('/meetings', (req, res) => {
    const meetings = db.prepare(`
    SELECT m.*, u.name AS mentee_name, u.rollno FROM meetings m
    JOIN users u ON m.mentee_id=u.id
    WHERE m.mentor_id=? ORDER BY m.scheduled_at DESC
  `).all(req.user.id);
    res.json(meetings);
});

// POST /api/mentor/meetings — schedule
router.post('/meetings', (req, res) => {
    const { mentee_id, scheduled_at, venue, agenda } = req.body;
    if (!mentee_id || !scheduled_at) return res.status(400).json({ error: 'Mentee and scheduled_at required' });
    const result = db.prepare(`INSERT INTO meetings (mentor_id,mentee_id,scheduled_at,venue,agenda) VALUES (?,?,?,?,?)`)
        .run(req.user.id, mentee_id, scheduled_at, venue || '', agenda || '');
    res.json({ id: result.lastInsertRowid, message: 'Meeting scheduled' });
});

// PUT /api/mentor/meetings/:id — update remarks/status
router.put('/meetings/:id', (req, res) => {
    const { remarks, status, venue, agenda, scheduled_at } = req.body;
    const meeting = db.prepare('SELECT * FROM meetings WHERE id=? AND mentor_id=?').get(req.params.id, req.user.id);
    if (!meeting) return res.status(404).json({ error: 'Meeting not found' });
    db.prepare(`UPDATE meetings SET remarks=?,status=?,venue=?,agenda=?,scheduled_at=? WHERE id=?`)
        .run(remarks ?? meeting.remarks, status ?? meeting.status, venue ?? meeting.venue, agenda ?? meeting.agenda, scheduled_at ?? meeting.scheduled_at, req.params.id);
    res.json({ message: 'Meeting updated' });
});

// DELETE /api/mentor/meetings/:id
router.delete('/meetings/:id', (req, res) => {
    db.prepare('DELETE FROM meetings WHERE id=? AND mentor_id=?').run(req.params.id, req.user.id);
    res.json({ message: 'Meeting deleted' });
});

// GET /api/mentor/messages/:menteeId
router.get('/messages/:menteeId', (req, res) => {
    const menteeId = req.params.menteeId;
    const msgs = db.prepare(`
    SELECT m.*, u.name AS sender_name FROM messages m
    JOIN users u ON m.sender_id=u.id
    WHERE (m.sender_id=? AND m.receiver_id=?) OR (m.sender_id=? AND m.receiver_id=?)
    ORDER BY m.timestamp ASC
  `).all(req.user.id, menteeId, menteeId, req.user.id);
    // mark as read
    db.prepare("UPDATE messages SET is_read=1 WHERE receiver_id=? AND sender_id=?").run(req.user.id, menteeId);
    res.json(msgs);
});

// POST /api/mentor/messages — send message
router.post('/messages', (req, res) => {
    const { receiver_id, content } = req.body;
    if (!content || !receiver_id) return res.status(400).json({ error: 'receiver_id and content required' });
    const result = db.prepare("INSERT INTO messages (sender_id,receiver_id,content) VALUES (?,?,?)").run(req.user.id, receiver_id, content);
    res.json({ id: result.lastInsertRowid, message: 'Message sent' });
});

// POST /api/mentor/announcements
router.post('/announcements', (req, res) => {
    const { title, content } = req.body;
    const result = db.prepare("INSERT INTO announcements (mentor_id,title,content) VALUES (?,?,?)").run(req.user.id, title, content);
    res.json({ id: result.lastInsertRowid, message: 'Announcement posted' });
});

// GET /api/mentor/announcements
router.get('/announcements', (req, res) => {
    const ann = db.prepare("SELECT * FROM announcements WHERE mentor_id=? ORDER BY created_at DESC").all(req.user.id);
    res.json(ann);
});

// POST /api/mentor/remarks
router.post('/remarks', (req, res) => {
    const { mentee_id, remarks, semester, cgpa } = req.body;
    if (!mentee_id || !remarks) return res.status(400).json({ error: 'mentee_id and remarks required' });
    const result = db.prepare("INSERT INTO performance_remarks (mentor_id,mentee_id,remarks,semester,cgpa) VALUES (?,?,?,?,?)")
        .run(req.user.id, mentee_id, remarks, semester || '', cgpa || '');
    res.json({ id: result.lastInsertRowid, message: 'Remarks added' });
});

module.exports = router;
