'use strict';
const express          = require('express');
const router           = express.Router();
const { db }           = require('../db');
const User             = require('../models/User');
const MentorMentee     = require('../models/MentorMentee');
const Meeting          = require('../models/Meeting');
const Message          = require('../models/Message');
const Announcement     = require('../models/Announcement');
const PerformanceRemark = require('../models/PerformanceRemark');
const { authenticate, requireRole } = require('../middleware/auth');

router.use(authenticate, requireRole('mentor'));

// GET /api/mentor/dashboard
router.get('/dashboard', async (req, res) => {
    try {
        const mentorId = req.user.id;
        const menteeCount      = db.prepare(`SELECT COUNT(*) as c FROM mentor_mentee WHERE mentor_id=?`).get(mentorId).c;
        const totalMeetings    = Meeting.countDocuments({ mentorId });
        const now              = new Date().toISOString();
        const upcomingMeetings = db.prepare(`SELECT COUNT(*) as c FROM meetings WHERE mentor_id=? AND status='scheduled' AND scheduled_at >= ?`).get(mentorId, now).c;
        const unreadMessages   = Message.countDocuments({ receiverId: mentorId, isRead: false });
        res.json({ menteeCount, totalMeetings, upcomingMeetings, unreadMessages });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// GET /api/mentor/mentees
router.get('/mentees', async (req, res) => {
    try {
        const rows = db.prepare(`
            SELECT u.id, u.name, u.email, u.department, u.rollno, u.year, u.phone, u.batch, u.created_at
            FROM users u
            JOIN mentor_mentee mm ON mm.mentee_id = u.id
            WHERE mm.mentor_id = ?
            ORDER BY u.batch DESC, u.name
        `).all(req.user.id);
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// GET /api/mentor/mentees/batch-wise — mentees grouped by batch
router.get('/mentees/batch-wise', async (req, res) => {
    try {
        const rows = db.prepare(`
            SELECT u.id, u.name, u.email, u.department, u.rollno, u.year, u.phone, u.batch, u.created_at
            FROM users u
            JOIN mentor_mentee mm ON mm.mentee_id = u.id
            WHERE mm.mentor_id = ?
            ORDER BY u.batch DESC, u.name
        `).all(req.user.id);

        // Group by batch
        const groups = {};
        for (const m of rows) {
            const b = m.batch || 'Unknown';
            if (!groups[b]) groups[b] = [];
            groups[b].push(m);
        }

        // Return as sorted array of { batch, mentees[] }
        const result = Object.entries(groups)
            .sort(([a], [b]) => b.localeCompare(a))
            .map(([batch, mentees]) => ({ batch, count: mentees.length, mentees }));

        res.json(result);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// GET /api/mentor/mentee/:id/profile
router.get('/mentee/:id/profile', async (req, res) => {
    try {
        const menteeId = req.params.id;
        const mentorId = req.user.id;

        const mentee = db.prepare(`SELECT id, name, email, department, rollno, year, phone FROM users WHERE id=? AND role='mentee' LIMIT 1`).get(menteeId);
        if (!mentee) return res.status(404).json({ error: 'Mentee not found' });

        const Document = require('../models/Document');
        const docs     = Document.find({ menteeId });
        const meetings = Meeting.find({ mentorId, menteeId });
        const remarks  = PerformanceRemark.find({ mentorId, menteeId });

        res.json({
            mentee,
            docs:     docs.map(d => ({ ...d, original_name: d.original_name, upload_date: d.upload_date })),
            meetings: meetings.map(m => ({ ...m, scheduled_at: m.scheduled_at })),
            remarks,
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// GET /api/mentor/meetings
router.get('/meetings', async (req, res) => {
    try {
        const rows = db.prepare(`
            SELECT m.*, u.name AS mentee_name, u.rollno
            FROM meetings m
            JOIN users u ON m.mentee_id = u.id
            WHERE m.mentor_id = ?
            ORDER BY m.scheduled_at DESC
        `).all(req.user.id);
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// POST /api/mentor/meetings
router.post('/meetings', async (req, res) => {
    try {
        const { mentee_id, scheduled_at, venue, agenda } = req.body;
        if (!mentee_id || !scheduled_at) return res.status(400).json({ error: 'Mentee and scheduled_at required' });
        const meeting = Meeting.create({
            mentorId:    req.user.id,
            menteeId:    mentee_id,
            scheduledAt: new Date(scheduled_at),
            venue:       venue || '',
            agenda:      agenda || '',
        });
        res.json({ id: meeting.id, message: 'Meeting scheduled' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// PUT /api/mentor/meetings/:id
router.put('/meetings/:id', async (req, res) => {
    try {
        const { remarks, status, venue, agenda, scheduled_at } = req.body;
        const meeting = Meeting.findOne({ _id: req.params.id, mentorId: req.user.id });
        if (!meeting) return res.status(404).json({ error: 'Meeting not found' });
        if (remarks      !== undefined) meeting.remarks      = remarks;
        if (status       !== undefined) meeting.status       = status;
        if (venue        !== undefined) meeting.venue        = venue;
        if (agenda       !== undefined) meeting.agenda       = agenda;
        if (scheduled_at !== undefined) meeting.scheduled_at = new Date(scheduled_at).toISOString();
        Meeting.save(meeting);
        res.json({ message: 'Meeting updated' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// DELETE /api/mentor/meetings/:id
router.delete('/meetings/:id', async (req, res) => {
    try {
        Meeting.findOneAndDelete({ _id: req.params.id, mentorId: req.user.id });
        res.json({ message: 'Meeting deleted' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// GET /api/mentor/messages/summary
router.get('/messages/summary', async (req, res) => {
    try {
        const mentorId = req.user.id;
        const mappings = db.prepare(`SELECT mentee_id FROM mentor_mentee WHERE mentor_id=?`).all(mentorId);

        const result = mappings.map(({ mentee_id: menteeId }) => {
            const last = db.prepare(`
                SELECT * FROM messages
                WHERE (sender_id=? AND receiver_id=?) OR (sender_id=? AND receiver_id=?)
                ORDER BY timestamp DESC LIMIT 1
            `).get(menteeId, mentorId, mentorId, menteeId);

            const unread = db.prepare(`SELECT COUNT(*) as c FROM messages WHERE receiver_id=? AND sender_id=? AND is_read=0`).get(mentorId, menteeId).c;

            return {
                menteeId,
                lastMessage: last ? {
                    content:   last.content,
                    timestamp: last.timestamp,
                    sender_id: last.sender_id,
                    is_read:   last.is_read === 1,
                } : null,
                unread,
            };
        });
        res.json(result);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// GET /api/mentor/messages/:menteeId
router.get('/messages/:menteeId', async (req, res) => {
    try {
        const menteeId = req.params.menteeId;
        const mentorId = req.user.id;
        const msgs = db.prepare(`
            SELECT m.*, u.name AS sender_name
            FROM messages m
            JOIN users u ON m.sender_id = u.id
            WHERE (m.sender_id=? AND m.receiver_id=?) OR (m.sender_id=? AND m.receiver_id=?)
            ORDER BY m.timestamp ASC
        `).all(mentorId, menteeId, menteeId, mentorId);

        // Mark as read
        db.prepare(`UPDATE messages SET is_read=1 WHERE receiver_id=? AND sender_id=? AND is_read=0`).run(mentorId, menteeId);

        res.json(msgs.map(m => ({ ...m, is_read: m.is_read === 1 })));
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// POST /api/mentor/messages
router.post('/messages', async (req, res) => {
    try {
        const { receiver_id, content } = req.body;
        if (!content || !receiver_id) return res.status(400).json({ error: 'receiver_id and content required' });
        const msg = Message.create({ senderId: req.user.id, receiverId: receiver_id, content });
        res.json({ id: msg.id, message: 'Message sent' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// POST /api/mentor/announcements
router.post('/announcements', async (req, res) => {
    try {
        const { title, content } = req.body;
        const ann = Announcement.create({ mentorId: req.user.id, title, content });
        res.json({ id: ann.id, message: 'Announcement posted' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// GET /api/mentor/announcements
router.get('/announcements', async (req, res) => {
    try {
        const ann = Announcement.find({ mentorId: req.user.id });
        res.json(ann);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// POST /api/mentor/remarks
router.post('/remarks', async (req, res) => {
    try {
        const { mentee_id, remarks, semester, cgpa } = req.body;
        if (!mentee_id || !remarks) return res.status(400).json({ error: 'mentee_id and remarks required' });
        const remark = PerformanceRemark.create({
            mentorId: req.user.id,
            menteeId: mentee_id,
            remarks,
            semester: semester || '',
            cgpa:     cgpa     || '',
        });
        res.json({ id: remark.id, message: 'Remarks added' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;
