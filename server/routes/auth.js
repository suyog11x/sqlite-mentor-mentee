'use strict';
const express     = require('express');
const router      = express.Router();
const bcrypt      = require('bcryptjs');
const jwt         = require('jsonwebtoken');
const User        = require('../models/User');
const ActivityLog = require('../models/ActivityLog');
const { authenticate } = require('../middleware/auth');

const JWT_SECRET = process.env.JWT_SECRET || 'mentor_mentee_secret';

// POST /api/auth/login
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

        const user = User.findOne({ email: email.trim().toLowerCase() });
        if (!user) return res.status(401).json({ error: 'No account found with this email address.' });

        if (!bcrypt.compareSync(password, user.password_hash))
            return res.status(401).json({ error: 'Incorrect password. Please try again.' });

        const token = jwt.sign(
            { id: user.id, name: user.name, email: user.email, role: user.role, department: user.department },
            JWT_SECRET,
            { expiresIn: '8h' }
        );

        ActivityLog.create({ userId: user.id, action: 'login', details: `User logged in: ${user.email}` });

        res.json({
            token,
            user: {
                id:         user.id,
                name:       user.name,
                email:      user.email,
                role:       user.role,
                department: user.department,
                rollno:     user.rollno,
                year:       user.year,
            },
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// POST /api/auth/change-password
router.post('/change-password', authenticate, async (req, res) => {
    try {
        const { oldPassword, newPassword } = req.body;
        const user = User.findById(req.user.id);
        if (!user) return res.status(404).json({ error: 'User not found' });
        if (!bcrypt.compareSync(oldPassword, user.password_hash))
            return res.status(400).json({ error: 'Old password is incorrect' });
        user.password_hash = bcrypt.hashSync(newPassword, 10);
        user.save();
        res.json({ message: 'Password changed successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;
