const express = require('express');
const router = express.Router();
const User = require('../models/User');
const MentorMentee = require('../models/MentorMentee');
const Meeting = require('../models/Meeting');
const Message = require('../models/Message');
const Announcement = require('../models/Announcement');
const PerformanceRemark = require('../models/PerformanceRemark');
const { authenticate, requireRole } = require('../middleware/auth');

router.use(authenticate, requireRole('mentor'));

// GET /api/mentor/dashboard
router.get('/dashboard', async (req, res) => {
    try {
        const mentorId = req.user.id;
        const [mentees, totalMeetings, upcomingMeetings, unreadMessages] = await Promise.all([
            MentorMentee.find({ mentorId }).select('menteeId').lean(),
            Meeting.countDocuments({ mentorId }),
            Meeting.countDocuments({ mentorId, status: 'scheduled', scheduledAt: { $gte: new Date() } }),
            Message.countDocuments({ receiverId: mentorId, isRead: false }),
        ]);
        res.json({ menteeCount: mentees.length, totalMeetings, upcomingMeetings, unreadMessages });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// GET /api/mentor/mentees
router.get('/mentees', async (req, res) => {
    try {
        const mappings = await MentorMentee.find({ mentorId: req.user.id })
            .populate('menteeId', 'name email department rollno year phone created_at')
            .sort({ 'menteeId.name': 1 })
            .lean();
        res.json(mappings.map(m => ({ ...m.menteeId, id: m.menteeId?._id })));
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// GET /api/mentor/mentee/:id/profile
router.get('/mentee/:id/profile', async (req, res) => {
    try {
        const menteeId = req.params.id;
        const [mentee, docs, meetings, remarks] = await Promise.all([
            User.findOne({ _id: menteeId, role: 'mentee' }).select('name email department rollno year phone').lean(),
            require('../models/Document').find({ menteeId }).sort({ uploadDate: -1 }).lean(),
            Meeting.find({ mentorId: req.user.id, menteeId }).sort({ scheduledAt: -1 }).lean(),
            PerformanceRemark.find({ mentorId: req.user.id, menteeId }).sort({ created_at: -1 }).lean(),
        ]);
        if (!mentee) return res.status(404).json({ error: 'Mentee not found' });
        res.json({
            mentee: { ...mentee, id: mentee._id },
            docs:     docs.map(d => ({ ...d, id: d._id })),
            meetings: meetings.map(m => ({ ...m, id: m._id, scheduled_at: m.scheduledAt })),
            remarks:  remarks.map(r => ({ ...r, id: r._id })),
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// GET /api/mentor/meetings
router.get('/meetings', async (req, res) => {
    try {
        const meetings = await Meeting.find({ mentorId: req.user.id })
            .populate('menteeId', 'name rollno')
            .sort({ scheduledAt: -1 })
            .lean();
        res.json(meetings.map(m => ({
            ...m,
            id: m._id,
            scheduled_at: m.scheduledAt,
            mentee_name: m.menteeId?.name,
            rollno: m.menteeId?.rollno,
        })));
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
        const meeting = await Meeting.create({
            mentorId: req.user.id,
            menteeId: mentee_id,
            scheduledAt: new Date(scheduled_at),
            venue: venue || '',
            agenda: agenda || '',
        });
        res.json({ id: meeting._id, message: 'Meeting scheduled' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// PUT /api/mentor/meetings/:id
router.put('/meetings/:id', async (req, res) => {
    try {
        const { remarks, status, venue, agenda, scheduled_at } = req.body;
        const meeting = await Meeting.findOne({ _id: req.params.id, mentorId: req.user.id });
        if (!meeting) return res.status(404).json({ error: 'Meeting not found' });
        if (remarks      !== undefined) meeting.remarks     = remarks;
        if (status       !== undefined) meeting.status      = status;
        if (venue        !== undefined) meeting.venue       = venue;
        if (agenda       !== undefined) meeting.agenda      = agenda;
        if (scheduled_at !== undefined) meeting.scheduledAt = new Date(scheduled_at);
        await meeting.save();
        res.json({ message: 'Meeting updated' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// DELETE /api/mentor/meetings/:id
router.delete('/meetings/:id', async (req, res) => {
    try {
        await Meeting.findOneAndDelete({ _id: req.params.id, mentorId: req.user.id });
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
        const mappings = await MentorMentee.find({ mentorId }).select('menteeId').lean();

        const result = await Promise.all(mappings.map(async ({ menteeId }) => {
            const [last, unreadCount] = await Promise.all([
                Message.findOne({
                    $or: [
                        { senderId: menteeId, receiverId: mentorId },
                        { senderId: mentorId, receiverId: menteeId },
                    ],
                }).sort({ timestamp: -1 }).lean(),
                Message.countDocuments({ receiverId: mentorId, senderId: menteeId, isRead: false }),
            ]);
            return {
                menteeId,
                lastMessage: last ? {
                    content: last.content,
                    timestamp: last.timestamp,
                    sender_id: last.senderId,
                    is_read: last.isRead,
                } : null,
                unread: unreadCount,
            };
        }));
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
        const msgs = await Message.find({
            $or: [
                { senderId: mentorId, receiverId: menteeId },
                { senderId: menteeId, receiverId: mentorId },
            ],
        }).populate('senderId', 'name').sort({ timestamp: 1 }).lean();
        // Mark as read
        await Message.updateMany({ receiverId: mentorId, senderId: menteeId, isRead: false }, { isRead: true });
        res.json(msgs.map(m => ({
            ...m,
            id: m._id,
            sender_name: m.senderId?.name,
            sender_id: m.senderId?._id,
            receiver_id: m.receiverId,
            is_read: m.isRead,
        })));
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
        const msg = await Message.create({ senderId: req.user.id, receiverId: receiver_id, content });
        res.json({ id: msg._id, message: 'Message sent' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// POST /api/mentor/announcements
router.post('/announcements', async (req, res) => {
    try {
        const { title, content } = req.body;
        const ann = await Announcement.create({ mentorId: req.user.id, title, content });
        res.json({ id: ann._id, message: 'Announcement posted' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// GET /api/mentor/announcements
router.get('/announcements', async (req, res) => {
    try {
        const ann = await Announcement.find({ mentorId: req.user.id }).sort({ created_at: -1 }).lean();
        res.json(ann.map(a => ({ ...a, id: a._id })));
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
        const remark = await PerformanceRemark.create({
            mentorId: req.user.id,
            menteeId: mentee_id,
            remarks,
            semester: semester || '',
            cgpa: cgpa || '',
        });
        res.json({ id: remark._id, message: 'Remarks added' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;
