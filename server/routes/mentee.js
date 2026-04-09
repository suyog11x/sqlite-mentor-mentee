'use strict';
const express          = require('express');
const router           = express.Router();
const path             = require('path');
const multer           = require('multer');
const { db }           = require('../db');
const User             = require('../models/User');
const MentorMentee     = require('../models/MentorMentee');
const Document         = require('../models/Document');
const Meeting          = require('../models/Meeting');
const Message          = require('../models/Message');
const Announcement     = require('../models/Announcement');
const PerformanceRemark = require('../models/PerformanceRemark');
const ActivityLog      = require('../models/ActivityLog');
const { authenticate, requireRole } = require('../middleware/auth');

// Multer config
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, path.join(__dirname, '../../uploads')),
    filename:    (req, file, cb) => {
        const unique = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
        cb(null, `${unique}-${file.originalname}`);
    },
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

router.use(authenticate, requireRole('mentee'));

// GET /api/mentee/dashboard
router.get('/dashboard', async (req, res) => {
    try {
        const menteeId = req.user.id;

        const mapping = db.prepare(`
            SELECT mm.*, u.id AS mentor_id_val, u.name AS mentor_name, u.email AS mentor_email,
                   u.department AS mentor_dept, u.phone AS mentor_phone
            FROM mentor_mentee mm
            JOIN users u ON mm.mentor_id = u.id
            WHERE mm.mentee_id = ? LIMIT 1
        `).get(menteeId);

        const mentor = mapping ? {
            id:         mapping.mentor_id_val,
            name:       mapping.mentor_name,
            email:      mapping.mentor_email,
            department: mapping.mentor_dept,
            phone:      mapping.mentor_phone,
        } : null;

        const now = new Date().toISOString();
        const uploadedDocs     = Document.countDocuments({ menteeId });
        const upcomingMeetings = db.prepare(`SELECT COUNT(*) as c FROM meetings WHERE mentee_id=? AND status='scheduled' AND scheduled_at >= ?`).get(menteeId, now).c;
        const unreadMessages   = Message.countDocuments({ receiverId: menteeId, isRead: false });

        const meetings = db.prepare(`SELECT * FROM meetings WHERE mentee_id=? ORDER BY scheduled_at DESC LIMIT 5`).all(menteeId);
        const remarks  = PerformanceRemark.find({ menteeId }).slice(0, 3);
        const announcements = mentor
            ? db.prepare(`SELECT * FROM announcements WHERE mentor_id=? ORDER BY created_at DESC LIMIT 5`).all(mentor.id)
            : [];

        res.json({
            mentor,
            uploadedDocs,
            upcomingMeetings,
            unreadMessages,
            meetings,
            remarks,
            announcements,
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// GET /api/mentee/documents
router.get('/documents', async (req, res) => {
    try {
        const docs = Document.find({ menteeId: req.user.id });
        res.json(docs);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// POST /api/mentee/documents
router.post('/documents', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
        const { type } = req.body;
        if (!type) return res.status(400).json({ error: 'Document type required' });
        const doc = Document.create({
            menteeId:     req.user.id,
            type,
            originalName: req.file.originalname,
            filename:     req.file.filename,
            filepath:     req.file.path,
        });
        ActivityLog.create({ userId: req.user.id, action: 'upload', details: `Uploaded: ${type}` });
        res.json({ id: doc.id, message: 'Document uploaded successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// DELETE /api/mentee/documents/:id
router.delete('/documents/:id', async (req, res) => {
    try {
        const doc = Document.findOne({ _id: req.params.id, menteeId: req.user.id });
        if (!doc) return res.status(404).json({ error: 'Document not found' });
        const fs = require('fs');
        try { fs.unlinkSync(doc.filepath); } catch (e) {}
        Document.findByIdAndDelete(req.params.id);
        res.json({ message: 'Document deleted' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// GET /api/mentee/messages
router.get('/messages', async (req, res) => {
    try {
        const menteeId = req.user.id;
        const mapping  = db.prepare(`SELECT mentor_id FROM mentor_mentee WHERE mentee_id=? LIMIT 1`).get(menteeId);
        if (!mapping) return res.json([]);
        const mentorId = mapping.mentor_id;

        const msgs = db.prepare(`
            SELECT m.*, u.name AS sender_name
            FROM messages m
            JOIN users u ON m.sender_id = u.id
            WHERE (m.sender_id=? AND m.receiver_id=?) OR (m.sender_id=? AND m.receiver_id=?)
            ORDER BY m.timestamp ASC
        `).all(menteeId, mentorId, mentorId, menteeId);

        db.prepare(`UPDATE messages SET is_read=1 WHERE receiver_id=? AND sender_id=? AND is_read=0`).run(menteeId, mentorId);

        res.json(msgs.map(m => ({ ...m, is_read: m.is_read === 1 })));
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// POST /api/mentee/messages
router.post('/messages', async (req, res) => {
    try {
        const { content } = req.body;
        const mapping = db.prepare(`SELECT mentor_id FROM mentor_mentee WHERE mentee_id=? LIMIT 1`).get(req.user.id);
        if (!mapping) return res.status(400).json({ error: 'No mentor assigned yet' });
        if (!content) return res.status(400).json({ error: 'Content required' });
        const msg = Message.create({ senderId: req.user.id, receiverId: mapping.mentor_id, content });
        res.json({ id: msg.id, message: 'Message sent' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// GET /api/mentee/profile
router.get('/profile', async (req, res) => {
    try {
        const user = db.prepare(`SELECT id, name, email, department, phone, rollno, year, created_at FROM users WHERE id=? LIMIT 1`).get(req.user.id);
        if (!user) return res.status(404).json({ error: 'User not found' });
        res.json(user);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// GET /api/mentee/feedback
router.get('/feedback', async (req, res) => {
    try {
        const rows = db.prepare(`
            SELECT pr.*, u.name AS mentor_name
            FROM performance_remarks pr
            JOIN users u ON pr.mentor_id = u.id
            WHERE pr.mentee_id = ?
            ORDER BY pr.created_at DESC
        `).all(req.user.id);
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;
