const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const User = require('../models/User');
const MentorMentee = require('../models/MentorMentee');
const Meeting = require('../models/Meeting');
const Document = require('../models/Document');
const Message = require('../models/Message');
const ActivityLog = require('../models/ActivityLog');
const { authenticate, requireRole } = require('../middleware/auth');

router.use(authenticate, requireRole('admin'));

// Helper to parse ObjectId safely
function toId(val) {
    try { return new mongoose.Types.ObjectId(val); } catch { return null; }
}

// GET /api/admin/dashboard
router.get('/dashboard', async (req, res) => {
    try {
        const [totalMentors, totalMentees, totalMeetings, totalDocs, totalMessages, recentActivity] = await Promise.all([
            User.countDocuments({ role: 'mentor' }),
            User.countDocuments({ role: 'mentee' }),
            Meeting.countDocuments(),
            Document.countDocuments(),
            Message.countDocuments(),
            ActivityLog.find().sort({ timestamp: -1 }).limit(20).populate('userId', 'name role').lean(),
        ]);
        const totalUsers = totalMentors + totalMentees;
        const activity = recentActivity.map(a => ({
            ...a,
            name: a.userId?.name || 'Unknown',
            role: a.userId?.role || '',
            user_id: a.userId?._id,
        }));
        res.json({ totalUsers, totalMentors, totalMentees, totalMeetings, totalDocs, totalMessages, recentActivity: activity });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// GET /api/admin/users
router.get('/users', async (req, res) => {
    try {
        const users = await User.find().select('-passwordHash').sort({ role: 1, name: 1 }).lean();
        // Map _id → id for frontend compatibility
        res.json(users.map(u => ({ ...u, id: u._id })));
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// POST /api/admin/users — create user
router.post('/users', async (req, res) => {
    try {
        const { name, email, password, role, department, phone, rollno, year } = req.body;
        if (!name || !email || !password || !role) return res.status(400).json({ error: 'Name, email, password, role required' });
        const exists = await User.findOne({ email: email.toLowerCase() });
        if (exists) return res.status(409).json({ error: 'Email already registered' });
        const hash = bcrypt.hashSync(password, 10);
        const user = await User.create({ name, email: email.toLowerCase(), passwordHash: hash, role, department, phone, rollno, year });
        await ActivityLog.create({ userId: req.user.id, action: 'create_user', details: `Created ${role}: ${email}` });
        res.json({ id: user._id, message: 'User created successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// PUT /api/admin/users/:id
router.put('/users/:id', async (req, res) => {
    try {
        const { name, email, department, phone, rollno, year, password } = req.body;
        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ error: 'User not found' });
        if (name)       user.name       = name;
        if (email)      user.email      = email.toLowerCase();
        if (department) user.department = department;
        if (phone)      user.phone      = phone;
        if (rollno)     user.rollno     = rollno;
        if (year)       user.year       = year;
        if (password)   user.passwordHash = bcrypt.hashSync(password, 10);
        await user.save();
        res.json({ message: 'User updated' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// DELETE /api/admin/users/:id
router.delete('/users/:id', async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ error: 'User not found' });
        if (user.role === 'admin') return res.status(403).json({ error: 'Cannot delete admin' });
        await User.findByIdAndDelete(req.params.id);
        await ActivityLog.create({ userId: req.user.id, action: 'delete_user', details: `Deleted ${user.role}: ${user.email}` });
        res.json({ message: 'User deleted' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// GET /api/admin/mappings
router.get('/mappings', async (req, res) => {
    try {
        const mappings = await MentorMentee.find()
            .populate('mentorId', 'name email')
            .populate('menteeId', 'name email rollno year department')
            .sort({ 'mentorId.name': 1 })
            .lean();
        res.json(mappings.map(m => ({
            id: m._id,
            mentor_name:  m.mentorId?.name,
            mentor_email: m.mentorId?.email,
            mentee_name:  m.menteeId?.name,
            mentee_email: m.menteeId?.email,
            rollno:       m.menteeId?.rollno,
            year:         m.menteeId?.year,
            department:   m.menteeId?.department,
            assigned_at:  m.assignedAt,
        })));
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// POST /api/admin/mappings — assign
router.post('/mappings', async (req, res) => {
    try {
        const { mentor_id, mentee_id } = req.body;
        const existing = await MentorMentee.findOne({ menteeId: mentee_id });
        if (existing) {
            existing.mentorId = mentor_id;
            existing.assignedAt = new Date();
            await existing.save();
            return res.json({ message: 'Mapping updated' });
        }
        await MentorMentee.create({ mentorId: mentor_id, menteeId: mentee_id });
        await ActivityLog.create({ userId: req.user.id, action: 'assign', details: `Assigned mentee ${mentee_id} to mentor ${mentor_id}` });
        res.json({ message: 'Mentee assigned to mentor' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// DELETE /api/admin/mappings/:id
router.delete('/mappings/:id', async (req, res) => {
    try {
        await MentorMentee.findByIdAndDelete(req.params.id);
        res.json({ message: 'Mapping removed' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// GET /api/admin/mentors
router.get('/mentors', async (req, res) => {
    try {
        const mentors = await User.find({ role: 'mentor' }).select('name email department').sort({ name: 1 }).lean();
        res.json(mentors.map(m => ({ ...m, id: m._id })));
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// GET /api/admin/mentees-unassigned
router.get('/mentees-unassigned', async (req, res) => {
    try {
        const assigned = (await MentorMentee.find().select('menteeId').lean()).map(m => m.menteeId);
        const mentees = await User.find({ role: 'mentee', _id: { $nin: assigned } })
            .select('name email rollno year department').sort({ name: 1 }).lean();
        res.json(mentees.map(m => ({ ...m, id: m._id })));
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// GET /api/admin/all-mentees
router.get('/all-mentees', async (req, res) => {
    try {
        const mentees = await User.find({ role: 'mentee' }).select('name email rollno year department').sort({ name: 1 }).lean();
        res.json(mentees.map(m => ({ ...m, id: m._id })));
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;
