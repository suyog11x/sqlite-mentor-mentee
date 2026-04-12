'use strict';
const express      = require('express');
const router       = express.Router();
const bcrypt       = require('bcryptjs');
const { db }       = require('../db');
const User         = require('../models/User');
const MentorMentee = require('../models/MentorMentee');
const Meeting      = require('../models/Meeting');
const Document     = require('../models/Document');
const Message      = require('../models/Message');
const ActivityLog  = require('../models/ActivityLog');
const xlsx         = require('xlsx');
const { authenticate, requireRole } = require('../middleware/auth');

router.use(authenticate, requireRole('admin'));

// GET /api/admin/dashboard
router.get('/dashboard', async (req, res) => {
    try {
        const totalMentors  = User.countDocuments({ role: 'mentor' });
        const totalMentees  = User.countDocuments({ role: 'mentee' });
        const totalMeetings = Meeting.countDocuments({});
        const totalDocs     = Document.countDocuments({});
        const totalMessages = Message.countDocuments({});

        // Recent activity with user info joined manually
        const recentRows = db.prepare(`
            SELECT al.*, u.name AS user_name, u.role AS user_role
            FROM activity_logs al
            LEFT JOIN users u ON al.user_id = u.id
            ORDER BY al.timestamp DESC LIMIT 20
        `).all();

        const recentActivity = recentRows.map(a => ({
            ...a,
            name:    a.user_name || 'Unknown',
            role:    a.user_role || '',
            user_id: a.user_id,
        }));

        res.json({
            totalUsers: totalMentors + totalMentees,
            totalMentors, totalMentees, totalMeetings, totalDocs, totalMessages,
            recentActivity,
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// GET /api/admin/users
router.get('/users', async (req, res) => {
    try {
        const users = db.prepare(`SELECT id, name, email, role, department, phone, rollno, year, created_at FROM users ORDER BY role, name`).all();
        res.json(users);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// POST /api/admin/users
router.post('/users', async (req, res) => {
    try {
        const { name, email, password, role, department, phone, rollno, year } = req.body;
        if (!name || !email || !password || !role) return res.status(400).json({ error: 'Name, email, password, role required' });
        const exists = User.findOne({ email: email.toLowerCase() });
        if (exists) return res.status(409).json({ error: 'Email already registered' });
        const hash = bcrypt.hashSync(password, 10);
        const user = User.create({ name, email: email.toLowerCase(), passwordHash: hash, role, department, phone, rollno, year });
        ActivityLog.create({ userId: req.user.id, action: 'create_user', details: `Created ${role}: ${email}` });
        res.json({ id: user.id, message: 'User created successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// PUT /api/admin/users/:id
router.put('/users/:id', async (req, res) => {
    try {
        const { name, email, department, phone, rollno, year, password } = req.body;
        const user = User.findById(req.params.id);
        if (!user) return res.status(404).json({ error: 'User not found' });
        if (name)       user.name         = name;
        if (email)      user.email        = email.toLowerCase();
        if (department) user.department   = department;
        if (phone)      user.phone        = phone;
        if (rollno)     user.rollno       = rollno;
        if (year)       user.year         = year;
        if (password)   user.password_hash = bcrypt.hashSync(password, 10);
        user.save();
        res.json({ message: 'User updated' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// DELETE /api/admin/users/:id
router.delete('/users/:id', async (req, res) => {
    try {
        const user = User.findById(req.params.id);
        if (!user) return res.status(404).json({ error: 'User not found' });
        if (user.role === 'admin') return res.status(403).json({ error: 'Cannot delete admin' });
        User.findByIdAndDelete(req.params.id);
        ActivityLog.create({ userId: req.user.id, action: 'delete_user', details: `Deleted ${user.role}: ${user.email}` });
        res.json({ message: 'User deleted' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// GET /api/admin/mappings
router.get('/mappings', async (req, res) => {
    try {
        const rows = db.prepare(`
            SELECT mm.id, mm.assigned_at,
                   um.name AS mentor_name, um.email AS mentor_email,
                   ue.name AS mentee_name, ue.email AS mentee_email,
                   ue.rollno, ue.year, ue.department
            FROM mentor_mentee mm
            JOIN users um ON mm.mentor_id = um.id
            JOIN users ue ON mm.mentee_id = ue.id
            ORDER BY um.name
        `).all();
        res.json(rows.map(m => ({
            id:           m.id,
            mentor_name:  m.mentor_name,
            mentor_email: m.mentor_email,
            mentee_name:  m.mentee_name,
            mentee_email: m.mentee_email,
            rollno:       m.rollno,
            year:         m.year,
            department:   m.department,
            assigned_at:  m.assigned_at,
        })));
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// POST /api/admin/mappings
router.post('/mappings', async (req, res) => {
    try {
        const { mentor_id, mentee_id } = req.body;
        const existing = MentorMentee.findOne({ menteeId: mentee_id });
        if (existing) {
            existing.mentor_id   = mentor_id;
            existing.assigned_at = new Date().toISOString();
            MentorMentee.save(existing);
            return res.json({ message: 'Mapping updated' });
        }
        MentorMentee.create({ mentorId: mentor_id, menteeId: mentee_id });
        ActivityLog.create({ userId: req.user.id, action: 'assign', details: `Assigned mentee ${mentee_id} to mentor ${mentor_id}` });
        res.json({ message: 'Mentee assigned to mentor' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// DELETE /api/admin/mappings/:id
router.delete('/mappings/:id', async (req, res) => {
    try {
        MentorMentee.findByIdAndDelete(req.params.id);
        res.json({ message: 'Mapping removed' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// GET /api/admin/mentors
router.get('/mentors', async (req, res) => {
    try {
        const mentors = db.prepare(`SELECT id, name, email, department FROM users WHERE role='mentor' ORDER BY name`).all();
        res.json(mentors);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// GET /api/admin/mentees-unassigned
router.get('/mentees-unassigned', async (req, res) => {
    try {
        const rows = db.prepare(`
            SELECT id, name, email, rollno, year, department
            FROM users
            WHERE role='mentee'
              AND id NOT IN (SELECT mentee_id FROM mentor_mentee)
            ORDER BY name
        `).all();
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// GET /api/admin/all-mentees
router.get('/all-mentees', async (req, res) => {
    try {
        const rows = db.prepare(`SELECT id, name, email, rollno, year, department FROM users WHERE role='mentee' ORDER BY name`).all();
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// GET /api/admin/documents
router.get('/documents', async (req, res) => {
    try {
        const rows = db.prepare(`
            SELECT d.id, d.type, d.original_name, d.filename, d.filepath, d.upload_date,
                   u.name AS mentee_name, u.year AS batch_year,
                   m.name AS mentor_name
            FROM documents d
            JOIN users u ON d.mentee_id = u.id
            LEFT JOIN mentor_mentee mm ON u.id = mm.mentee_id
            LEFT JOIN users m ON mm.mentor_id = m.id
            ORDER BY d.upload_date DESC
        `).all();
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// GET /api/admin/documents/export
router.get('/documents/export', async (req, res) => {
    try {
        // Fetch the aggregated data per mentee
        const rows = db.prepare(`
            SELECT u.name AS "Student Name", u.year AS "Batch Year", 
                   m.name AS "Mentor Name", 
                   GROUP_CONCAT(d.type, ', ') AS "Documents Uploaded"
            FROM documents d
            JOIN users u ON d.mentee_id = u.id
            LEFT JOIN mentor_mentee mm ON u.id = mm.mentee_id
            LEFT JOIN users m ON mm.mentor_id = m.id
            GROUP BY u.id
            ORDER BY u.name ASC
        `).all();

        // Create workbook and worksheet
        const wb = xlsx.utils.book_new();
        const ws = xlsx.utils.json_to_sheet(rows.length ? rows : [{ message: 'No documents found' }]);
        
        // Define column widths for better indentation and visibility
        ws['!cols'] = [
            { wch: 25 }, // Student Name
            { wch: 15 }, // Batch Year
            { wch: 25 }, // Mentor Name
            { wch: 60 }  // Documents Uploaded
        ];

        xlsx.utils.book_append_sheet(wb, ws, 'Documents Report');

        // Write to buffer
        const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });

        res.setHeader('Content-Disposition', 'attachment; filename="documents_report.xlsx"');
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.send(buffer);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error during export' });
    }
});

module.exports = router;
