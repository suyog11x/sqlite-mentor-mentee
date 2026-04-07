const express = require('express');
const router = express.Router();
const path = require('path');
const multer = require('multer');
const User = require('../models/User');
const MentorMentee = require('../models/MentorMentee');
const Document = require('../models/Document');
const Meeting = require('../models/Meeting');
const Message = require('../models/Message');
const Announcement = require('../models/Announcement');
const PerformanceRemark = require('../models/PerformanceRemark');
const ActivityLog = require('../models/ActivityLog');
const { authenticate, requireRole } = require('../middleware/auth');

// Multer config (unchanged)
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, path.join(__dirname, '../../uploads')),
    filename: (req, file, cb) => {
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
        const mapping = await MentorMentee.findOne({ menteeId })
            .populate('mentorId', 'id name email department phone')
            .lean();
        const mentor = mapping ? { ...mapping.mentorId, id: mapping.mentorId?._id } : null;

        const [docs, upcomingMeetings, unreadMessages, meetings, remarks, announcements] = await Promise.all([
            Document.countDocuments({ menteeId }),
            Meeting.countDocuments({ menteeId, status: 'scheduled', scheduledAt: { $gte: new Date() } }),
            Message.countDocuments({ receiverId: menteeId, isRead: false }),
            Meeting.find({ menteeId }).sort({ scheduledAt: -1 }).limit(5).lean(),
            PerformanceRemark.find({ menteeId }).sort({ created_at: -1 }).limit(3).lean(),
            mentor ? Announcement.find({ mentorId: mentor.id }).sort({ created_at: -1 }).limit(5).lean() : [],
        ]);

        res.json({
            mentor,
            uploadedDocs: docs,
            upcomingMeetings,
            unreadMessages,
            meetings:      meetings.map(m => ({ ...m, id: m._id, scheduled_at: m.scheduledAt })),
            remarks:       remarks.map(r => ({ ...r, id: r._id })),
            announcements: announcements.map(a => ({ ...a, id: a._id })),
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// GET /api/mentee/documents
router.get('/documents', async (req, res) => {
    try {
        const docs = await Document.find({ menteeId: req.user.id }).sort({ uploadDate: -1 }).lean();
        res.json(docs.map(d => ({
            ...d,
            id: d._id,
            original_name: d.originalName,
            upload_date: d.uploadDate,
        })));
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
        const doc = await Document.create({
            menteeId: req.user.id,
            type,
            originalName: req.file.originalname,
            filename: req.file.filename,
            filepath: req.file.path,
        });
        await ActivityLog.create({ userId: req.user.id, action: 'upload', details: `Uploaded: ${type}` });
        res.json({ id: doc._id, message: 'Document uploaded successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// DELETE /api/mentee/documents/:id
router.delete('/documents/:id', async (req, res) => {
    try {
        const doc = await Document.findOne({ _id: req.params.id, menteeId: req.user.id });
        if (!doc) return res.status(404).json({ error: 'Document not found' });
        const fs = require('fs');
        try { fs.unlinkSync(doc.filepath); } catch (e) {}
        await Document.findByIdAndDelete(req.params.id);
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
        const mapping = await MentorMentee.findOne({ menteeId }).select('mentorId').lean();
        if (!mapping) return res.json([]);
        const mentorId = mapping.mentorId;
        const msgs = await Message.find({
            $or: [
                { senderId: menteeId, receiverId: mentorId },
                { senderId: mentorId, receiverId: menteeId },
            ],
        }).populate('senderId', 'name').sort({ timestamp: 1 }).lean();
        await Message.updateMany({ receiverId: menteeId, senderId: mentorId, isRead: false }, { isRead: true });
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

// POST /api/mentee/messages
router.post('/messages', async (req, res) => {
    try {
        const { content } = req.body;
        const mapping = await MentorMentee.findOne({ menteeId: req.user.id }).select('mentorId').lean();
        if (!mapping) return res.status(400).json({ error: 'No mentor assigned yet' });
        if (!content) return res.status(400).json({ error: 'Content required' });
        const msg = await Message.create({ senderId: req.user.id, receiverId: mapping.mentorId, content });
        res.json({ id: msg._id, message: 'Message sent' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// GET /api/mentee/profile
router.get('/profile', async (req, res) => {
    try {
        const user = await User.findById(req.user.id)
            .select('name email department phone rollno year created_at')
            .lean();
        if (!user) return res.status(404).json({ error: 'User not found' });
        res.json({ ...user, id: user._id });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// GET /api/mentee/feedback
router.get('/feedback', async (req, res) => {
    try {
        const remarks = await PerformanceRemark.find({ menteeId: req.user.id })
            .populate('mentorId', 'name')
            .sort({ created_at: -1 })
            .lean();
        res.json(remarks.map(r => ({
            ...r,
            id: r._id,
            mentor_name: r.mentorId?.name,
        })));
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;
