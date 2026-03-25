const express = require('express');
const router = express.Router();
const path = require('path');
const multer = require('multer');
const db = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');

// Multer config
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, path.join(__dirname, '../../uploads')),
    filename: (req, file, cb) => {
        const unique = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
        cb(null, `${unique}-${file.originalname}`);
    }
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

router.use(authenticate, requireRole('mentee'));

// GET /api/mentee/dashboard
router.get('/dashboard', (req, res) => {
    const menteeId = req.user.id;
    const mentor = db.prepare(`
    SELECT u.id, u.name, u.email, u.department, u.phone FROM mentor_mentee mm
    JOIN users u ON mm.mentor_id=u.id WHERE mm.mentee_id=?
  `).get(menteeId);
    const docs = db.prepare("SELECT COUNT(*) as c FROM documents WHERE mentee_id=?").get(menteeId).c;
    const upcoming = db.prepare(`SELECT COUNT(*) as c FROM meetings WHERE mentee_id=? AND status='scheduled' AND scheduled_at >= datetime('now')`).get(menteeId).c;
    const unread = db.prepare("SELECT COUNT(*) as c FROM messages WHERE receiver_id=? AND is_read=0").get(menteeId).c;
    const meetings = db.prepare(`SELECT * FROM meetings WHERE mentee_id=? ORDER BY scheduled_at DESC LIMIT 5`).all(menteeId);
    const remarks = db.prepare("SELECT * FROM performance_remarks WHERE mentee_id=? ORDER BY created_at DESC LIMIT 3").all(menteeId);
    const announcements = mentor ? db.prepare("SELECT * FROM announcements WHERE mentor_id=? ORDER BY created_at DESC LIMIT 5").all(mentor.id) : [];
    res.json({ mentor, uploadedDocs: docs, upcomingMeetings: upcoming, unreadMessages: unread, meetings, remarks, announcements });
});

// GET /api/mentee/documents
router.get('/documents', (req, res) => {
    const docs = db.prepare("SELECT * FROM documents WHERE mentee_id=? ORDER BY upload_date DESC").all(req.user.id);
    res.json(docs);
});

// POST /api/mentee/documents
router.post('/documents', upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const { type } = req.body;
    if (!type) return res.status(400).json({ error: 'Document type required' });
    const result = db.prepare("INSERT INTO documents (mentee_id,type,original_name,filename,filepath) VALUES (?,?,?,?,?)")
        .run(req.user.id, type, req.file.originalname, req.file.filename, req.file.path);
    db.prepare("INSERT INTO activity_log (user_id, action, details) VALUES (?, 'upload', ?)").run(req.user.id, `Uploaded: ${type}`);
    res.json({ id: result.lastInsertRowid, message: 'Document uploaded successfully' });
});

// DELETE /api/mentee/documents/:id
router.delete('/documents/:id', (req, res) => {
    const doc = db.prepare("SELECT * FROM documents WHERE id=? AND mentee_id=?").get(req.params.id, req.user.id);
    if (!doc) return res.status(404).json({ error: 'Document not found' });
    const fs = require('fs');
    try { fs.unlinkSync(doc.filepath); } catch (e) { }
    db.prepare("DELETE FROM documents WHERE id=?").run(req.params.id);
    res.json({ message: 'Document deleted' });
});

// GET /api/mentee/messages
router.get('/messages', (req, res) => {
    const mentor = db.prepare(`SELECT u.id FROM mentor_mentee mm JOIN users u ON mm.mentor_id=u.id WHERE mm.mentee_id=?`).get(req.user.id);
    if (!mentor) return res.json([]);
    const msgs = db.prepare(`
    SELECT m.*, u.name AS sender_name FROM messages m
    JOIN users u ON m.sender_id=u.id
    WHERE (m.sender_id=? AND m.receiver_id=?) OR (m.sender_id=? AND m.receiver_id=?)
    ORDER BY m.timestamp ASC
  `).all(req.user.id, mentor.id, mentor.id, req.user.id);
    db.prepare("UPDATE messages SET is_read=1 WHERE receiver_id=? AND sender_id=?").run(req.user.id, mentor.id);
    res.json(msgs);
});

// POST /api/mentee/messages
router.post('/messages', (req, res) => {
    const { content } = req.body;
    const mentor = db.prepare(`SELECT u.id FROM mentor_mentee mm JOIN users u ON mm.mentor_id=u.id WHERE mm.mentee_id=?`).get(req.user.id);
    if (!mentor) return res.status(400).json({ error: 'No mentor assigned yet' });
    if (!content) return res.status(400).json({ error: 'Content required' });
    const result = db.prepare("INSERT INTO messages (sender_id,receiver_id,content) VALUES (?,?,?)").run(req.user.id, mentor.id, content);
    res.json({ id: result.lastInsertRowid, message: 'Message sent' });
});

// GET /api/mentee/feedback
router.get('/feedback', (req, res) => {
    const remarks = db.prepare(`
    SELECT pr.*, u.name AS mentor_name FROM performance_remarks pr
    JOIN users u ON pr.mentor_id=u.id
    WHERE pr.mentee_id=? ORDER BY pr.created_at DESC
  `).all(req.user.id);
    res.json(remarks);
});

module.exports = router;
